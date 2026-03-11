import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Req,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { ClubRolesGuard } from "../auth/club-roles.guard";
import { ClubRoles } from "../auth/club-roles.decorator";
import { ClubMemberRole, UserRole } from "@mahjong/shared";
import { PointService } from "./point.service";
import { ClubService } from "../club/club.service";
import { IsString, IsNumber, Min } from "class-validator";

class DepositDto {
  @IsString()
  userId!: string;

  @IsNumber()
  @Min(1)
  amount!: number;
}

class AdjustDto {
  @IsString()
  userId!: string;

  @IsNumber()
  amount!: number;

  @IsString()
  description!: string;
}

@Controller("points")
@UseGuards(JwtAuthGuard)
export class PointController {
  constructor(
    private pointService: PointService,
    private clubService: ClubService
  ) {}

  @Get(":clubId/balance")
  async getMyBalance(@Req() req: any, @Param("clubId") clubId: string) {
    await this.clubService.requireMembership(clubId, req.user.id);
    const balance = await this.pointService.getBalance(req.user.id, clubId);
    return { balance };
  }

  @Get(":clubId/transactions")
  async getMyTransactions(@Req() req: any, @Param("clubId") clubId: string) {
    await this.clubService.requireMembership(clubId, req.user.id);
    return this.pointService.getTransactions(req.user.id, clubId);
  }

  @Post(":clubId/deposit")
  @UseGuards(ClubRolesGuard)
  @ClubRoles(ClubMemberRole.OWNER, ClubMemberRole.AGENT)
  async deposit(
    @Param("clubId") clubId: string,
    @Body() dto: DepositDto
  ) {
    return this.pointService.deposit(dto.userId, clubId, dto.amount);
  }

  @Post(":clubId/withdraw")
  @UseGuards(ClubRolesGuard)
  @ClubRoles(ClubMemberRole.OWNER, ClubMemberRole.AGENT)
  async withdraw(
    @Param("clubId") clubId: string,
    @Body() dto: DepositDto
  ) {
    return this.pointService.withdraw(dto.userId, clubId, dto.amount);
  }

  @Post(":clubId/adjust")
  @UseGuards(ClubRolesGuard)
  @ClubRoles(ClubMemberRole.OWNER, ClubMemberRole.AGENT)
  async adjust(
    @Param("clubId") clubId: string,
    @Body() dto: AdjustDto
  ) {
    return this.pointService.adjust(
      dto.userId,
      clubId,
      dto.amount,
      dto.description
    );
  }

  @Get(":clubId/verify/:userId")
  @UseGuards(RolesGuard)
  @Roles(UserRole.PLATFORMER)
  verifyChain(
    @Param("clubId") clubId: string,
    @Param("userId") userId: string
  ) {
    return this.pointService.verifyChain(userId, clubId);
  }
}
