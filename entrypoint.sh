#!/bin/bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Scraping Service - Entrypoint${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}\n"

POSTGRES_HOST="${POSTGRES_HOST:-postgres}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
REDIS_HOST="${REDIS_HOST:-redis}"
REDIS_PORT="${REDIS_PORT:-6379}"
SERVICE_NAME="${SERVICE_NAME:-scraping}"

echo -e "${YELLOW}[INFO]${NC} Initializing $SERVICE_NAME service..."

# STEP 1: PostgreSQL
echo -e "\n${YELLOW}[STEP 1/4]${NC} Waiting for PostgreSQL ($POSTGRES_HOST:$POSTGRES_PORT)..."
until nc -zv "$POSTGRES_HOST" "$POSTGRES_PORT" >/dev/null 2>&1; do sleep 1; done
echo -e "${GREEN}✅ PostgreSQL is ready!${NC}"

# STEP 2: Redis
echo -e "\n${YELLOW}[STEP 2/4]${NC} Waiting for Redis ($REDIS_HOST:$REDIS_PORT)..."
until nc -zv "$REDIS_HOST" "$REDIS_PORT" >/dev/null 2>&1; do sleep 1; done
echo -e "${GREEN}✅ Redis is ready!${NC}"

# STEP 3: Prisma generate
echo -e "\n${YELLOW}[STEP 3/4]${NC} Generating Prisma Client..."
if [ -f "prisma/schema.prisma" ]; then
  pnpm prisma:generate 2>&1 | sed 's/^/  /'
  echo -e "${GREEN}✅ Prisma Client generated!${NC}"
fi

# STEP 4: DB sync
echo -e "\n${YELLOW}[STEP 4/4]${NC} Syncing database schema (prisma db push)..."
if [ -f "prisma/schema.prisma" ]; then
  if pnpm prisma:push 2>&1 | sed 's/^/  /'; then
    echo -e "${GREEN}✅ Database schema is in sync!${NC}"
  else
    echo -e "${RED}❌ CRITICAL: schema sync failed!${NC}"
    exit 1
  fi
fi

echo -e "\n${BLUE}═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}🚀 Starting $SERVICE_NAME service...${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}\n"

exec "$@"
