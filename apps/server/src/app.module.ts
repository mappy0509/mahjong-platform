import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { PrismaModule } from "./prisma/prisma.module";
import { RedisModule } from "./redis/redis.module";
import { AuthModule } from "./auth/auth.module";
import { UserModule } from "./user/user.module";
import { ClubModule } from "./club/club.module";
import { GameModule } from "./game/game.module";
import { PointModule } from "./point/point.module";
import { DiamondModule } from "./diamond/diamond.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      {
        name: "short",
        ttl: 1000,  // 1 second window
        limit: 10,  // max 10 requests per second
      },
      {
        name: "medium",
        ttl: 10000, // 10 second window
        limit: 50,  // max 50 requests per 10 seconds
      },
      {
        name: "long",
        ttl: 60000, // 1 minute window
        limit: 200, // max 200 requests per minute
      },
    ]),
    PrismaModule,
    RedisModule,
    AuthModule,
    UserModule,
    ClubModule,
    GameModule,
    PointModule,
    DiamondModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
