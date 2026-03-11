import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ClubService } from "../club/club.service";
import type { GameRuleConfig } from "@mahjong/shared";
import { DEFAULT_RULES } from "@mahjong/shared";

@Injectable()
export class GameService {
  constructor(
    private prisma: PrismaService,
    private clubService: ClubService
  ) {}

  async createRoom(
    userId: string,
    clubId: string,
    name: string,
    rules?: Partial<GameRuleConfig>
  ) {
    await this.clubService.requireMembership(clubId, userId);

    // Merge: DEFAULT_RULES < club defaults < room overrides
    const club = await this.prisma.club.findUnique({ where: { id: clubId } });
    const clubDefaults = ((club as any)?.defaultRules as Partial<GameRuleConfig>) || {};
    const fullRules: GameRuleConfig = {
      ...DEFAULT_RULES,
      ...clubDefaults,
      ...rules,
    };

    const room = await this.prisma.gameRoom.create({
      data: {
        clubId,
        name,
        rules: fullRules as any,
        participants: {
          create: {
            userId,
            seat: 0,
          },
        },
      },
      include: { participants: { include: { user: true } } },
    });

    return room;
  }

  async joinRoom(userId: string, roomId: string) {
    const room = await this.prisma.gameRoom.findUnique({
      where: { id: roomId },
      include: { participants: true },
    });
    if (!room) throw new NotFoundException("Room not found");
    if (room.status !== "WAITING") throw new BadRequestException("Game already started");
    if (room.participants.length >= 4) throw new BadRequestException("Room is full");

    await this.clubService.requireMembership(room.clubId, userId);

    const existing = room.participants.find((p) => p.userId === userId);
    if (existing) return room;

    const nextSeat = room.participants.length;

    await this.prisma.gameParticipant.create({
      data: { roomId, userId, seat: nextSeat },
    });

    return this.getRoom(roomId);
  }

  async setReady(userId: string, roomId: string, isReady: boolean) {
    const participant = await this.prisma.gameParticipant.findUnique({
      where: { roomId_userId: { roomId, userId } },
    });
    if (!participant) throw new NotFoundException("Not in this room");

    await this.prisma.gameParticipant.update({
      where: { id: participant.id },
      data: { isReady },
    });

    return this.getRoom(roomId);
  }

  async getRoom(roomId: string) {
    const room = await this.prisma.gameRoom.findUnique({
      where: { id: roomId },
      include: {
        participants: {
          include: {
            user: { select: { id: true, username: true, displayName: true } },
          },
          orderBy: { seat: "asc" },
        },
      },
    });
    if (!room) throw new NotFoundException("Room not found");
    return room;
  }

