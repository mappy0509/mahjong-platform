import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { v4 as uuid } from "uuid";
import type { ClubMemberRole, GameRuleConfig } from "@mahjong/shared";

@Injectable()
export class ClubService {
  constructor(private prisma: PrismaService) {}

  // ─── Club CRUD ─────────────────────────────────────────────

  async create(userId: string, name: string, description?: string) {
    const inviteCode = uuid().slice(0, 8).toUpperCase();

    const club = await this.prisma.club.create({
      data: {
        name,
        description,
        inviteCode,
        ownerId: userId,
        memberships: {
          create: {
            userId,
            role: "OWNER",
          },
        },
      },
      include: { memberships: true },
    });

    // Update user role to CLUB_OWNER if currently PLAYER
    await this.prisma.user.updateMany({
      where: { id: userId, role: "PLAYER" },
      data: { role: "CLUB_OWNER" },
    });

    return club;
  }

  async getClub(clubId: string) {
    const club = await this.prisma.club.findUnique({
      where: { id: clubId },
      include: { _count: { select: { memberships: true } } },
    });
    if (!club) throw new NotFoundException("Club not found");
    return club;
  }

  async updateClubSettings(
    clubId: string,
    requesterId: string,
    settings: {
      isApprovalRequired?: boolean;
      defaultRules?: Partial<GameRuleConfig>;
      feePercent?: number;
      gpsRestrictionKm?: number;
      name?: string;
      description?: string;
    }
  ) {
    await this.requireClubRole(clubId, requesterId, ["OWNER"]);

    const data: any = {};
    if (settings.isApprovalRequired !== undefined)
      data.isApprovalRequired = settings.isApprovalRequired;
    if (settings.defaultRules !== undefined)
      data.defaultRules = settings.defaultRules as any;
    if (settings.feePercent !== undefined) {
      if (settings.feePercent < 0 || settings.feePercent > 100)
        throw new BadRequestException("Fee must be 0-100");
      data.feePercent = settings.feePercent;
    }
    if (settings.gpsRestrictionKm !== undefined)
      data.gpsRestrictionKm = settings.gpsRestrictionKm;
    if (settings.name !== undefined) data.name = settings.name;
    if (settings.description !== undefined)
      data.description = settings.description;

    return this.prisma.club.update({ where: { id: clubId }, data });
  }

  // ─── Membership ────────────────────────────────────────────

  async joinByInviteCode(userId: string, inviteCode: string) {
    const club = await this.prisma.club.findUnique({
      where: { inviteCode },
    });
    if (!club) {
      throw new NotFoundException("Invalid invite code");
    }

    const existing = await this.prisma.clubMembership.findUnique({
      where: { userId_clubId: { userId, clubId: club.id } },
    });
    if (existing) {
      throw new ConflictException("Already a member");
    }

    if (club.isApprovalRequired) {
      // Create pending invitation instead of direct join
      const existingInvitation = await this.prisma.clubInvitation.findFirst({
        where: { clubId: club.id, inviteeId: userId, status: "PENDING" },
      });
      if (existingInvitation) {
        throw new ConflictException("Join request already pending");
      }
      await this.prisma.clubInvitation.create({
        data: {
          clubId: club.id,
          inviterId: userId, // self-request
          inviteeId: userId,
          targetRole: "MEMBER",
          status: "PENDING",
          message: "Joined via invite code (pending approval)",
        },
      });
      return { ...club, pendingApproval: true };
    }

    await this.prisma.clubMembership.create({
      data: { userId, clubId: club.id, role: "MEMBER" },
    });

    return club;
  }

  async getMyClubs(userId: string) {
    return this.prisma.club.findMany({
      where: {
        memberships: { some: { userId } },
      },
      include: {
        _count: { select: { memberships: true } },
      },
    });
  }

  async getClubMembers(clubId: string, userId: string) {
    await this.requireMembership(clubId, userId);

    return this.prisma.clubMembership.findMany({
      where: { clubId },
      include: {
        user: {
          select: { id: true, username: true, displayName: true },
        },
      },
    });
  }

