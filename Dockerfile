FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate

# ── Install dependencies ──
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ── Build ──
FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build
ENV NODE_ENV=production
RUN pnpm prune --prod

# ── Production ──
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nestjs && \
    adduser --system --uid 1001 nestjs

COPY --from=build --chown=nestjs:nestjs /app/dist ./dist
COPY --from=build --chown=nestjs:nestjs /app/node_modules ./node_modules
COPY --from=build --chown=nestjs:nestjs /app/package.json ./

USER nestjs
EXPOSE 3001

CMD ["node", "dist/main.js"]
