-- Close the pick race on DraftPick.
--
-- The pick endpoint previously did a check-then-write with no transaction and nothing in
-- the database to fall back on, so two simultaneous picks could draft the same player or
-- claim the same pick number. The handler now advances the pointer inside a transaction;
-- these indexes are what make the bad states unrepresentable.
--
-- Run scripts/check-duplicate-picks.ts first: Postgres refuses to build a unique index
-- over rows that already violate it.

-- CreateIndex
CREATE UNIQUE INDEX "DraftPick_eventId_playerId_key" ON "DraftPick"("eventId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "DraftPick_eventId_pickNumber_key" ON "DraftPick"("eventId", "pickNumber");
