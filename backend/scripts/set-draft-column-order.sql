-- Set live draft board column order for an event already in DRAFTING.
-- This only changes the order of columns on the live draft page (display).
-- Who picks when is unchanged; use this to reorder teams on the board.
--
-- Step 1: List events in DRAFTING and their teams (run and note event id + team ids in desired order):
--
--   SELECT e.id AS event_id, e.name AS event_name, e."eventCode",
--          t.id AS team_id, t.name AS team_name
--   FROM "Event" e
--   JOIN "Team" t ON t."eventId" = e.id
--   WHERE e.status = 'DRAFTING'
--   ORDER BY e.id, t.name;
--
-- Step 2: Build the ARRAY of team IDs in the column order you want (left to right).
-- Step 3: Run the UPDATE below with your event id and team id array.
--
-- Example for 4 teams (use your real CUIDs):
-- UPDATE "Event"
-- SET "teamDraftOrder" = ARRAY['team_id_1', 'team_id_2', 'team_id_3', 'team_id_4']::text[]
-- WHERE id = 'EVENT_ID';

UPDATE "Event"
SET "teamDraftOrder" = ARRAY[
  'REPLACE_WITH_TEAM_ID_1',
  'REPLACE_WITH_TEAM_ID_2',
  'REPLACE_WITH_TEAM_ID_3'
  -- add more team IDs in the order you want columns
]::text[]
WHERE id = 'REPLACE_WITH_EVENT_ID';
