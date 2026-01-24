# Build stage
ARG VITE_API_URL
FROM node:20-alpine AS builder

ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

WORKDIR /app

COPY package*.json ./
# npm install works with or without package-lock.json. Workspace installs don't create
# lockfiles in frontend/; use npm install here so Docker builds succeed.
RUN npm install

COPY . .
RUN npm run build

# Production stage: nginx serves static files and proxies /api and /socket.io
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
