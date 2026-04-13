FROM node:20

WORKDIR /app

# Install dependencies for Chromium
RUN apt-get update && apt-get install -y \
  chromium \
  fonts-noto-cjk \
  ca-certificates \
  --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

# Copy only package files
COPY package.json ./

# Install pnpm and dependencies
RUN npm install -g pnpm@10.18.0 && \
  PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true pnpm install

# Copy the rest of the application
COPY . .

# Build the application
RUN pnpm run build

# Set Puppeteer to use system Chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

EXPOSE 3008

CMD ["pnpm", "start"]
