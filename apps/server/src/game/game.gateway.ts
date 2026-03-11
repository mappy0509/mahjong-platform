import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from "@nestjs/websockets";
import { Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Server, Socket } from "socket.io";
import { WS_EVENTS, haversineDistanceKm } from "@mahjong/shared";
import type { SeatIndex, GameActionPayload, PlayerGameView, GameFinalResult, StampSendPayload } from "@mahjong/shared";
import type { GameEvent } from "@mahjong/engine";
import { GameService } from "./game.service";
import { GameSessionService } from "./game-session.service";
import { RedisService } from "../redis/redis.service";
import { PointService } from "../point/point.service";

interface AuthenticatedSocket extends Socket {
  data: { userId: string; username: string; ip: string };
}

function extractIp(client: Socket): string {
  const forwarded = client.handshake.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  return client.handshake.address || "unknown";
}

@WebSocketGateway({
  cors: { origin: "*" },
  namespace: "/game",
})
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(GameGateway.name);
  // Track which room each socket is in
  private socketRooms = new Map<string, string>();
  // Track IPs per room for duplicate detection: roomId -> (userId -> ip)
  private roomIps = new Map<string, Map<string, string>>();
  // Track GPS locations per room: roomId -> (userId -> {lat, lng})
  private roomLocations = new Map<string, Map<string, { lat: number; lng: number }>>();

  constructor(
    private jwtService: JwtService,
    private gameService: GameService,
    private sessionService: GameSessionService,
    private redis: RedisService,
    private pointService: PointService
  ) {}

  // ===== Connection lifecycle =====

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace("Bearer ", "");

      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token);
      const ip = extractIp(client);
      client.data = { userId: payload.sub, username: payload.username, ip };
      this.logger.log(`Client connected: ${payload.username} (${ip})`);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    const roomId = this.socketRooms.get(client.id);
    if (roomId && client.data?.userId) {
      this.redis.removePlayer(roomId, client.data.userId);

      // Notify others
      this.server.to(roomId).emit(WS_EVENTS.PLAYER_DISCONNECTED, {
        userId: client.data.userId,
      });

      // Track disconnect and set up auto-action timer
      if (this.sessionService.hasSession(roomId)) {
        this.sessionService.handleDisconnect(roomId, client.data.userId);
      }

      // Clean up IP tracking
      const ipMap = this.roomIps.get(roomId);
      if (ipMap) {
        ipMap.delete(client.data.userId);
        if (ipMap.size === 0) this.roomIps.delete(roomId);
      }

      this.socketRooms.delete(client.id);
    }
  }

  // ===== Room events =====

  @SubscribeMessage(WS_EVENTS.ROOM_JOIN)
  async handleJoinRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: string; location?: { lat: number; lng: number } }
  ) {
    const { roomId, location } = data;
    const userId = client.data.userId;

    try {
      const room = await this.gameService.getRoom(roomId);

      // GPS distance check
      const club = await this.gameService.getClubForRoom(roomId);
      const gpsRestrictionKm = (club as any)?.gpsRestrictionKm ?? 0;
      if (gpsRestrictionKm > 0) {
        if (!location) {
          client.emit(WS_EVENTS.GAME_ERROR, {
            message: "このクラブではGPS位置情報が必要です",
          });
          return;
        }
        if (!this.roomLocations.has(roomId)) {
          this.roomLocations.set(roomId, new Map());
        }
        const locMap = this.roomLocations.get(roomId)!;
        for (const [existingUserId, existingLoc] of locMap) {
          if (existingUserId === userId) continue;
          const dist = haversineDistanceKm(
            location.lat,
            location.lng,
            existingLoc.lat,
            existingLoc.lng
          );
          if (dist > gpsRestrictionKm) {
            client.emit(WS_EVENTS.GAME_ERROR, {
              message: `プレイヤー間の距離が${gpsRestrictionKm}km以内である必要があります（現在: ${dist.toFixed(1)}km）`,
            });
            return;
          }
        }
        locMap.set(userId, location);
      }

      // IP duplicate check: block if another user already joined from this IP
      const clientIp = client.data.ip;
      if (!this.roomIps.has(roomId)) {
        this.roomIps.set(roomId, new Map());
      }
      const ipMap = this.roomIps.get(roomId)!;
      for (const [existingUserId, existingIp] of ipMap) {
        if (existingIp === clientIp && existingUserId !== userId) {
          client.emit(WS_EVENTS.GAME_ERROR, {
            message: "同一IPアドレスからの重複入室は制限されています",
          });
          this.logger.warn(
            `IP duplicate blocked: ${userId} (${clientIp}) in room ${roomId}`
          );
          return;
        }
      }
      ipMap.set(userId, clientIp);

      // Join Socket.IO room
      client.join(roomId);
      this.socketRooms.set(client.id, roomId);
      await this.redis.setPlayerConnected(roomId, userId, client.id);

      // Check for reconnection to active game
      if (this.sessionService.hasSession(roomId)) {
        const view = this.sessionService.handleReconnect(roomId, userId);
        if (view) {
          // Send full game state immediately for seamless reconnection
          client.emit(WS_EVENTS.GAME_STATE, view);
          this.server.to(roomId).emit(WS_EVENTS.PLAYER_RECONNECTED, { userId });
          this.logger.log(`Player ${userId} reconnected to room ${roomId}`);
          return;
        }
      }

      // Send room info
      this.server.to(roomId).emit(WS_EVENTS.ROOM_UPDATED, room);
    } catch (err) {
      client.emit(WS_EVENTS.GAME_ERROR, { message: "Failed to join room" });
    }
  }

  @SubscribeMessage(WS_EVENTS.ROOM_READY)
  async handleReady(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { roomId: string }
  ) {
    const { roomId } = data;
    const userId = client.data.userId;

    try {
      const room = await this.gameService.setReady(userId, roomId, true);
      this.server.to(roomId).emit(WS_EVENTS.ROOM_UPDATED, room);

      // Check if all 4 players are ready
      const allReady =
        room.participants.length === 4 &&
        room.participants.every((p) => p.isReady);

      if (allReady) {
        await this.startGame(roomId, room);
      }
    } catch (err) {
      client.emit(WS_EVENTS.GAME_ERROR, { message: "Failed to ready up" });
    }
  }

  // ===== Game actions =====

  @SubscribeMessage(WS_EVENTS.GAME_ACTION)
  async handleGameAction(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: GameActionPayload
  ) {
    const userId = client.data.userId;

    try {
      const result = await this.sessionService.processAction(
        data.roomId,
        userId,
        data.action,
        data.tileId,
        data.tiles
      );

      // Send personalized views to each player
      await this.broadcastViews(data.roomId, result.views);

      // Save events to DB
      await this.saveEvents(data.roomId, result.events);

      // Handle round/game end events
      await this.handlePostGameEvents(data.roomId, result.events);
    } catch (err) {
      client.emit(WS_EVENTS.GAME_ERROR, {
        message: err instanceof Error ? err.message : "Action failed",
      });
    }
  }

  // ===== Stamps =====

  @SubscribeMessage(WS_EVENTS.STAMP_SEND)
  async handleStamp(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: StampSendPayload
  ) {
    const userId = client.data.userId;
    const { roomId, stampId } = data;

    // Get seat for this player
    const seat = this.sessionService.getSeatForUserId(roomId, userId);
    if (seat === undefined) return;

    const playerName = client.data.username;

    // Broadcast stamp to all players in the room (including sender)
    this.server.to(roomId).emit(WS_EVENTS.STAMP_RECEIVED, {
      seat,
      stampId,
      playerName,
    });
  }

  // ===== Private: Game start =====

  private async startGame(roomId: string, room: any) {
    const players = room.participants.map((p: any) => ({
      userId: p.userId,
      name: p.user.displayName,
      seat: p.seat as SeatIndex,
    }));

    const rules = room.rules as any;

    // Create session with auto-action callback for timer-based actions
    const events = await this.sessionService.createSession(
      roomId,
      players,
      rules,
      (autoRoomId, autoEvents, autoViews) => {
        this.onAutoAction(autoRoomId, autoEvents, autoViews);
      }
    );

    await this.gameService.startGame(roomId);

    // Send initial state to each player
    const views = this.sessionService.getAllPlayerViews(roomId);
    for (const [uid, view] of views) {
      const socketId = await this.redis.getPlayerSocket(roomId, uid);
      if (socketId) {
        this.server.to(socketId).emit(WS_EVENTS.GAME_STARTED, view);
      }
    }

    // Save initial events
    await this.saveEvents(roomId, events);
  }

  // ===== Private: Auto-action callback (turn timeout, claim timeout, disconnect) =====

  private async onAutoAction(
    roomId: string,
    events: GameEvent[],
    views: Map<string, PlayerGameView>
  ) {
    try {
      // Broadcast updated views to all connected players
      await this.broadcastViews(roomId, views);

      // Save events to DB
      await this.saveEvents(roomId, events);

      // Handle round/game end
      await this.handlePostGameEvents(roomId, events);
    } catch (err) {
      this.logger.error(`Failed to handle auto-action in room ${roomId}: ${err}`);
    }
  }

  // ===== Private: Post-game event handling =====

  private async handlePostGameEvents(roomId: string, events: GameEvent[]) {
    // Check for round-ending events
    for (const event of events) {
      if (event.type === "TSUMO" || event.type === "RON" || event.type === "DRAW_ROUND") {
        // Broadcast round result
        this.server.to(roomId).emit(WS_EVENTS.GAME_ROUND_RESULT, event);

        // Save game result to DB
        const state = this.sessionService.getState(roomId);
        if (state) {
          const scoreChanges = (event as any).scoreChanges ?? {};
          await this.gameService.saveGameResult(
            roomId,
            state.roundNumber,
            event as any,
            scoreChanges
          );
        }
      }

      if (event.type === "GAME_END") {
        await this.handleGameEnd(roomId, event);
      }
    }
  }

  private async handleGameEnd(roomId: string, _event: GameEvent & { type: "GAME_END" }) {
    this.logger.log(`Game ended in room ${roomId}`);

    const state = this.sessionService.getState(roomId);
    if (!state) return;

    // Build final result with uma calculation
    const finalResult = this.buildFinalResult(roomId, state.scores, state.rules.uma);

    // Broadcast final result
    this.server.to(roomId).emit(WS_EVENTS.GAME_FINAL_RESULT, finalResult);

    // Mark game as finished in DB
    await this.gameService.finishGame(roomId);

    // Process point transactions for club economy
    await this.processPointSettlement(roomId, finalResult);

    // Clean up session after a delay (let clients receive the final result)
    setTimeout(() => {
      this.sessionService.removeSession(roomId);
      this.redis.deleteGameState(roomId).catch(() => {});
    }, 10000);
  }

  /**
   * Process point settlement: record game results and collect fee.
   */
  private async processPointSettlement(roomId: string, finalResult: GameFinalResult) {
    try {
      const room = await this.gameService.getRoom(roomId);
      const clubId = room.clubId;

      // Fetch club fee setting
      const club = await this.gameService.getClubForRoom(roomId);
      const feePercent = (club as any)?.feePercent ?? 0;

      // Build per-player point changes from rankings
      const playerResults: { userId: string; amount: number }[] = [];
      let totalFee = 0;

      for (const ranking of finalResult.rankings) {
        if (!ranking.userId) continue;

        let points = ranking.totalPoints;

        // Deduct fee from winners (positive totalPoints only)
        if (feePercent > 0 && points > 0) {
          const fee = Math.floor(points * feePercent / 100);
          totalFee += fee;
          points -= fee;
        }

        playerResults.push({ userId: ranking.userId, amount: points });
      }

      // Record game result transactions for all players
      await this.pointService.recordGameResult(clubId, playerResults, roomId);

      // Record fee as GAME_FEE to the club owner
      if (totalFee > 0 && club?.ownerId) {
        await this.pointService.addTransaction(
          club.ownerId,
          clubId,
          "GAME_FEE" as any,
          totalFee,
          roomId,
          `Game fee from room ${roomId}`
        );
      }

      this.logger.log(
        `Point settlement complete for room ${roomId}: ${playerResults.length} players, fee=${totalFee}`
      );
    } catch (err) {
      this.logger.error(`Failed to process point settlement for room ${roomId}: ${err}`);
    }
  }

  private buildFinalResult(
    roomId: string,
    scores: [number, number, number, number],
    uma: [number, number, number, number]
  ): GameFinalResult {
    // Sort players by score (descending) for ranking
    const indexed = scores.map((score, seat) => ({ seat: seat as SeatIndex, score }));
    indexed.sort((a, b) => b.score - a.score);

    const rankings = indexed.map((entry, rank) => {
      const userId = this.sessionService.getUserIdForSeat(roomId, entry.seat) ?? "";
      const umaScore = uma[rank] ?? 0;
      return {
        seat: entry.seat,
        userId,
        name: "", // Will be filled by client from their cached player data
        finalScore: entry.score,
        umaScore,
        totalPoints: entry.score - 25000 + umaScore * 1000,
      };
    });

    return { rankings };
  }

  // ===== Private: Helpers =====

  private async broadcastViews(roomId: string, views: Map<string, PlayerGameView>) {
    for (const [uid, view] of views) {
      const socketId = await this.redis.getPlayerSocket(roomId, uid);
      if (socketId) {
        this.server.to(socketId).emit(WS_EVENTS.GAME_STATE, view);
      }
    }
  }

  private async saveEvents(roomId: string, events: GameEvent[]) {
    for (const event of events) {
      const state = this.sessionService.getState(roomId);
      if (state) {
        try {
          await this.gameService.saveEventLog(
            roomId,
            state.eventSequence,
            event.type,
            event as any
          );
        } catch (err) {
          this.logger.warn(`Failed to save event log: ${err}`);
        }
      }
    }
  }
}
