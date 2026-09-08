# CLAUDE.md

Guidance for Claude Code when working in this repository.

Coding style, naming, and framework rules live in **`.cursorrules`** — read that too.
This file covers architecture and the invariants that are easy to break.

## What this is

A real-time fantasy draft platform. Users predict how a snake draft will go, watch it
happen live, and are scored on how close they were.

Three flows matter:
1. **Prediction** (`draft-submission.tsx`) — drag players onto a round × team board.
2. **Live draft** (`live-draft.tsx`) — admins and team captains pick; everyone watches.
3. **Scoring** (`stats.tsx`) — predictions compared against what happened.

## Layout

```
shared/     @bingo-draft/shared — snake-order math + scoring rules (dual CJS/ESM)
backend/    Express + Prisma + Socket.IO
  src/lib/    draft-state.ts (state builder + broadcaster), user-stats.ts (scoring)
  src/routes/ auth, events, users, draft, stats
frontend/   React + Vite
  src/lib/api-client.ts   the axios instance — always use this
  src/contexts/           auth, socket, theme, toast, confirm
  src/components/draft/   DraftBoard, PlayerPool, RecentPicks
```

## Commands

```bash
npm install            # workspace install at the root — not per package
npm run dev            # builds shared, then backend (3001) + frontend (5173)
npm run build          # shared → frontend → backend, in that order
npm run build:shared   # after any shared/ change, before consumers see it

npx tsc -p backend/tsconfig.json --noEmit
npx tsc -p frontend/tsconfig.json --noEmit
cd frontend && npm run lint          # must pass with zero warnings

cd backend && npx prisma migrate dev # needs DATABASE_URL reachable
cd backend && npx tsx scripts/check-duplicate-picks.ts
```

## Invariants

**Snake math lives in `shared/` and nowhere else.** The frontend lays out the prediction
board with `slotToRoundAndTeamIndex`; the backend scores with the same function. A local
reimplementation that drifts means predictions score against the wrong slots — silently.

**One draft-state shape.** `buildDraftState()` in `backend/src/lib/draft-state.ts` serves
both `GET /api/draft/:eventId/state` and the `draft-update` socket event. Every mutation
that changes the board calls `broadcastDraftState()` — pick, undo, pause, resume,
initialize, team-order change. Miss one and viewers silently desync.

**Don't reintroduce polling.** The live draft used to poll every 2s, which at ~50 viewers
was ~25 heavy queries/second. Viewers are pushed to now. The only poll left fires when
the socket is actually disconnected (`DISCONNECTED_POLL_MS` in `live-draft.tsx`).

**Sockets are anonymous-friendly.** Auth is optional on the socket. Event rooms are
read-only broadcast channels and the same data is public over HTTP, so requiring a token
only pushed signed-out viewers onto polling.

**Roles come from the database.** The JWT `role` claim is advisory and goes stale for up
to 24h. Use `requireRole()`, `loadCurrentUser()`, or `isAdmin()`.

**`import 'dotenv/config'` stays the first import in `backend/src/index.ts`.** Several
modules read `process.env` at module scope, and imports evaluate before the file body —
this was a real bug that silently fell back to the default `JWT_SECRET`.

**Picks are transactional.** `POST /api/draft/:eventId/pick` advances the pointer with a
conditional `updateMany` inside a transaction, backed by unique constraints on
`(eventId, playerId)` and `(eventId, pickNumber)`. Keep both halves.

**Never `alert()` or `confirm()`.** They block the event loop and stall socket updates.
Use `useToast()` and `useConfirm()`.

## Docker

Build context is the **repo root** (`docker-compose.yml` sets `context: .`) so the
`shared/` workspace is reachable. The root `.dockerignore` matters — without it the whole
repo including `node_modules` ships to the daemon.

## Known gaps

- **No test suite yet.** `shared/` is pure and dependency-free; start there.
- Deleting a player who was drafted or appears in any prediction fails with a bare 500;
  the FKs are `ON DELETE RESTRICT` and `P2003` is not mapped to a real message.
- `/api/events`, the draft state, and all stats endpoints are public — anyone with an
  event id can read every participant's predictions.
- The backend has no ESLint setup (no eslint dependency).
