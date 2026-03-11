import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

const APPEND_ONLY_MODELS = [
  "GameEventLog",
  "PointTransaction",
  "DiamondTransaction",
];

const MUTATION_ACTIONS = ["update", "updateMany", "delete", "deleteMany"];

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super();

    // Middleware: Block UPDATE/DELETE on append-only tables
    this.$use(async (params, next) => {
      const model = params.model as string | undefined;
      if (model && APPEND_ONLY_MODELS.includes(model) && MUTATION_ACTIONS.includes(params.action)) {
        throw new Error(`${model} is append-only. UPDATE/DELETE forbidden.`);
      }
      return next(params);
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
