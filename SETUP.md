# Quick Setup Guide

## Prerequisites
- Node.js 18+ installed
- PostgreSQL installed and running
- A PostgreSQL database created (e.g., `bingo_draft`)

## Step-by-Step Setup

### 1. Install Dependencies
```bash
npm run install:all
```

### 2. Set Up Database and Environment

Create a `.env` file in the `backend` directory (see `backend/.env.example`):

```env
DATABASE_URL="postgresql://username:password@localhost:5432/bingo_draft?schema=public"
JWT_SECRET="change-this-to-a-random-secret-key"
PORT=3001
FRONTEND_URL="http://localhost:5173"

# Discord OAuth (required for sign-in)
DISCORD_CLIENT_ID="your-discord-client-id"
DISCORD_CLIENT_SECRET="your-discord-client-secret"
DISCORD_REDIRECT_URI="http://localhost:3001/api/auth/discord/callback"
```

Replace `username` and `password` with your PostgreSQL credentials. Create a Discord Application in the [Discord Developer Portal](https://discord.com/developers/applications) and set the OAuth2 redirect URI to match `DISCORD_REDIRECT_URI`.

### 3. Run Database Migrations

```bash
cd backend
npm run db:generate
npm run db:migrate
```

This will create all the necessary database tables.

### 4. Seed Test Users (optional, for local development)

To add test users for the Admin Dashboard and mock drafts (without multiple Discord accounts):

```bash
cd backend
npm run db:seed
```

Creates 1 admin and 10 users with fake `SEED_*` discordIds. They cannot log in via Discord. Use them to:
- Assign roles in Admin → Users
- Run a mock draft: log in as your real admin, create an event, add players/teams, assign captains (Discord username), then Initialize Draft

To also create a **mock event** (MOCK2024) with players and teams:

```bash
npm run db:seed:event
```

In Admin → Manage Event, select the mock event, set OPEN, add teams if needed, then Initialize Draft.

To reset and get a fresh mock event (clears all events, then seeds users + event):

```bash
npm run db:clear-events
npm run db:seed:event
```

### 5. Create Your First Admin User

1. Start the backend: `cd backend && npm run dev` (and frontend: `cd frontend && npm run dev`).
2. Sign in with Discord via the app (this creates your user in the database).
3. Promote your user to admin:
   ```sql
   UPDATE "User" SET role = 'ADMIN' WHERE "discordId" = 'your-discord-id';
   ```
   Use your Discord user ID (from the User table after sign-in, or from the Discord Developer Portal).

### 6. Start Development Servers

From the root directory:
```bash
npm run dev
```

Or separately:
```bash
# Terminal 1
cd backend
npm run dev

# Terminal 2
cd frontend
npm run dev
```

### 7. Access the Application

- Frontend: http://localhost:5173
- Backend API: http://localhost:3001
- API Health Check: http://localhost:3001/api/health

## Creating Your First Event

1. Log in as an admin user
2. Use the API to create an event:
   ```bash
   curl -X POST http://localhost:3001/api/events \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -d '{
       "name": "My First Draft",
       "eventCode": "DRAFT001",
       "description": "Test event"
     }'
   ```
3. Import players:
   ```bash
   curl -X POST http://localhost:3001/api/events/EVENT_ID/players/import \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -d '{
       "players": [
         {"name": "Player 1", "team": "Team A"},
         {"name": "Player 2", "team": "Team B"}
       ]
     }'
   ```
4. Create teams:
   ```bash
   curl -X POST http://localhost:3001/api/events/EVENT_ID/teams \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -d '{"name": "Team 1"}'
   ```

## Troubleshooting

### Database Connection Error
- Verify PostgreSQL is running: `pg_isready`
- Check your DATABASE_URL format
- Ensure the database exists: `psql -l | grep bingo_draft`

### Port Already in Use
- Change PORT in backend/.env
- Update FRONTEND_URL if you change the backend port

### Module Not Found Errors
- Delete node_modules and reinstall: `rm -rf node_modules */node_modules && npm run install:all`

### Prisma Errors
- Run `npm run db:generate` in the backend directory
- Check your DATABASE_URL is correct

## Next

Create events, import players, invite users to sign in with Discord and submit predictions, run the live draft, then check stats. See [README.md](./README.md) for more.
