# Docker deployment

Run the API and frontend via Docker Compose. You need an external PostgreSQL instance: create the DB on your server and set `DATABASE_URL`.

## Quick start

1. Create the database on your Postgres server: `CREATE DATABASE bingo_draft;`

2. Copy and edit env:
   ```bash
   cp .env.docker.example .env
   # Set COMPOSE_PROJECT_NAME, DATABASE_URL, JWT_SECRET, Discord OAuth vars,
   # DISCORD_REDIRECT_URI, SITE_URL
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
| `COMPOSE_PROJECT_NAME` | Names this stack's containers, network, and images. Required when more than one deployment shares a host — see [Running several deployments on one host](#running-several-deployments-on-one-host). |
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

## Running several deployments on one host

Compose derives a **project name** from the directory it runs in, and that name scopes
every container, the network, and the tags of the images it builds. Two clones of this
repo in directories with the same name (`~/qa/bingo-draft` and `~/prod/bingo-draft`, say)
therefore resolve to the *same* project — so bringing one up tears down the other's
containers and overwrites its images, regardless of which folder you ran the command from.

Passing `-p draft_qa` fixes that, but it makes correctness depend on remembering the flag
every single time, including for `down` and `logs`.

**Set the project name in `.env` instead.** Compose reads `COMPOSE_PROJECT_NAME` from the
`.env` file in the working directory, so the name travels with the clone:

```bash
# ~/qa/bingo-draft/.env
COMPOSE_PROJECT_NAME=draft_qa
PORT=8080
SITE_URL=https://qa.draft.example.com

# ~/prod/bingo-draft/.env
COMPOSE_PROJECT_NAME=draft_prod
PORT=80
SITE_URL=https://draft.example.com
```

Every command then works unqualified, and does the right thing purely because of which
directory you are standing in:

```bash
cd ~/qa/bingo-draft && docker compose up -d --build   # only ever touches qa
cd ~/prod/bingo-draft && docker compose down          # only ever touches prod
```

`.env` is gitignored, so the two clones stay identical in git while differing in identity.

### Switching an already-running stack over

A stack keeps the project name it was created under. If a deployment is currently running
as `draft_qa` because of a `-p` flag, put that same value in its `.env` and nothing moves.
If you pick a *different* name, bring the old stack down first with the command that
created it — otherwise you get a second, parallel set of containers:

```bash
docker compose -p draft_qa down    # old identity
docker compose up -d --build       # new identity from .env
```

### Remembering what is running

```bash
docker compose ls
```

Lists every Compose project on the host with its status and the **path to the config file
it was started from** — which is the thing worth knowing when you come back to the machine
and want to find the right directory.

### Also make these differ per deployment

| Variable | Why |
|----------|-----|
| `PORT` | Host port bind; the second stack fails to start on a collision. |
| `DATABASE_URL` | QA must not share a database with prod. |
| `SITE_URL` + `DISCORD_REDIRECT_URI` | Baked into the frontend build and used for CORS; both redirect URIs must be registered in the Discord app. |

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

All of these act on the project named by `COMPOSE_PROJECT_NAME` in the `.env` of the
directory you run them from.

```bash
# Rebuild after code or env changes
docker compose up -d --build

# Logs
docker compose logs -f

# Stop
docker compose down

# What is running on this host, and from which directory
docker compose ls
```

### Checking for duplicate draft picks before migrating

The migration that adds the unique constraints to `DraftPick` will not apply if the data
already violates them. The check is read-only and runs from the built image:

```bash
docker compose build api
docker compose run --rm --entrypoint sh api -c "npx tsx scripts/check-duplicate-picks.ts"
```

Build first but do not bring the stack up — `run` uses the built image, and an older image
will not contain the script. `backend/scripts/check-duplicate-picks.sql` is the same check
as plain SQL if you would rather query the database directly.

If a migration fails, the api container loops printing `Waiting for database...` (its
entrypoint retries on any failure). Clear the failed-migration marker before retrying:

```bash
docker compose run --rm --entrypoint sh api \
  -c "npx prisma migrate resolve --rolled-back MIGRATION_NAME"
```
