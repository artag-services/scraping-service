# ═══════════════════════════════════════════════════════════════════════
# Builder Stage - Build application
# ═════════════════════════════════════════════════════════════════════════
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@10.18.0

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install dependencies (including dev dependencies for build)
RUN if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile; else pnpm install; fi

# Copy application source
COPY . .

# Build the application
RUN pnpm run build

# ═══════════════════════════════════════════════════════════════════════
# Production Stage - Minimal runtime image
# ═════════════════════════════════════════════════════════════════════════
FROM node:20-alpine

WORKDIR /app

# Install runtime dependencies for Puppeteer
RUN apk add --no-cache \
  netcat-openbsd \
  ca-certificates \
  bash

# Install pnpm for production
RUN npm install -g pnpm@10.18.0

# Copy entrypoint first
COPY entrypoint.sh ./

COPY package.json pnpm-lock.yaml* ./

# Install ALL dependencies (including dev for build tools that might be needed)
# We need devDependencies because the built dist/ may reference them at runtime
RUN PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false pnpm install $(if [ -f pnpm-lock.yaml ]; then echo "--frozen-lockfile"; fi)

# Copy Prisma schema if it exists (for future use)
# (Skipping Prisma for now - not needed in scraping service)

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Set environment variables for Puppeteer
# Puppeteer will download Chromium during installation
ENV NODE_ENV=production

RUN chmod +x /app/entrypoint.sh

EXPOSE 3008

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["pnpm", "start:prod"]
