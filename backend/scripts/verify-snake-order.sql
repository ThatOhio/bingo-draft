-- Verify draft snake order from the database.
-- Replace YOUR_EVENT_ID with your event id (the CUID from the Event table, NOT the event code).
--
-- Step 0: Confirm the draft exists (run this first – if it returns no rows, the event id is wrong or draft was never initialized).
--   Use the event id (e.id), NOT the event code (e."eventCode"), in the queries below.
--
--   SELECT d.id AS draft_order_id, d."eventId", d."currentPick", d."currentRound",
--          array_length(d."teamOrder", 1) AS team_order_length,
--          e.name AS event_name, e."eventCode"
--   FROM "DraftOrder" d
--   JOIN "Event" e ON e.id = d."eventId"
--   WHERE d."eventId" = 'YOUR_EVENT_ID';
--
--   To list all events that have a draft (to copy the correct event id):
--   SELECT e.id, e.name, e."eventCode", e.status, d."currentPick", d."currentRound"
--   FROM "Event" e
--   JOIN "DraftOrder" d ON d."eventId" = e.id
--   ORDER BY e."createdAt" DESC;
--
-- Step 1: Quick check (Round 1 vs Round 2 order – Round 2 should be reverse of Round 1):
--   SELECT "eventId", "currentPick", "currentRound",
--          (SELECT string_agg(t.name, ' → ' ORDER BY ord)
--           FROM unnest("teamOrder"::text[]) WITH ORDINALITY AS u(tid, ord)
--           JOIN "Team" t ON t.id = u.tid AND t."eventId" = "DraftOrder"."eventId"
--           WHERE ord <= (SELECT count(*) FROM "Team" t2 WHERE t2."eventId" = "DraftOrder"."eventId")) AS round1_order,
--          (SELECT string_agg(t.name, ' → ' ORDER BY ord)
--           FROM unnest("teamOrder"::text[]) WITH ORDINALITY AS u(tid, ord)
--           JOIN "Team" t ON t.id = u.tid AND t."eventId" = "DraftOrder"."eventId"
--           WHERE ord > (SELECT count(*) FROM "Team" t2 WHERE t2."eventId" = "DraftOrder"."eventId")
--             AND ord <= 2 * (SELECT count(*) FROM "Team" t2 WHERE t2."eventId" = "DraftOrder"."eventId")) AS round2_order
--   FROM "DraftOrder"
--   WHERE "eventId" = 'YOUR_EVENT_ID';
--
-- Full pick list (first 60 picks with round and team name):
--

WITH picks AS (
  SELECT
    d."eventId",
    u.idx AS pick_number,
    u.team_id,
    (SELECT count(*) FROM "Team" t WHERE t."eventId" = d."eventId") AS num_teams
  FROM "DraftOrder" d,
       unnest(d."teamOrder"::text[]) WITH ORDINALITY AS u(team_id, idx)
)
SELECT
  p.pick_number,
  ((p.pick_number - 1) / p.num_teams) + 1 AS round,
  p.team_id,
  t.name AS team_name
FROM picks p
JOIN "Team" t ON t.id = p.team_id AND t."eventId" = p."eventId"
WHERE p."eventId" = 'YOUR_EVENT_ID'
ORDER BY p.pick_number
LIMIT 60;
