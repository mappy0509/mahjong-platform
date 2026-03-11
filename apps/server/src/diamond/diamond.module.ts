import { Module } from "@nestjs/common";
import { DiamondService } from "./diamond.service";
import { DiamondController } from "./diamond.controller";

@Module({
  controllers: [DiamondController],
  providers: [DiamondService],
  exports: [DiamondService],
})
export class DiamondModule {}
