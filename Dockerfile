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

ARG PORT=3001
ARG MONGODB_URI
ARG AUTH_JWT_SECRET
ARG CORS_ORIGIN
ARG SENTRY_DSN
ARG GOOGLE_CLIENT_ID
ARG GOOGLE_CLIENT_SECRET
ARG FRONTEND_URL
ARG API_PUBLIC_URL
ARG OPENAI_API_KEY
ARG PINECONE_API_KEY
ARG PINECONE_INDEX
ARG REDIS_URL
ARG REDIS_HOST
ARG REDIS_PORT

ENV PORT=$PORT
ENV MONGODB_URI=$MONGODB_URI
ENV AUTH_JWT_SECRET=$AUTH_JWT_SECRET
ENV CORS_ORIGIN=$CORS_ORIGIN
ENV SENTRY_DSN=$SENTRY_DSN
ENV GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID
ENV GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET
ENV FRONTEND_URL=$FRONTEND_URL
ENV API_PUBLIC_URL=$API_PUBLIC_URL
ENV OPENAI_API_KEY=$OPENAI_API_KEY
ENV PINECONE_API_KEY=$PINECONE_API_KEY
ENV PINECONE_INDEX=$PINECONE_INDEX
ENV REDIS_URL=$REDIS_URL
ENV REDIS_HOST=$REDIS_HOST
ENV REDIS_PORT=$REDIS_PORT

RUN addgroup --system --gid 1001 nestjs && \
    adduser --system --uid 1001 nestjs

COPY --from=build --chown=nestjs:nestjs /app/dist ./dist
COPY --from=build --chown=nestjs:nestjs /app/node_modules ./node_modules
COPY --from=build --chown=nestjs:nestjs /app/package.json ./

USER nestjs
EXPOSE 3001

CMD ["node", "dist/src/main.js"]
