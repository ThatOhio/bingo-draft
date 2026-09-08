# Bingo Fantasy Draft Website

A full-stack web app for fantasy draft events: real-time updates, prediction submissions, and stats/rankings.

## Features

- **User Authentication**: Sign in with Discord (first sign-in creates the user) and role-based access control (User, Admin)
- **Event Management**: Create and manage draft events with customizable player pools
- **Draft Order Submissions**: Users can submit their predictions for the draft order via drag-and-drop interface
- **Live Draft**: Real-time snake draft with WebSocket updates for all participants
- **Stats & Rankings**: Compare predictions to actual results with detailed analytics and leaderboards
- **Admin Dashboard**: Manage users, events, and export data

## Tech Stack

### Frontend
- React 18 with TypeScript
- Vite for build tooling
- Tailwind CSS for styling
- React Router for navigation
- Socket.io Client for real-time updates
- @dnd-kit for drag-and-drop functionality
- Recharts for data visualization

### Backend
- Node.js with Express and TypeScript
- PostgreSQL database with Prisma ORM
- Socket.io for real-time WebSocket communication
- JWT for authentication
- Discord OAuth for sign-in
- Zod for input validation

## Prerequisites

- Node.js 18+ and npm
- PostgreSQL database
- Git

## Docker deployment

To run the API and frontend via Docker Compose (using your own PostgreSQL server):

```bash
cp .env.docker.example .env
# Edit .env with DATABASE_URL, JWT_SECRET, Discord OAuth, SITE_URL, and DISCORD_REDIRECT_URI
docker compose up -d --build
```

See **[DOCKER.md](./DOCKER.md)** for required env vars, Discord app setup, and production notes.

## Setup Instructions (non-Docker)

### 1. Clone the repository

```bash
git clone <repository-url>
cd bingo-draft
```

### 2. Install dependencies

```bash
npm install
```

One install at the repo root covers all three workspaces (`shared`, `frontend`, `backend`)
and links `@bingo-draft/shared` into both apps. Do not install inside a package directory.

### 3. Database Setup

Create a PostgreSQL database:

```bash
createdb bingo_draft
```

Or using psql:

```sql
CREATE DATABASE bingo_draft;
```

### 4. Configure Environment Variables

#### Backend

Create `backend/.env` file:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/bingo_draft?schema=public"
JWT_SECRET="your-secret-key-change-in-production"
PORT=3001
FRONTEND_URL="http://localhost:5173"

