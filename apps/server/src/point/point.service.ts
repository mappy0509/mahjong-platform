import { Injectable, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { PointTransactionType } from "@prisma/client";
import { createHash } from "crypto";

@Injectable()
export class PointService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService
  ) {}

  async getBalance(userId: string, clubId: string): Promise<number> {
    const cached = await this.redis.getPointBalance(userId, clubId);
    if (cached !== null) return cached;

    const result = await this.prisma.pointTransaction.aggregate({
      where: { userId, clubId },
      _sum: { amount: true },
    });
    const balance = result._sum.amount || 0;

    await this.redis.setPointBalance(userId, clubId, balance);
    return balance;
  }

  async addTransaction(
    userId: string,
    clubId: string,
    type: PointTransactionType,
    amount: number,
    referenceId?: string,
    description?: string
  ) {
    const currentBalance = await this.getBalance(userId, clubId);
    const newBalance = currentBalance + amount;

    // Get previous transaction hash for chaining
    const prev = await this.prisma.pointTransaction.findFirst({
      where: { userId, clubId },
      orderBy: { createdAt: "desc" },
      select: { hash: true },
    });
    const prevHash = prev?.hash ?? null;

    // Compute SHA-256 hash for tamper detection
    const hashInput = JSON.stringify({
      prevHash,
      userId,
      clubId,
      type,
      amount,
      balanceBefore: currentBalance,
      balanceAfter: newBalance,
      ts: Date.now(),
    });
    const hash = createHash("sha256").update(hashInput).digest("hex");

    const transaction = await this.prisma.pointTransaction.create({
      data: {
        userId,
        clubId,
        type,
        amount,
        balanceBefore: currentBalance,
        balanceAfter: newBalance,
        referenceId,
        description,
        prevHash,
        hash,
      },
    });

    await this.redis.setPointBalance(userId, clubId, newBalance);

    return transaction;
  }

  async deposit(userId: string, clubId: string, amount: number) {
    if (amount <= 0) throw new BadRequestException("Amount must be positive");
    return this.addTransaction(userId, clubId, "DEPOSIT", amount);
  }

  async withdraw(userId: string, clubId: string, amount: number) {
    if (amount <= 0) throw new BadRequestException("Amount must be positive");
    const balance = await this.getBalance(userId, clubId);
    if (balance < amount) throw new BadRequestException("Insufficient balance");
    return this.addTransaction(userId, clubId, "WITHDRAWAL", -amount);
  }

  async recordGameResult(
    clubId: string,
    results: { userId: string; amount: number }[],
    referenceId: string
  ) {
    for (const result of results) {
      await this.addTransaction(
        result.userId,
        clubId,
        "GAME_RESULT",
        result.amount,
        referenceId
      );
    }
  }

  async adjust(
    userId: string,
    clubId: string,
    amount: number,
    description: string
  ) {
    return this.addTransaction(
      userId,
      clubId,
      "ADJUSTMENT",
      amount,
      undefined,
      description
    );
  }

  async getTransactions(userId: string, clubId: string, limit = 50) {
    return this.prisma.pointTransaction.findMany({
      where: { userId, clubId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  async verifyChain(
    userId: string,
    clubId: string
  ): Promise<{ valid: boolean; brokenAt?: string }> {
    const txns = await this.prisma.pointTransaction.findMany({
      where: { userId, clubId },
      orderBy: { createdAt: "asc" },
    });

    let lastHash: string | null = null;
    for (const txn of txns) {
      if (txn.prevHash !== lastHash) {
        return { valid: false, brokenAt: txn.id };
      }
      lastHash = txn.hash;
    }
    return { valid: true };
  }
}
