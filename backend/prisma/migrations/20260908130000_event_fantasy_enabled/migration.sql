-- Add Event.fantasyEnabled.
--
-- False means the event uses the tool for the live draft alone: no prediction
-- submissions, no stats, and the event links straight to the draft board.
--
-- Defaults to true so every existing event keeps its current behaviour.

-- AlterTable
ALTER TABLE "Event" ADD COLUMN "fantasyEnabled" BOOLEAN NOT NULL DEFAULT true;
