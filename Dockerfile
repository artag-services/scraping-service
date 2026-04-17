# ═══════════════════════════════════════════════════════════════════════
# Builder Stage - Build application
# ═════════════════════════════════════════════════════════════════════════
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@10.18.0

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies (including dev dependencies for build)
RUN pnpm install --frozen-lockfile

# Copy application source
COPY . .

# Build the application
RUN pnpm run build

# ═══════════════════════════════════════════════════════════════════════
# Production Stage - Minimal runtime image
# ═════════════════════════════════════════════════════════════════════════
FROM node:20-alpine

WORKDIR /app

# Install Chromium and dependencies from Alpine repositories (minimal footprint)
RUN apk add --no-cache \
  chromium \
  noto-sans-cjk \
  netcat-openbsd \
  ca-certificates \
  bash

# Install pnpm for production
RUN npm install -g pnpm@10.18.0

# Copy entrypoint first
COPY entrypoint.sh ./

COPY package.json pnpm-lock.yaml ./

# Install only production dependencies (no dev dependencies)
RUN PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true pnpm install --prod --frozen-lockfile

# Copy Prisma schema if it exists (for future use)
COPY prisma ./prisma 2>/dev/null || true

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Set environment variables for Chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV NODE_ENV=production

RUN chmod +x /app/entrypoint.sh

EXPOSE 3008

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["pnpm", "start"]
