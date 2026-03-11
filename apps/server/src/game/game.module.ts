import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ClubModule } from "../club/club.module";
import { PointModule } from "../point/point.module";
import { GameService } from "./game.service";
import { GameGateway } from "./game.gateway";
import { GameController } from "./game.controller";
import { GameSessionService } from "./game-session.service";

@Module({
  imports: [AuthModule, ClubModule, PointModule],
  controllers: [GameController],
  providers: [GameService, GameGateway, GameSessionService],
  exports: [GameService],
})
export class GameModule {}
