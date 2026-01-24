-- AlterTable Event: add teamDraftOrder (admin-set order of team IDs before initialize; empty = use default when initializing)
ALTER TABLE "Event" ADD COLUMN "teamDraftOrder" TEXT[] NOT NULL DEFAULT '{}';

-- AlterTable DraftOrderSubmission: add teamOrder (user's predicted team draft order)
ALTER TABLE "DraftOrderSubmission" ADD COLUMN "teamOrder" TEXT[] NOT NULL DEFAULT '{}';
