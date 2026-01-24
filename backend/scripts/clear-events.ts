/**
 * Clear all events from the database. Related data (players, teams, draft picks,
 * draft order, submissions) is removed by cascade.
 *
 * DraftOrderSubmissionItem is deleted first because it references Player without
 * onDelete; otherwise Event's cascade to Player hits a foreign key violation.
 *
 * Use before re-running the seed to get a fresh mock event:
 *   npm run db:clear-events
 *   npm run db:seed:event
 *
 * Run from backend: npx tsx scripts/clear-events.ts
 */

import 'dotenv/config';
import prisma from '../src/db';

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Create backend/.env from .env.example.');
    process.exit(1);
  }

  try {
    // Remove submission items first: they reference Player with no onDelete, so
    // Event's cascade to Player would otherwise fail (DraftOrderSubmissionItem_playerId_fkey).
    await prisma.draftOrderSubmissionItem.deleteMany({});
    const { count } = await prisma.event.deleteMany({});
    console.log(`Deleted ${count} event(s).`);
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
