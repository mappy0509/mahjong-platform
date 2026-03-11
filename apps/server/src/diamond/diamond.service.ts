import { Injectable, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { createHash } from "crypto";

@Injectable()
export class DiamondService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService
  ) {}

  async getBalance(userId: string): Promise<number> {
    const cached = await this.redis.getClient().get(`diamond:${userId}`);
    if (cached !== null) return parseInt(cached, 10);

    const result = await this.prisma.diamondTransaction.aggregate({
      where: { userId },
      _sum: { amount: true },
    });
    const balance = result._sum.amount || 0;

    await this.redis
      .getClient()
      .set(`diamond:${userId}`, balance.toString(), "EX", 300);
    return balance;
  }

  private async addTransaction(
    userId: string,
    type: string,
    amount: number,
    operatorId?: string,
    referenceId?: string,
    description?: string
  ) {
    const currentBalance = await this.getBalance(userId);
    const newBalance = currentBalance + amount;

    // Get previous transaction hash for chaining
    const prev = await this.prisma.diamondTransaction.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { hash: true },
    });
    const prevHash = prev?.hash ?? null;

    // Compute hash
    const hashInput = JSON.stringify({
      prevHash,
      userId,
      type,
      amount,
      balanceBefore: currentBalance,
      balanceAfter: newBalance,
      ts: Date.now(),
    });
    const hash = createHash("sha256").update(hashInput).digest("hex");

    const transaction = await this.prisma.diamondTransaction.create({
      data: {
        userId,
        type: type as any,
        amount,
        balanceBefore: currentBalance,
        balanceAfter: newBalance,
        operatorId,
        referenceId,
        description,
        prevHash,
        hash,
      },
    });

    await this.redis
      .getClient()
      .set(`diamond:${userId}`, newBalance.toString(), "EX", 300);

    return transaction;
  }

  async purchase(
    targetUserId: string,
    amount: number,
    operatorId: string
  ) {
    if (amount <= 0)
      throw new BadRequestException("Amount must be positive");
    return this.addTransaction(
      targetUserId,
      "PURCHASE",
      amount,
      operatorId,
      undefined,
      `Diamond purchase by operator ${operatorId}`
    );
  }

  async refund(
    targetUserId: string,
    amount: number,
    operatorId: string
  ) {
    if (amount <= 0)
      throw new BadRequestException("Amount must be positive");
    const balance = await this.getBalance(targetUserId);
    if (balance < amount)
      throw new BadRequestException("Insufficient diamond balance");
    return this.addTransaction(
      targetUserId,
      "REFUND",
      -amount,
      operatorId,
      undefined,
      `Diamond refund by operator ${operatorId}`
    );
  }

  async chargeClubFee(
    clubOwnerId: string,
    amount: number,
    referenceId: string,
    description: string
  ) {
    if (amount <= 0) return null;
    const balance = await this.getBalance(clubOwnerId);
    if (balance < amount)
      throw new BadRequestException("Insufficient diamond balance for fee");
    return this.addTransaction(
      clubOwnerId,
      "CLUB_FEE",
      -amount,
      undefined,
      referenceId,
      description
    );
  }

  async adjust(
    userId: string,
    amount: number,
    operatorId: string,
    description: string
  ) {
    return this.addTransaction(
      userId,
      "ADJUSTMENT",
      amount,
      operatorId,
      undefined,
      description
    );
  }

  async getTransactions(userId: string, limit = 50) {
    return this.prisma.diamondTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  async verifyChain(userId: string): Promise<{ valid: boolean; brokenAt?: string }> {
    const txns = await this.prisma.diamondTransaction.findMany({
      where: { userId },
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
