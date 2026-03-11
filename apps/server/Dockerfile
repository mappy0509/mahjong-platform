FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

# --- Dependencies ---
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/mahjong-engine/package.json packages/mahjong-engine/
COPY packages/typescript-config/package.json packages/typescript-config/
COPY packages/eslint-config/package.json packages/eslint-config/
COPY apps/server/package.json apps/server/
RUN pnpm install --frozen-lockfile

# --- Build ---
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/mahjong-engine/node_modules ./packages/mahjong-engine/node_modules
COPY --from=deps /app/apps/server/node_modules ./apps/server/node_modules
COPY . .
RUN pnpm --filter @mahjong/shared build || true
RUN pnpm --filter @mahjong/engine build || true
RUN cd apps/server && npx prisma generate && pnpm build

# --- Production ---
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/apps/server/dist ./dist
COPY --from=build /app/apps/server/node_modules ./node_modules
COPY --from=build /app/node_modules/.pnpm ./node_modules/.pnpm
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/packages/mahjong-engine ./packages/mahjong-engine
COPY --from=build /app/apps/server/prisma ./prisma
COPY --from=build /app/apps/server/package.json ./

EXPOSE 3000

CMD ["node", "dist/main.js"]
