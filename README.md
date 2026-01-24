# Bingo Fantasy Draft Website

A full-stack web application for running fantasy draft events with real-time updates, prediction submissions, and comprehensive statistics.

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

## Setup Instructions

### 1. Clone the repository

```bash
git clone <repository-url>
cd bingo-draft
```

### 2. Install dependencies

```bash
npm run install:all
```

This will install dependencies for both the root workspace, frontend, and backend.

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

1. Log in as an Admin or Captain
2. Create a new event via the API or admin dashboard
3. Import players (CSV/JSON format via API)
4. Create teams for the event
5. Set draft deadline and start time

### Submitting Draft Predictions

1. Open an event from the home page or via `/event/:eventCode`
2. Sign in with Discord, then navigate to "Submit Draft Order"
3. Drag and drop players to arrange your predicted draft order
4. Submit before the deadline

### Running the Live Draft

1. As a Captain, initialize the draft (this sets up the snake order)
2. Navigate to the Live Draft page
3. Make picks in real-time
4. All participants see updates instantly via WebSocket

### Viewing Stats

After the draft completes:
1. Navigate to the Stats page
2. View leaderboard rankings
3. See detailed comparison of your predictions vs. actual results

## API Endpoints

### Authentication
- `GET /api/auth/discord/url` - Get Discord OAuth URL (optionally `?eventCode=X` to return to event after sign-in)
- `GET /api/auth/discord/callback` - Discord OAuth callback (handles token exchange, redirects to frontend)
- `GET /api/auth/me` - Get current user (requires `Authorization: Bearer <token>`)

### Events
- `GET /api/events` - List all events
- `GET /api/events/code/:eventCode` - Get event by code
- `POST /api/events` - Create event (auth required)
- `PUT /api/events/:id` - Update event
- `POST /api/events/:id/players/import` - Import players
- `POST /api/events/:id/teams` - Add team

### Draft
- `POST /api/draft/:eventId/submit-order` - Submit draft order prediction
- `GET /api/draft/:eventId/my-submission` - Get user's submission
- `POST /api/draft/:eventId/initialize` - Initialize draft (captain/admin)
- `POST /api/draft/:eventId/pick` - Make a pick (captain/admin)
- `GET /api/draft/:eventId/state` - Get current draft state
- `POST /api/draft/:eventId/undo` - Undo last pick (captain/admin)

### Stats
- `GET /api/stats/:eventId/rankings` - Get all rankings
- `GET /api/stats/:eventId/my-stats` - Get user's stats
- `GET /api/stats/:eventId/export` - Export event data (admin/captain)

### Users
- `GET /api/users` - List users (admin only)
- `PUT /api/users/:id/role` - Update user role (admin only)

## WebSocket Events

### Client → Server
- `join-event` - Join an event room
- `leave-event` - Leave an event room

### Server → Client
- `pick-made` - Emitted when a pick is made
- `draft-update` - General draft state updates

## Project Structure

```
bingo-draft/
├── backend/
│   ├── src/
│   │   ├── routes/       # API routes
│   │   ├── middleware/   # Auth middleware
│   │   ├── socket.ts     # Socket.io setup
│   │   └── index.ts      # Express server
│   ├── prisma/
│   │   └── schema.prisma # Database schema
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── pages/        # React pages
│   │   ├── components/  # Reusable components
│   │   ├── contexts/     # React contexts (Auth, Socket)
│   │   └── App.tsx
│   └── package.json
└── package.json          # Root workspace config
```

## Development Notes

- The backend uses Prisma for database access. After schema changes, run `npm run db:generate` and `npm run db:migrate`
- Socket.io is used for real-time updates. The frontend automatically connects when authenticated
- JWT tokens are stored in localStorage on the frontend
- The draft uses a snake format: teams pick in order 1→N, then reverse N→1, repeating

## Troubleshooting

### Database Connection Issues
- Verify PostgreSQL is running
- Check DATABASE_URL in backend/.env
- Ensure database exists

### Socket.io Connection Issues
- Check CORS settings in backend/src/index.ts
- Verify FRONTEND_URL matches your frontend URL
- Check browser console for connection errors

### Build Issues
- Delete node_modules and reinstall: `rm -rf node_modules */node_modules && npm run install:all`
- Clear TypeScript build cache: `rm -rf backend/dist frontend/dist`

## License

MIT