# Discord OAuth
DISCORD_CLIENT_ID="your-discord-client-id"
DISCORD_CLIENT_SECRET="your-discord-client-secret"
DISCORD_REDIRECT_URI="http://localhost:3001/api/auth/discord/callback"
```

#### Frontend

Create `frontend/.env` file (optional, defaults are set):

```env
VITE_API_URL="http://localhost:3001"
```

### 5. Database Migration

```bash
cd backend
npm run db:generate
npm run db:migrate
```

### 6. Create Admin User

Sign in with Discord once (this creates your user). Then promote yourself to admin:

```sql
UPDATE "User" SET role = 'ADMIN' WHERE "discordId" = 'your-discord-id';
```

Use your Discord user ID from the User table, or from the Discord Developer Portal.

### 7. Run the Application

#### Development Mode

From the root directory:

```bash
npm run dev
```

This will start both the backend (port 3001) and frontend (port 5173) concurrently.

Or run them separately:

```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev
```

#### Production Build

```bash
npm run build
```

Then start the backend:

```bash
cd backend
npm start
```

And serve the frontend build (using a static server like `serve`):

```bash
cd frontend
npx serve -s dist
```

## Usage

### Creating an Event

1. Log in as Admin.
2. Create an event in the admin dashboard or via the API.
3. Import players (JSON or pasteable text) via the API or admin dashboard.
4. Create teams and optionally assign captains.
5. Set draft deadline and start time if needed.

### Submitting Draft Predictions

1. Open an event (home or `/event/:eventCode`), sign in with Discord.
2. Go to Submit Draft Order, drag players into slots for your predicted draft.
3. Save before the deadline; partial saves are fine.

### Running the Live Draft

1. As Admin, initialize the draft in Manage Event (sets the snake order).
2. Open the Live Draft page.
3. Make picks in real time; everyone sees updates via WebSocket.

### Viewing Stats

After the draft completes, open the Stats page for leaderboard rankings and prediction vs. actuals.

## API Endpoints

### Authentication
- `GET /api/auth/discord/url` - Get Discord OAuth URL (optionally `?eventCode=X` to return to event after sign-in)
- `GET /api/auth/discord/callback` - Discord OAuth callback (handles token exchange, redirects to frontend)
- `GET /api/auth/me` - Get current user (requires `Authorization: Bearer <token>`)
- `POST /api/auth/refresh` - Exchange a valid token for a fresh one carrying the current role

Tokens last 24 hours. The frontend renews on load, every 15 minutes, and once on any 401
before retrying the request. Roles are always read from the database, so promoting or
demoting a user takes effect on their next request rather than when their token expires.

### Events
- `GET /api/events` - List all events
- `GET /api/events/code/:eventCode` - Get event by code
- `POST /api/events` - Create event (admin)
- `PUT /api/events/:id` - Update event (admin)
- `POST /api/events/:id/players/import` - Import players from JSON array (admin)
- `POST /api/events/:id/players/bulk-import` - Import players from pasteable text, one per line (admin)
- `POST /api/events/:id/players/bulk-remove` - Remove players by name, one per line (admin)
- `PUT /api/events/:id/team-draft-order` - Set which team picks 1st, 2nd, etc. (admin; before initialize)
- `POST /api/events/:id/teams` - Add team (admin)

### Draft
- `POST /api/draft/:eventId/submit-order` - Submit draft order prediction
- `GET /api/draft/:eventId/my-submission` - Get user's submission
- `POST /api/draft/:eventId/initialize` - Initialize draft (admin; refused once picks exist)
- `POST /api/draft/:eventId/pick` - Make a pick (admin or captain of the current team; rejected while paused)
- `GET /api/draft/:eventId/state` - Get current draft state
- `POST /api/draft/:eventId/undo` - Undo last pick (admin only)
- `POST /api/draft/:eventId/pause` - Pause the draft, blocking further picks (admin only)
- `POST /api/draft/:eventId/resume` - Resume a paused draft (admin only)

### Stats
- `GET /api/stats/:eventId/rankings` - Get all rankings
- `GET /api/stats/:eventId/aggregate` - Per-player and per-team prediction accuracy across all users
- `GET /api/stats/:eventId/my-stats` - Get user's stats
- `GET /api/stats/:eventId/user/:userId` - Get a specific user's stats (public, for shared links)
- `GET /api/stats/:eventId/export` - Export event data (admin only)

### Users
- `GET /api/users` - List users (admin only)
- `PUT /api/users/:id/role` - Update user role (admin only)

## WebSocket Events

Authentication is **optional** — signed-out viewers connect too, since event rooms are
read-only broadcast channels carrying the same data as the public state endpoint.

### Client → Server
- `join-event` - Join an event room
- `leave-event` - Leave an event room

### Server → Client
- `draft-update` - The full draft state, pushed after every pick, undo, pause, resume,
  initialize, and team-order change. Same payload as `GET /api/draft/:eventId/state`.

## Project Structure

```
bingo-draft/
├── shared/               # @bingo-draft/shared — snake-order math + scoring rules
│   └── src/              # Used by BOTH apps; never reimplement locally
├── backend/
│   ├── src/
│   │   ├── routes/       # API routes
│   │   ├── lib/          # draft-state.ts (state builder/broadcaster), user-stats.ts
│   │   ├── middleware/   # Auth middleware
│   │   ├── socket.ts     # Socket.io setup
│   │   └── index.ts      # Express server
│   ├── prisma/
│   │   └── schema.prisma # Database schema
│   ├── scripts/
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── pages/        # React pages
│   │   ├── components/   # Reusable components (incl. components/draft/)
│   │   ├── contexts/     # React contexts (Auth, Socket, Theme, Toast, Confirm)
│   │   ├── lib/          # api-client.ts — the shared axios instance
│   │   └── App.tsx
│   └── package.json
└── package.json          # Root workspace config
```

## Development Notes

- Backend: Prisma. After schema changes: `npm run db:generate` and `npm run db:migrate`.
- Socket.io for real-time updates; every viewer connects, signed in or not. JWTs in localStorage.
- Draft: snake order. Teams pick 1→N, then N→1, repeat.
- **Shared math:** the snake-order and scoring helpers live in `shared/`. Run
  `npm run build:shared` after changing them, or the apps keep using the previous build.
- **Adding a draft mutation?** Call `broadcastDraftState()` from
  `backend/src/lib/draft-state.ts` so live viewers see it. There is no polling to fall
  back on while the socket is up.

## Troubleshooting

**Database:** PostgreSQL running? DATABASE_URL in backend/.env correct? DB exists?

**Socket.io:** CORS in backend/src/index.ts; FRONTEND_URL matches frontend; check browser console.

**Build:** `rm -rf node_modules */node_modules && npm run install:all`; or clear `backend/dist` and `frontend/dist`.

## License

MIT
