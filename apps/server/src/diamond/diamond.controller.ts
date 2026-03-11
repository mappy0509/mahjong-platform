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
import { UserRole } from "@mahjong/shared";
import { DiamondService } from "./diamond.service";
import { IsString, IsNumber, Min } from "class-validator";

class DiamondPurchaseDto {
  @IsString()
  targetUserId!: string;

  @IsNumber()
  @Min(1)
  amount!: number;
}

class DiamondAdjustDto {
  @IsString()
  targetUserId!: string;

  @IsNumber()
  amount!: number;

  @IsString()
  description!: string;
}

@Controller("diamonds")
@UseGuards(JwtAuthGuard)
export class DiamondController {
  constructor(private diamondService: DiamondService) {}

  @Get("balance/:userId")
  @UseGuards(RolesGuard)
  @Roles(UserRole.PLATFORMER)
  getBalance(@Param("userId") userId: string) {
    return this.diamondService.getBalance(userId).then((b) => ({ balance: b }));
  }

  @Get("my-balance")
  getMyBalance(@Req() req: any) {
    return this.diamondService
      .getBalance(req.user.id)
      .then((b) => ({ balance: b }));
  }

  @Post("purchase")
  @UseGuards(RolesGuard)
  @Roles(UserRole.PLATFORMER)
  purchase(@Req() req: any, @Body() dto: DiamondPurchaseDto) {
    return this.diamondService.purchase(
      dto.targetUserId,
      dto.amount,
      req.user.id
    );
  }

  @Post("refund")
  @UseGuards(RolesGuard)
  @Roles(UserRole.PLATFORMER)
  refund(@Req() req: any, @Body() dto: DiamondPurchaseDto) {
    return this.diamondService.refund(
      dto.targetUserId,
      dto.amount,
      req.user.id
    );
  }

  @Post("adjust")
  @UseGuards(RolesGuard)
  @Roles(UserRole.PLATFORMER)
  adjust(@Req() req: any, @Body() dto: DiamondAdjustDto) {
    return this.diamondService.adjust(
      dto.targetUserId,
      dto.amount,
      req.user.id,
      dto.description
    );
  }

  @Get("transactions/:userId")
  @UseGuards(RolesGuard)
  @Roles(UserRole.PLATFORMER)
  getTransactions(@Param("userId") userId: string) {
    return this.diamondService.getTransactions(userId);
  }

  @Get("verify/:userId")
  @UseGuards(RolesGuard)
  @Roles(UserRole.PLATFORMER)
  verifyChain(@Param("userId") userId: string) {
    return this.diamondService.verifyChain(userId);
  }
}