  async removeMember(clubId: string, targetUserId: string, requesterId: string) {
    const requester = await this.requireClubRole(clubId, requesterId, [
      "OWNER",
    ]);
    const target = await this.prisma.clubMembership.findUnique({
      where: { userId_clubId: { userId: targetUserId, clubId } },
    });
    if (!target) throw new NotFoundException("Member not found");
    if (target.role === "OWNER")
      throw new ForbiddenException("Cannot remove the club owner");

    await this.prisma.clubMembership.delete({
      where: { userId_clubId: { userId: targetUserId, clubId } },
    });
    return { removed: true };
  }

  async updateMemberRole(
    clubId: string,
    targetUserId: string,
    newRole: ClubMemberRole,
    requesterId: string
  ) {
    await this.requireClubRole(clubId, requesterId, ["OWNER"]);
    const target = await this.prisma.clubMembership.findUnique({
      where: { userId_clubId: { userId: targetUserId, clubId } },
    });
    if (!target) throw new NotFoundException("Member not found");
    if (target.role === "OWNER")
      throw new ForbiddenException("Cannot change owner role");
    if (newRole === "OWNER")
      throw new ForbiddenException("Cannot assign owner role");

    const updated = await this.prisma.clubMembership.update({
      where: { userId_clubId: { userId: targetUserId, clubId } },
      data: { role: newRole },
    });

    // Update user's platform role to AGENT if promoted
    if (newRole === "AGENT") {
      await this.prisma.user.updateMany({
        where: { id: targetUserId, role: "PLAYER" },
        data: { role: "AGENT" },
      });
    }

    return updated;
  }

  // ─── Invitation / Approval ─────────────────────────────────

