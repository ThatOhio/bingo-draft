# Build stage. Use Debian-based Node (not Alpine): Prisma's native engines require
# glibc/OpenSSL compatible with its pre-built binaries; Alpine/musl often fails.
FROM node:20-slim AS builder

WORKDIR /app

# Prisma's native engines need OpenSSL; node:20-slim doesn't include it.
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# The build context is the repo root so the @bingo-draft/shared workspace is reachable.
# Copy manifests first so the dependency install layer caches independently of source.
COPY package*.json ./
COPY shared/package.json ./shared/
COPY backend/package.json ./backend/
COPY backend/prisma ./backend/prisma/

# One workspace install at the root: hoists dependencies and symlinks @bingo-draft/shared.
RUN npm install

# Shared must be built before the backend can typecheck or run against it.
COPY shared ./shared
RUN npm run build --workspace @bingo-draft/shared

COPY backend ./backend

WORKDIR /app/backend
RUN npx prisma generate
RUN npm run build

# Production stage (Debian-based for Prisma engine compatibility)
FROM node:20-slim

# Prisma migrate deploy needs OpenSSL at runtime.
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# node_modules carries the workspace symlink @bingo-draft/shared -> ../../shared,
# so /app/shared must be present at the same relative path for it to resolve.
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/backend ./backend

WORKDIR /app/backend

# Wait for DB and run migrations, then start the server
ENTRYPOINT ["/bin/sh", "-c", "until npx prisma migrate deploy; do echo 'Waiting for database...'; sleep 2; done && exec node dist/index.js"]
