import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthResponse } from "@mahjong/shared";

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService
  ) {}

  async register(
    username: string,
    password: string,
    displayName: string
  ): Promise<AuthResponse> {
    const existing = await this.prisma.user.findUnique({
      where: { username },
    });
    if (existing) {
      throw new ConflictException("Username already exists");
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await this.prisma.user.create({
      data: { username, passwordHash, displayName },
    });

    return this.generateTokens(user.id, user.username, user.displayName);
  }

  async login(username: string, password: string): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({
      where: { username },
    });
    if (!user) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException("Invalid credentials");
    }

    return this.generateTokens(user.id, user.username, user.displayName);
  }

  async refreshToken(refreshToken: string): Promise<AuthResponse> {
    try {
      const payload = this.jwt.verify(refreshToken, {
        secret:
          this.config.get("JWT_REFRESH_SECRET") || "dev-refresh-secret",
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });
      if (!user) {
        throw new UnauthorizedException("User not found");
      }

      return this.generateTokens(user.id, user.username, user.displayName);
    } catch {
      throw new UnauthorizedException("Invalid refresh token");
    }
  }

  async validateUser(userId: string) {
    return this.prisma.user.findUnique({ where: { id: userId } });
  }

  private generateTokens(
    userId: string,
    username: string,
    displayName: string
  ): AuthResponse {
    const payload = { sub: userId, username };

    const accessToken = this.jwt.sign(payload);
    const refreshToken = this.jwt.sign(payload, {
      secret:
        this.config.get("JWT_REFRESH_SECRET") || "dev-refresh-secret",
      expiresIn:
        this.config.get("JWT_REFRESH_EXPIRATION") || "7d",
    });

    return {
      accessToken,
      refreshToken,
      user: { id: userId, username, displayName },
    };
  }
}