  async createInvitation(
    clubId: string,
    inviterId: string,
    inviteeId: string,
    targetRole: ClubMemberRole = "MEMBER" as ClubMemberRole,
    message?: string
  ) {
    // Only OWNER can invite as AGENT; OWNER or AGENT can invite MEMBER
    const inviterMembership = await this.requireMembership(clubId, inviterId);
    if (targetRole === "AGENT" && inviterMembership.role !== "OWNER") {
      throw new ForbiddenException("Only owner can invite agents");
    }
    if (
      targetRole === "MEMBER" &&
      inviterMembership.role !== "OWNER" &&
      inviterMembership.role !== "AGENT"
    ) {
      throw new ForbiddenException("Only owner/agent can invite members");
    }
    if (targetRole === "OWNER") {
      throw new ForbiddenException("Cannot invite as owner");
    }

    // Check target user exists
    const invitee = await this.prisma.user.findUnique({
      where: { id: inviteeId },
    });
    if (!invitee) throw new NotFoundException("User not found");

    // Check not already a member
    const existing = await this.prisma.clubMembership.findUnique({
      where: { userId_clubId: { userId: inviteeId, clubId } },
    });
    if (existing) throw new ConflictException("Already a member");

    // Check no pending invitation
    const pendingInvite = await this.prisma.clubInvitation.findFirst({
      where: { clubId, inviteeId, status: "PENDING" },
    });
    if (pendingInvite) throw new ConflictException("Invitation already pending");

    return this.prisma.clubInvitation.create({
      data: {
        clubId,
        inviterId,
        inviteeId,
        targetRole,
        message,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });
  }

  async respondToInvitation(
    invitationId: string,
    userId: string,
    accept: boolean
  ) {
    const invitation = await this.prisma.clubInvitation.findUnique({
      where: { id: invitationId },
    });
    if (!invitation) throw new NotFoundException("Invitation not found");
    if (invitation.status !== "PENDING")
      throw new BadRequestException("Invitation already processed");

    // For user-directed invitations, the invitee responds
    // For approval-required join requests, OWNER/AGENT responds
    const isJoinRequest = invitation.inviterId === invitation.inviteeId;

    if (isJoinRequest) {
      // This is a join request that needs owner/agent approval
      await this.requireClubRole(invitation.clubId, userId, [
        "OWNER",
        "AGENT",
      ]);
    } else {
      // This is a direct invitation — invitee responds
      if (invitation.inviteeId !== userId) {
        throw new ForbiddenException("Not your invitation");
      }
    }

    if (invitation.expiresAt && invitation.expiresAt < new Date()) {
      await this.prisma.clubInvitation.update({
        where: { id: invitationId },
        data: { status: "EXPIRED" },
      });
      throw new BadRequestException("Invitation has expired");
    }

    await this.prisma.clubInvitation.update({
      where: { id: invitationId },
      data: {
        status: accept ? "ACCEPTED" : "REJECTED",
        respondedAt: new Date(),
      },
    });

    if (accept) {
      const targetUserId = invitation.inviteeId!;
      // Prevent duplicate membership
      const existing = await this.prisma.clubMembership.findUnique({
        where: {
          userId_clubId: { userId: targetUserId, clubId: invitation.clubId },
        },
      });
      if (!existing) {
        await this.prisma.clubMembership.create({
          data: {
            userId: targetUserId,
            clubId: invitation.clubId,
            role: invitation.targetRole,
          },
        });
        // Update platform role if promoted to AGENT
        if (invitation.targetRole === "AGENT") {
          await this.prisma.user.updateMany({
            where: { id: targetUserId, role: "PLAYER" },
            data: { role: "AGENT" },
          });
        }
      }
    }

    return { accepted: accept };
  }

  async getClubInvitations(clubId: string, userId: string) {
    await this.requireClubRole(clubId, userId, ["OWNER", "AGENT"]);

    return this.prisma.clubInvitation.findMany({
      where: { clubId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
    });
  }

  async getMyInvitations(userId: string) {
    return this.prisma.clubInvitation.findMany({
      where: {
        inviteeId: userId,
        status: "PENDING",
        NOT: { inviterId: userId }, // Exclude self-requested join requests
      },
      include: {
        club: { select: { id: true, name: true, description: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  // ─── Alias Management ──────────────────────────────────────

  async setAlias(
    clubId: string,
    targetUserId: string,
    alias: string,
    requesterId: string
  ) {
    await this.requireClubRole(clubId, requesterId, ["OWNER", "AGENT"]);

    return this.prisma.clubMembership.update({
      where: { userId_clubId: { userId: targetUserId, clubId } },
      data: { alias },
    });
  }

  async removeAlias(
    clubId: string,
    targetUserId: string,
    requesterId: string
  ) {
    await this.requireClubRole(clubId, requesterId, ["OWNER", "AGENT"]);

    return this.prisma.clubMembership.update({
      where: { userId_clubId: { userId: targetUserId, clubId } },
      data: { alias: null },
    });
  }

  async getAlias(clubId: string, userId: string): Promise<string | null> {
    const membership = await this.prisma.clubMembership.findUnique({
      where: { userId_clubId: { userId, clubId } },
      select: { alias: true },
    });
    return membership?.alias ?? null;
  }

  // ─── Helpers ───────────────────────────────────────────────

  async requireMembership(clubId: string, userId: string) {
    const membership = await this.prisma.clubMembership.findUnique({
      where: { userId_clubId: { userId, clubId } },
    });
    if (!membership) {
      throw new ForbiddenException("Not a club member");
    }
    return membership;
  }

  async requireClubRole(
    clubId: string,
    userId: string,
    roles: string[]
  ) {
    const membership = await this.prisma.clubMembership.findUnique({
      where: { userId_clubId: { userId, clubId } },
    });
    if (!membership) {
      throw new ForbiddenException("Not a club member");
    }
    if (!roles.includes(membership.role)) {
      throw new ForbiddenException(
        `Requires club role: ${roles.join(" or ")}`
      );
    }
    return membership;
  }
}
