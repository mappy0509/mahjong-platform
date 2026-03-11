import { Module } from "@nestjs/common";
import { PointService } from "./point.service";
import { PointController } from "./point.controller";
import { ClubModule } from "../club/club.module";

@Module({
  imports: [ClubModule],
  controllers: [PointController],
  providers: [PointService],
  exports: [PointService],
})
export class PointModule {}
