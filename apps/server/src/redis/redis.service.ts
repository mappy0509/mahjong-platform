import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

@Injectable()
export class RedisService implements OnModuleDestroy {
  private client: Redis;

  constructor(private config: ConfigService) {
    const url: string = config.get("REDIS_URL") || "redis://localhost:6379";
    this.client = new Redis(url);
  }

  getClient(): Redis {
    return this.client;
  }

  // ===== Game State Cache =====

  async setGameState(roomId: string, state: object): Promise<void> {
    await this.client.set(
      `game:${roomId}:state`,
      JSON.stringify(state),
      "EX",
      3600 // 1 hour TTL
    );
  }

  async getGameState(roomId: string): Promise<object | null> {
    const data = await this.client.get(`game:${roomId}:state`);
    return data ? JSON.parse(data) : null;
  }

  async deleteGameState(roomId: string): Promise<void> {
    await this.client.del(`game:${roomId}:state`);
  }

  // ===== Player Connection Tracking =====

  async setPlayerConnected(
    roomId: string,
    userId: string,
    socketId: string
  ): Promise<void> {
    await this.client.hset(`game:${roomId}:players`, userId, socketId);
  }

  async removePlayer(roomId: string, userId: string): Promise<void> {
    await this.client.hdel(`game:${roomId}:players`, userId);
  }

  async getPlayerSocket(
    roomId: string,
    userId: string
  ): Promise<string | null> {
    return this.client.hget(`game:${roomId}:players`, userId);
  }

  async getAllPlayers(roomId: string): Promise<Record<string, string>> {
    return this.client.hgetall(`game:${roomId}:players`);
  }

  // ===== Point Balance Cache =====

  async setPointBalance(
    userId: string,
    clubId: string,
    balance: number
  ): Promise<void> {
    await this.client.set(
      `points:${clubId}:${userId}`,
      balance.toString(),
      "EX",
      300 // 5 min TTL
    );
  }

  async getPointBalance(
    userId: string,
    clubId: string
  ): Promise<number | null> {
    const val = await this.client.get(`points:${clubId}:${userId}`);
    return val !== null ? parseInt(val, 10) : null;
  }

  async onModuleDestroy() {
    await this.client.quit();
  }
}
