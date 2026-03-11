import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  Req,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ClubMemberRole } from "@mahjong/shared";
import { ClubService } from "./club.service";
import {
  IsString,
  IsOptional,
  MinLength,
  IsBoolean,
  IsNumber,
  Min,
  Max,
  IsObject,
} from "class-validator";
import type { GameRuleConfig } from "@mahjong/shared";

// ─── DTOs ────────────────────────────────────────────────────

class CreateClubDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @IsOptional()
  description?: string;
}

class JoinClubDto {
  @IsString()
  inviteCode!: string;
}

class SetAliasDto {
  @IsString()
  targetUserId!: string;

  @IsString()
  alias!: string;
}

class RemoveAliasDto {
  @IsString()
  targetUserId!: string;
}

class UpdateClubSettingsDto {
  @IsBoolean()
  @IsOptional()
  isApprovalRequired?: boolean;

  @IsObject()
  @IsOptional()
  defaultRules?: Partial<GameRuleConfig>;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  feePercent?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  gpsRestrictionKm?: number;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;
}

class InviteMemberDto {
  @IsString()
  inviteeId!: string;

  @IsString()
  @IsOptional()
  targetRole?: string;

  @IsString()
  @IsOptional()
  message?: string;
}

class RespondInvitationDto {
  @IsBoolean()
  accept!: boolean;
}

class UpdateMemberRoleDto {
  @IsString()
  targetUserId!: string;

  @IsString()
  newRole!: string;
}

class RemoveMemberDto {
  @IsString()
  targetUserId!: string;
}

// ─── Controller ──────────────────────────────────────────────

@Controller("clubs")
@UseGuards(JwtAuthGuard)
export class ClubController {
  constructor(private clubService: ClubService) {}

  // ── Club CRUD ────────────────────────────────────

  @Post()
  create(@Req() req: any, @Body() dto: CreateClubDto) {
    return this.clubService.create(req.user.id, dto.name, dto.description);
  }

  @Get()
  getMyClubs(@Req() req: any) {
    return this.clubService.getMyClubs(req.user.id);
  }

  @Get(":id")
  getClub(@Param("id") clubId: string) {
    return this.clubService.getClub(clubId);
  }

  @Patch(":id/settings")
  updateSettings(
    @Req() req: any,
    @Param("id") clubId: string,
    @Body() dto: UpdateClubSettingsDto
  ) {
    return this.clubService.updateClubSettings(clubId, req.user.id, dto);
  }

  // ── Membership ───────────────────────────────────

  @Post("join")
  join(@Req() req: any, @Body() dto: JoinClubDto) {
    return this.clubService.joinByInviteCode(req.user.id, dto.inviteCode);
  }

  @Get(":id/members")
  getMembers(@Req() req: any, @Param("id") clubId: string) {
    return this.clubService.getClubMembers(clubId, req.user.id);
  }

  @Post(":id/members/role")
  updateMemberRole(
    @Req() req: any,
    @Param("id") clubId: string,
    @Body() dto: UpdateMemberRoleDto
  ) {
    return this.clubService.updateMemberRole(
      clubId,
      dto.targetUserId,
      dto.newRole as ClubMemberRole,
      req.user.id
    );
  }

  @Post(":id/members/remove")
  removeMember(
    @Req() req: any,
    @Param("id") clubId: string,
    @Body() dto: RemoveMemberDto
  ) {
    return this.clubService.removeMember(clubId, dto.targetUserId, req.user.id);
  }

  // ── Invitation / Approval ────────────────────────

  @Post(":id/invitations")
  createInvitation(
    @Req() req: any,
    @Param("id") clubId: string,
    @Body() dto: InviteMemberDto
  ) {
    return this.clubService.createInvitation(
      clubId,
      req.user.id,
      dto.inviteeId,
      (dto.targetRole as ClubMemberRole) || ClubMemberRole.MEMBER,
      dto.message
    );
  }

  @Get(":id/invitations")
  getClubInvitations(@Req() req: any, @Param("id") clubId: string) {
    return this.clubService.getClubInvitations(clubId, req.user.id);
  }

  @Get("invitations/mine")
  getMyInvitations(@Req() req: any) {
    return this.clubService.getMyInvitations(req.user.id);
  }

  @Post("invitations/:invitationId/respond")
  respondToInvitation(
    @Req() req: any,
    @Param("invitationId") invitationId: string,
    @Body() dto: RespondInvitationDto
  ) {
    return this.clubService.respondToInvitation(
      invitationId,
      req.user.id,
      dto.accept
    );
  }

  // ── Alias ────────────────────────────────────────

  @Post(":id/alias")
  setAlias(
    @Req() req: any,
    @Param("id") clubId: string,
    @Body() dto: SetAliasDto
  ) {
    return this.clubService.setAlias(
      clubId,
      dto.targetUserId,
      dto.alias,
      req.user.id
    );
  }

  @Post(":id/alias/remove")
  removeAlias(
    @Req() req: any,
    @Param("id") clubId: string,
    @Body() dto: RemoveAliasDto
  ) {
    return this.clubService.removeAlias(clubId, dto.targetUserId, req.user.id);
  }
}
