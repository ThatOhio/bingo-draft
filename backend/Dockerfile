# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

# npm install works with or without package-lock.json. Workspace installs don't create
# lockfiles in backend/; use npm install here so Docker builds succeed.
RUN npm install

RUN npx prisma generate

COPY . .

RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# Wait for DB and run migrations, then start the server
ENTRYPOINT ["/bin/sh", "-c", "until npx prisma migrate deploy; do echo 'Waiting for database...'; sleep 2; done && exec node dist/index.js"]
