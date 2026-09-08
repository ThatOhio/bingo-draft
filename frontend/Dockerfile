# Build stage
ARG VITE_API_URL
FROM node:20-alpine AS builder

ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

WORKDIR /app

# The build context is the repo root so the @bingo-draft/shared workspace is reachable.
# Copy manifests first so the dependency install layer caches independently of source.
COPY package*.json ./
COPY shared/package.json ./shared/
COPY frontend/package.json ./frontend/

# One workspace install at the root: hoists dependencies and symlinks @bingo-draft/shared.
RUN npm install

# Shared must be built before the frontend can typecheck or bundle against it.
COPY shared ./shared
RUN npm run build --workspace @bingo-draft/shared

COPY frontend ./frontend

WORKDIR /app/frontend
RUN npm run build

# Production stage: nginx serves static files and proxies /api and /socket.io
FROM nginx:alpine

COPY --from=builder /app/frontend/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
