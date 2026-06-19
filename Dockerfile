# ═══════════════════════════════════════════════════════════════════════
# Stage 1 — Build Rust scraper binary
# ═══════════════════════════════════════════════════════════════════════
FROM rust:alpine AS rust-builder

RUN apk add --no-cache musl-dev

WORKDIR /app
COPY scraper-rs/ .

RUN cargo build --release && \
    cp target/release/scraper-rs /scraper-rs

# ═══════════════════════════════════════════════════════════════════════
# Stage 2 — Build NestJS application
# ═══════════════════════════════════════════════════════════════════════
FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache openssl

RUN npm install -g pnpm@10.18.0

COPY scrapping/package.json scrapping/pnpm-lock.yaml* ./

RUN if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile; else pnpm install; fi

COPY scrapping/ .

RUN pnpm prisma:generate
RUN pnpm run build

# ═══════════════════════════════════════════════════════════════════════
# Stage 3 — Production runtime
# ═══════════════════════════════════════════════════════════════════════
FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache \
  netcat-openbsd \
  ca-certificates \
  openssl \
  bash

RUN npm install -g pnpm@10.18.0

COPY scrapping/entrypoint.sh ./
COPY scrapping/package.json scrapping/pnpm-lock.yaml* ./
COPY scrapping/prisma ./prisma

RUN pnpm install $(if [ -f pnpm-lock.yaml ]; then echo "--frozen-lockfile"; fi)

RUN pnpm prisma:generate

COPY --from=builder /app/dist ./dist

COPY --from=rust-builder /scraper-rs /usr/local/bin/scraper-rs

ENV NODE_ENV=production

RUN chmod +x /app/entrypoint.sh

EXPOSE 3008

ENTRYPOINT ["bash", "/app/entrypoint.sh"]
CMD ["pnpm", "start:prod"]
