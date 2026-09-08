-- Extract the order in which players were drafted in a specific live draft.
-- Replace YOUR_EVENT_ID with the event id (CUID from Event table), or use the optional
-- event-code variant below.
--
-- To find the event id for an event code:
--   SELECT id, name, "eventCode", status FROM "Event" WHERE "eventCode" = 'YOUR_EVENT_CODE';
--

-- By event id (recommended)
SELECT
  dp."pickNumber"   AS pick_number,
  dp.round          AS round,
  t.name            AS team_name,
  p.name            AS player_name,
  dp."timestamp"    AS picked_at
FROM "DraftPick" dp
JOIN "Player" p   ON p.id = dp."playerId"
JOIN "Team" t     ON t.id = dp."teamId" AND t."eventId" = dp."eventId"
WHERE dp."eventId" = 'YOUR_EVENT_ID'
ORDER BY dp."pickNumber";

-- Optional: by event code (uncomment and replace YOUR_EVENT_CODE)
--
-- SELECT
--   dp."pickNumber"   AS pick_number,
--   dp.round          AS round,
--   t.name            AS team_name,
--   p.name            AS player_name,
--   dp."timestamp"    AS picked_at
-- FROM "DraftPick" dp
-- JOIN "Event" e   ON e.id = dp."eventId" AND e."eventCode" = 'YOUR_EVENT_CODE'
-- JOIN "Player" p  ON p.id = dp."playerId"
-- JOIN "Team" t    ON t.id = dp."teamId" AND t."eventId" = dp."eventId"
-- ORDER BY dp."pickNumber";
