import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Query,
  UseGuards,
  Req,
  BadRequestException,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { UserRole } from "@mahjong/shared";
import { UserService } from "./user.service";
import { IsString, MinLength } from "class-validator";
import * as bcrypt from "bcrypt";

class UpdateRoleDto {
  @IsString()
  userId!: string;

  @IsString()
  role!: string;
}

class UpdateProfileDto {
  @IsString()
  @MinLength(1)
  displayName!: string;
}

class ChangePasswordDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(6)
  newPassword!: string;
}

@Controller("users")
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private userService: UserService) {}

  @Get("me")
  getMe(@Req() req: any) {
    return this.userService.findById(req.user.id);
  }

  @Patch("me")
  updateProfile(@Req() req: any, @Body() dto: UpdateProfileDto) {
    return this.userService.updateProfile(req.user.id, dto.displayName);
  }

  @Post("me/password")
  async changePassword(@Req() req: any, @Body() dto: ChangePasswordDto) {
    const user = await this.userService.findByUsername(req.user.username);
    if (!user) throw new BadRequestException("ユーザーが見つかりません");

    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid) throw new BadRequestException("現在のパスワードが正しくありません");

    const newHash = await bcrypt.hash(dto.newPassword, 10);
    await this.userService.changePassword(req.user.id, newHash);
    return { message: "パスワードを変更しました" };
  }

  @Get("search")
  search(@Query("q") query: string) {
    return this.userService.searchUsers(query || "");
  }

  @Get("list")
  @UseGuards(RolesGuard)
  @Roles(UserRole.PLATFORMER)
  listUsers(
    @Query("limit") limit?: string,
    @Query("offset") offset?: string
  ) {
    return this.userService.listUsers(
      limit ? parseInt(limit, 10) : 50,
      offset ? parseInt(offset, 10) : 0
    );
  }

  @Post("role")
  @UseGuards(RolesGuard)
  @Roles(UserRole.PLATFORMER)
  updateRole(@Body() dto: UpdateRoleDto) {
    return this.userService.updateRole(dto.userId, dto.role);
  }
}
