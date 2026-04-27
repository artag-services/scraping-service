# ═══════════════════════════════════════════════════════════════════════
# Builder Stage - Build application
# ═════════════════════════════════════════════════════════════════════════
FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache openssl

RUN npm install -g pnpm@10.18.0

COPY package.json pnpm-lock.yaml* ./

RUN if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile; else pnpm install; fi

COPY . .

RUN pnpm prisma:generate
RUN pnpm run build

# ═══════════════════════════════════════════════════════════════════════
# Production Stage - Minimal runtime image
# ═════════════════════════════════════════════════════════════════════════
FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache \
  netcat-openbsd \
  ca-certificates \
  openssl \
  bash

RUN npm install -g pnpm@10.18.0

COPY entrypoint.sh ./
COPY package.json pnpm-lock.yaml* ./
COPY prisma ./prisma

# Skip Chromium download - use browserless/chrome service instead
RUN PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true pnpm install $(if [ -f pnpm-lock.yaml ]; then echo "--frozen-lockfile"; fi)

# Regenerate Prisma client in production stage (needed for runtime)
RUN pnpm prisma:generate

# Copy built application from builder
COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production

RUN chmod +x /app/entrypoint.sh

EXPOSE 3008

ENTRYPOINT ["bash", "/app/entrypoint.sh"]
CMD ["pnpm", "start:prod"]
