-- Pre-flight for the migration 20260908120000_draft_pick_unique_constraints.
--
-- That migration adds two unique indexes to "DraftPick":
--   (eventId, playerId)    -- a player can only be drafted once per event
--   (eventId, pickNumber)  -- a pick number can only be used once per event
--
-- Postgres refuses to build a unique index over rows that already violate it, and the
-- old pick race is exactly what could have produced such rows. Run this FIRST.
--
-- Both queries below should return ZERO rows. If they do, the migration will apply
-- cleanly and the api container will run it on startup.
--
-- If either returns rows, reconcile them by hand before deploying. See the bottom of
-- this file for how to inspect and resolve them.

-- Query 1: the same player drafted more than once in an event.
SELECT
  p."eventId",
  e.name        AS event_name,
  p."playerId",
  pl.name       AS player_name,
  COUNT(*)      AS times_drafted,
  array_agg(p."pickNumber" ORDER BY p."pickNumber") AS pick_numbers
FROM "DraftPick" p
JOIN "Event"  e  ON e.id  = p."eventId"
JOIN "Player" pl ON pl.id = p."playerId"
GROUP BY p."eventId", e.name, p."playerId", pl.name
HAVING COUNT(*) > 1
ORDER BY times_drafted DESC;

-- Query 2: the same pick number claimed more than once in an event.
SELECT
  p."eventId",
  e.name       AS event_name,
  p."pickNumber",
  COUNT(*)     AS times_used,
  array_agg(pl.name ORDER BY p.timestamp) AS players,
  array_agg(p.id   ORDER BY p.timestamp)  AS pick_ids
FROM "DraftPick" p
JOIN "Event"  e  ON e.id  = p."eventId"
JOIN "Player" pl ON pl.id = p."playerId"
GROUP BY p."eventId", e.name, p."pickNumber"
HAVING COUNT(*) > 1
ORDER BY times_used DESC;

-- Context, if either query returned rows:
--
--   SELECT p.id, p."pickNumber", p.round, t.name AS team, pl.name AS player, p.timestamp
--   FROM "DraftPick" p
--   JOIN "Team"   t  ON t.id  = p."teamId"
--   JOIN "Player" pl ON pl.id = p."playerId"
--   WHERE p."eventId" = 'YOUR_EVENT_ID'
--   ORDER BY p."pickNumber", p.timestamp;
--
-- Resolving is a judgement call about what actually happened in that draft, so decide
-- which row to keep rather than deleting blind. The later timestamp is usually the
-- accidental duplicate:
--
--   DELETE FROM "DraftPick" WHERE id = 'THE_PICK_ID_TO_DROP';
--
-- Deleting a pick frees that player again but leaves a gap in the pick numbering, and
-- "DraftOrder"."currentPick" may then be ahead of the real pick count. Re-check with:
--
--   SELECT d."currentPick", d."currentRound", COUNT(p.id) AS actual_picks
--   FROM "DraftOrder" d
--   LEFT JOIN "DraftPick" p ON p."eventId" = d."eventId"
--   WHERE d."eventId" = 'YOUR_EVENT_ID'
--   GROUP BY d."currentPick", d."currentRound";