  async getRoomsForClub(clubId: string, userId: string) {
    await this.clubService.requireMembership(clubId, userId);

    return this.prisma.gameRoom.findMany({
      where: { clubId, status: { in: ["WAITING", "PLAYING"] } },
      include: {
        participants: {
          include: {
            user: { select: { id: true, displayName: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async startGame(roomId: string) {
    await this.prisma.gameRoom.update({
      where: { id: roomId },
      data: { status: "PLAYING" },
    });
  }

  async finishGame(roomId: string) {
    await this.prisma.gameRoom.update({
      where: { id: roomId },
      data: { status: "FINISHED" },
    });
  }

  async getClubForRoom(roomId: string) {
    const room = await this.prisma.gameRoom.findUnique({
      where: { id: roomId },
      select: { clubId: true },
    });
    if (!room) return null;
    return this.prisma.club.findUnique({ where: { id: room.clubId } });
  }

  async saveEventLog(
    roomId: string,
    sequence: number,
    eventType: string,
    payload: object
  ) {
    await this.prisma.gameEventLog.create({
      data: { roomId, sequence, eventType, payload: payload as any },
    });
  }

  async saveGameResult(
    roomId: string,
    roundNumber: number,
    resultData: object,
    scoreChanges: object
  ) {
    await this.prisma.gameResult.create({
      data: {
        roomId,
        roundNumber,
        resultData: resultData as any,
        scoreChanges: scoreChanges as any,
      },
    });
  }

  /** Get all event logs for a finished game room (for replay) */
  async getGameEventLog(roomId: string, userId: string) {
    const room = await this.prisma.gameRoom.findUnique({
      where: { id: roomId },
      include: { participants: true },
    });
    if (!room) throw new NotFoundException("Room not found");
    if (room.status !== "FINISHED") throw new BadRequestException("Game is not finished");

    const wasParticipant = room.participants.some((p) => p.userId === userId);
    if (!wasParticipant) throw new BadRequestException("Not a participant of this game");

    const events = await this.prisma.gameEventLog.findMany({
      where: { roomId },
      orderBy: { sequence: "asc" },
    });

    return {
      roomId: room.id,
      rules: room.rules,
      players: room.participants.map((p) => ({
        userId: p.userId,
        seat: p.seat,
      })),
      events: events.map((e) => ({
        sequence: e.sequence,
        eventType: e.eventType,
        payload: e.payload,
        createdAt: e.createdAt,
      })),
    };
  }

  /** Get finished games that a user participated in (for a specific club) */
  async getPlayerGameHistory(userId: string, clubId: string, limit = 20, offset = 0) {
    await this.clubService.requireMembership(clubId, userId);

    const rooms = await this.prisma.gameRoom.findMany({
      where: {
        clubId,
        status: "FINISHED",
        participants: { some: { userId } },
      },
      include: {
        participants: {
          include: {
            user: { select: { id: true, username: true, displayName: true } },
          },
          orderBy: { seat: "asc" },
        },
        results: {
          orderBy: { roundNumber: "desc" },
          take: 1, // last round = final result
        },
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
      skip: offset,
    });

    return rooms.map((room) => ({
      roomId: room.id,
      roomName: room.name,
      finishedAt: room.updatedAt,
      players: room.participants.map((p) => ({
        userId: p.userId,
        displayName: p.user.displayName,
        seat: p.seat,
      })),
      finalScores: room.results[0]?.scoreChanges ?? null,
    }));
  }

  /** Aggregate stats for a player within a club */
  async getPlayerStats(userId: string, clubId: string) {
    await this.clubService.requireMembership(clubId, userId);

    // Count finished games
    const totalGames = await this.prisma.gameRoom.count({
      where: {
        clubId,
        status: "FINISHED",
        participants: { some: { userId } },
      },
    });

    // Get all finished game results for this player
    const finishedRooms = await this.prisma.gameRoom.findMany({
      where: {
        clubId,
        status: "FINISHED",
        participants: { some: { userId } },
      },
      include: {
        participants: { where: { userId }, select: { seat: true } },
        results: {
          orderBy: { roundNumber: "desc" },
          take: 1,
        },
      },
    });

    let wins = 0;
    const placements = [0, 0, 0, 0]; // 1st, 2nd, 3rd, 4th
    let totalScore = 0;

    for (const room of finishedRooms) {
      const seat = room.participants[0]?.seat;
      const scores = room.results[0]?.scoreChanges as Record<string, number> | null;
      if (seat === undefined || !scores) continue;

      const myScore = scores[String(seat)] ?? 0;
      totalScore += myScore;

      // Determine placement
      const allScores = Object.entries(scores)
        .map(([s, sc]) => ({ seat: Number(s), score: sc as number }))
        .sort((a, b) => b.score - a.score);

      const placement = allScores.findIndex((s) => s.seat === seat);
      if (placement >= 0 && placement < 4) {
        placements[placement]++;
      }
      if (placement === 0) wins++;
    }

    // Get point balance
    const pointTxs = await this.prisma.pointTransaction.findMany({
      where: { userId, clubId },
      orderBy: { createdAt: "desc" },
      take: 1,
    });
    const currentBalance = pointTxs[0]?.balanceAfter ?? 0;

    return {
      totalGames,
      wins,
      placements,
      avgScore: totalGames > 0 ? Math.round(totalScore / totalGames) : 0,
      winRate: totalGames > 0 ? Math.round((wins / totalGames) * 1000) / 10 : 0,
      currentBalance,
    };
  }

  /** Club leaderboard: top players by total score */
  async getClubLeaderboard(clubId: string, userId: string, limit = 20) {
    await this.clubService.requireMembership(clubId, userId);

    const finishedRooms = await this.prisma.gameRoom.findMany({
      where: { clubId, status: "FINISHED" },
      include: {
        participants: {
          include: {
            user: { select: { id: true, displayName: true } },
          },
        },
        results: {
          orderBy: { roundNumber: "desc" },
          take: 1,
        },
      },
    });

    const playerStats = new Map<string, { displayName: string; totalScore: number; games: number; wins: number }>();

    for (const room of finishedRooms) {
      const scores = room.results[0]?.scoreChanges as Record<string, number> | null;
      if (!scores) continue;

      const allScores = Object.entries(scores)
        .map(([s, sc]) => ({ seat: Number(s), score: sc as number }))
        .sort((a, b) => b.score - a.score);

      for (const p of room.participants) {
        const score = scores[String(p.seat)] ?? 0;
        const existing = playerStats.get(p.userId) ?? {
          displayName: p.user.displayName,
          totalScore: 0,
          games: 0,
          wins: 0,
        };
        existing.totalScore += score;
        existing.games++;
        if (allScores[0]?.seat === p.seat) existing.wins++;
        playerStats.set(p.userId, existing);
      }
    }

    return Array.from(playerStats.entries())
      .map(([userId, stats]) => ({ userId, ...stats }))
      .sort((a, b) => b.totalScore - a.totalScore)
      .slice(0, limit);
  }
}
