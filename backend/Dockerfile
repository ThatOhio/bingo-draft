# Build stage. Use Debian-based Node (not Alpine): Prisma's native engines require
# glibc/OpenSSL compatible with its pre-built binaries; Alpine/musl often fails.
FROM node:20-slim AS builder

WORKDIR /app

# Prisma's native engines need OpenSSL; node:20-slim doesn't include it.
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY prisma ./prisma/

# npm install works with or without package-lock.json. Workspace installs don't create
# lockfiles in backend/; use npm install here so Docker builds succeed.
RUN npm install

RUN npx prisma generate

COPY . .

RUN npm run build

# Production stage (Debian-based for Prisma engine compatibility)
FROM node:20-slim

# Prisma migrate deploy needs OpenSSL at runtime.
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# Wait for DB and run migrations, then start the server
ENTRYPOINT ["/bin/sh", "-c", "until npx prisma migrate deploy; do echo 'Waiting for database...'; sleep 2; done && exec node dist/index.js"]
