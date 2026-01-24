# Docker deployment

Run the API and frontend via Docker Compose. You need an external PostgreSQL instance: create the DB on your server and set `DATABASE_URL`.

## Quick start

1. Create the database on your Postgres server: `CREATE DATABASE bingo_draft;`

2. Copy and edit env:
   ```bash
   cp .env.docker.example .env
   # Set DATABASE_URL, JWT_SECRET, Discord OAuth vars, DISCORD_REDIRECT_URI, SITE_URL
   ```

3. Build and start:
   ```bash
   docker compose up -d --build
   ```

4. **Open the app**

   - App at `http://localhost` (or `http://localhost:PORT`)
   - API and Socket.IO are proxied at `/api` and `/socket.io` by nginx.

## Required environment variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Postgres connection string (e.g. `postgresql://user:password@host:5432/bingo_draft?schema=public`). |
| `JWT_SECRET` | Secret for signing JWTs. Use a long random string in production. |
| `DISCORD_CLIENT_ID` | Discord app client ID. |
| `DISCORD_CLIENT_SECRET` | Discord app client secret. |
| `DISCORD_REDIRECT_URI` | OAuth redirect URI. Must match the Discord app exactly. Default: `https://your-domain.com/api/auth/discord/callback` (or `http://localhost/...` for local). |
| `SITE_URL` | Public base URL (e.g. `https://draft.example.com`). Used for CORS and the frontend API/socket base. |

## Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `SITE_URL` | `http://localhost` | Public base URL. |
| `PORT` | `80` | Host port for frontend/nginx. |

## Discord app setup

In the [Discord Developer Portal](https://discord.com/developers/applications):

1. Create or select an application.
2. OAuth2 → Redirects: add `DISCORD_REDIRECT_URI` exactly.
3. Use the app's Client ID and Client Secret for `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET`.

## Production on a custom domain

1. Set `SITE_URL` to your public URL (e.g. `https://draft.example.com`).
2. Set `DISCORD_REDIRECT_URI` to `https://draft.example.com/api/auth/discord/callback` and add it in the Discord app.
3. Put a reverse proxy (Caddy, Traefik, nginx) in front of `frontend` to terminate TLS. Compose can still use port 80 internally.

## Architecture

- **`api`**: Node backend on `node:20-slim` (Debian). Uses Prisma; Prisma’s native engines require glibc/OpenSSL, so we use a Debian-based image instead of Alpine. Runs migrations on startup, then the server. Connects to external Postgres via `DATABASE_URL`. Only reached via nginx.
- **`frontend`**: Vite build served by nginx; proxies `/api` and `/socket.io` to `api`. `VITE_API_URL` comes from `SITE_URL` at build time.

In this workspace, `npm install` in `backend/` or `frontend/` does not create a local `package-lock.json` (the root workspace lockfile is used). The Dockerfiles therefore use `npm install` instead of `npm ci`.

## Useful commands

```bash
# Rebuild after code or env changes
docker compose up -d --build

# Logs
docker compose logs -f

# Stop
docker compose down
```
