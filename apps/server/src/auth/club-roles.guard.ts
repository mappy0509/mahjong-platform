import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { ClubMemberRole } from "@mahjong/shared";
import { CLUB_ROLES_KEY } from "./club-roles.decorator";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Guard that checks if the authenticated user has the required ClubMemberRole
 * within the club specified by the route parameter `:clubId` or body `clubId`.
 *
 * Attaches the membership to `req.clubMembership` for downstream use.
 */
@Injectable()
export class ClubRolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<ClubMemberRole[]>(
      CLUB_ROLES_KEY,
      [context.getHandler(), context.getClass()]
    );
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id;
    if (!userId) {
      throw new ForbiddenException("Not authenticated");
    }

    // Extract clubId from route params or request body
    const clubId =
      request.params?.clubId || request.params?.id || request.body?.clubId;
    if (!clubId) {
      throw new ForbiddenException("Club context required");
    }

    const membership = await this.prisma.clubMembership.findUnique({
      where: { userId_clubId: { userId, clubId } },
    });
    if (!membership) {
      throw new ForbiddenException("Not a club member");
    }
    if (!requiredRoles.includes(membership.role as ClubMemberRole)) {
      throw new ForbiddenException(
        `Requires club role: ${requiredRoles.join(" or ")}`
      );
    }

    // Attach membership for downstream use
    request.clubMembership = membership;
    return true;
  }
}
