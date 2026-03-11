import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { GameService } from "./game.service";
import { IsString, IsOptional, IsObject } from "class-validator";
import type { GameRuleConfig } from "@mahjong/shared";

class CreateRoomDto {
  @IsString()
  clubId!: string;

  @IsString()
  name!: string;

  @IsObject()
  @IsOptional()
  rules?: Partial<GameRuleConfig>;
}

@Controller("games")
@UseGuards(JwtAuthGuard)
export class GameController {
  constructor(private gameService: GameService) {}

  @Post("rooms")
  createRoom(@Req() req: any, @Body() dto: CreateRoomDto) {
    return this.gameService.createRoom(
      req.user.id,
      dto.clubId,
      dto.name,
      dto.rules
    );
  }

  @Post("rooms/:id/join")
  joinRoom(@Req() req: any, @Param("id") roomId: string) {
    return this.gameService.joinRoom(req.user.id, roomId);
  }

  @Get("rooms/:id")
  getRoom(@Param("id") roomId: string) {
    return this.gameService.getRoom(roomId);
  }

  @Get("clubs/:clubId/rooms")
  getRooms(@Req() req: any, @Param("clubId") clubId: string) {
    return this.gameService.getRoomsForClub(clubId, req.user.id);
  }

  @Get("rooms/:id/events")
  getEventLog(@Req() req: any, @Param("id") roomId: string) {
    return this.gameService.getGameEventLog(roomId, req.user.id);
  }

  @Get("clubs/:clubId/history")
  getHistory(
    @Req() req: any,
    @Param("clubId") clubId: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    return this.gameService.getPlayerGameHistory(
      req.user.id,
      clubId,
      limit ? parseInt(limit, 10) : 20,
      offset ? parseInt(offset, 10) : 0,
    );
  }

  @Get("clubs/:clubId/stats")
  getStats(@Req() req: any, @Param("clubId") clubId: string) {
    return this.gameService.getPlayerStats(req.user.id, clubId);
  }

  @Get("clubs/:clubId/leaderboard")
  getLeaderboard(
    @Req() req: any,
    @Param("clubId") clubId: string,
    @Query("limit") limit?: string,
  ) {
    return this.gameService.getClubLeaderboard(
      clubId,
      req.user.id,
      limit ? parseInt(limit, 10) : 20,
    );
  }
}
