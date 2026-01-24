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

### 2. Set Up Database

Create a `.env` file in the `backend` directory:

```env
DATABASE_URL="postgresql://username:password@localhost:5432/bingo_draft?schema=public"
JWT_SECRET="change-this-to-a-random-secret-key"
PORT=3001
FRONTEND_URL="http://localhost:5173"
```

Replace `username` and `password` with your PostgreSQL credentials.

### 3. Run Database Migrations

```bash
cd backend
npm run db:generate
npm run db:migrate
```

This will create all the necessary database tables.

### 4. Seed Test Users (optional, for local development)

To populate the DB with test users (captains, participants) so you can exercise the Admin Dashboard and run mock events without multiple real Discord accounts:

```bash
cd backend
npm run db:seed
```

This creates 1 admin, 2 captains, and 8 participants with fake `SEED_*` discordIds. They **cannot log in** via Discord; they only exist in the DB so you can:
- See and assign roles in Admin → Users
- Run a mock draft: log in as your real account, create an event (you become captain), add players/teams, then Initialize Draft

To also create a **mock event** (MOCK2024) with players and teams:

```bash
npm run db:seed:event
```

Then in Admin → Manage Event, select "Mock Draft Event", set status to OPEN, add teams if needed, and use "Initialize Draft".

### 5. Create Your First Admin User

You have two options:

**Option A: Via API (after starting server)**
1. Start the backend: `cd backend && npm run dev`
2. Register a user via POST to `/api/auth/register`
3. Update the user role to ADMIN in the database:
   ```sql
   UPDATE "User" SET role = 'ADMIN' WHERE email = 'your-email@example.com';
   ```

**Option B: Direct SQL**
```sql
-- First, hash a password (you can use an online bcrypt generator or create a small script)
-- Example: password "admin123" hashed = $2a$10$...
INSERT INTO "User" (id, email, name, password, role, "createdAt", "updatedAt")
VALUES (
  'admin-id-here',
  'admin@example.com',
  'Admin User',
  '$2a$10$...', -- Replace with actual bcrypt hash
  'ADMIN',
  NOW(),
  NOW()
);
```

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
         {"name": "Player 1", "position": "QB", "team": "Team A"},
         {"name": "Player 2", "position": "RB", "team": "Team B"}
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

## Next Steps

1. Create events and import your player pools
2. Invite users to register and submit draft orders
3. Run the live draft when ready
4. View stats and rankings after completion

For more details, see the main [README.md](./README.md).
