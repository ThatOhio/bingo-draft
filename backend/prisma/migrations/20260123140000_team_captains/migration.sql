-- DropForeignKey
ALTER TABLE "Event" DROP CONSTRAINT IF EXISTS "Event_captainId_fkey";

-- DropColumn (IF EXISTS for re-runs; requires PostgreSQL)
ALTER TABLE "Event" DROP COLUMN IF EXISTS "captainId";

-- CreateTable
CREATE TABLE "TeamCaptain" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "discordUsername" TEXT NOT NULL,

    CONSTRAINT "TeamCaptain_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeamCaptain_teamId_idx" ON "TeamCaptain"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamCaptain_teamId_playerId_key" ON "TeamCaptain"("teamId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamCaptain_teamId_discordUsername_key" ON "TeamCaptain"("teamId", "discordUsername");

-- AddForeignKey
ALTER TABLE "TeamCaptain" ADD CONSTRAINT "TeamCaptain_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamCaptain" ADD CONSTRAINT "TeamCaptain_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
