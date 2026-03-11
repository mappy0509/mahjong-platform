import { SetMetadata } from "@nestjs/common";
import type { ClubMemberRole } from "@mahjong/shared";

export const CLUB_ROLES_KEY = "clubRoles";
export const ClubRoles = (...roles: ClubMemberRole[]) =>
  SetMetadata(CLUB_ROLES_KEY, roles);
