# Docker deployment

Run the API and frontend via Docker Compose. Uses an external PostgreSQL instance—create the database on your dedicated DB server and set `DATABASE_URL` to its connection string.

## Quick start

1. **Create the database** on your PostgreSQL server (e.g. `CREATE DATABASE bingo_draft;`).

2. **Copy and edit environment**

   ```bash
   cp .env.docker.example .env
   # Edit .env: DATABASE_URL, JWT_SECRET, Discord OAuth vars, DISCORD_REDIRECT_URI, SITE_URL
   ```

3. **Build and start**

   ```bash
   docker compose up -d --build
   ```

4. **Open the app**

   - App: `http://localhost` (or `http://localhost:PORT` if you set `PORT`)
   - API and Socket.IO are proxied at `/api` and `/socket.io` by the frontend’s nginx.

## Required environment variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string for your dedicated DB server (e.g. `postgresql://user:password@host:5432/bingo_draft?schema=public`). |
| `JWT_SECRET` | Secret for signing JWTs; use a long random string in production. |
| `DISCORD_CLIENT_ID` | Discord application client ID. |
| `DISCORD_CLIENT_SECRET` | Discord application client secret. |
| `DISCORD_REDIRECT_URI` | OAuth redirect URI. Must exactly match the one in the Discord app. With the default setup: `https://your-domain.com/api/auth/discord/callback` (or `http://localhost/api/auth/discord/callback` for local). |
| `SITE_URL` | Public base URL of the site (e.g. `https://draft.example.com` or `http://localhost`). Used for CORS and for the frontend’s API/Socket base URL. |

## Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `SITE_URL` | `http://localhost` | Public base URL (see above). |
| `PORT` | `80` | Host port for the frontend/nginx. |

## Discord app setup

In the [Discord Developer Portal](https://discord.com/developers/applications):

1. Create an application (or use an existing one).
2. OAuth2 → Redirects: add `DISCORD_REDIRECT_URI` exactly (e.g. `https://your-domain.com/api/auth/discord/callback`).
3. Use the app’s Client ID and Client Secret for `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET`.

## Production on a custom domain

1. Set `SITE_URL` to your public URL, e.g. `https://draft.example.com`.
2. Set `DISCORD_REDIRECT_URI` to `https://draft.example.com/api/auth/discord/callback` and add it in the Discord app.
3. Put a reverse proxy (Caddy, Traefik, nginx, etc.) in front of the `frontend` service to terminate TLS and forward to `frontend:80`. The compose stack can keep listening on port 80 internally.

## Architecture

- **`api`**: Node backend; runs Prisma migrations on startup, then starts the server. Connects to your external Postgres via `DATABASE_URL`. Only reached via the frontend’s nginx.
- **`frontend`**: Vite build served by nginx; proxies `/api` and `/socket.io` to `api`. `VITE_API_URL` is set at build time from `SITE_URL` so the browser uses the correct base URL.

## Useful commands

```bash
# Rebuild after code or env changes
docker compose up -d --build

# Logs
docker compose logs -f

# Stop
docker compose down
```
