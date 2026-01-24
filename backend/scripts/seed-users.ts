/**
 * Seed test users for local dev. Creates 1 ADMIN and 10 USERs (fake SEED_* discordIds;
 * they cannot log in via Discord). Use for assigning captains in Manage Event.
 *
 * npm run db:seed        - users only
 * npm run db:seed:event  - users + mock event (MOCK2024)
 * Fresh mock: npm run db:clear-events then npm run db:seed:event
 *
 * To run a mock draft: log in as real admin, create/use an event, add players/teams,
 * assign captains (Discord username), then Initialize Draft.
 */

import 'dotenv/config';
import prisma from '../src/db';

const SEED_USERS = [
  { discordId: 'SEED_admin', discordUsername: 'Admin (seed)', role: 'ADMIN' as const },
  { discordId: 'SEED_user1', discordUsername: 'Alice (seed)', role: 'USER' as const },
  { discordId: 'SEED_user2', discordUsername: 'Bob (seed)', role: 'USER' as const },
  { discordId: 'SEED_user3', discordUsername: 'Carol (seed)', role: 'USER' as const },
  { discordId: 'SEED_user4', discordUsername: 'Dave (seed)', role: 'USER' as const },
  { discordId: 'SEED_user5', discordUsername: 'Eve (seed)', role: 'USER' as const },
  { discordId: 'SEED_user6', discordUsername: 'Frank (seed)', role: 'USER' as const },
  { discordId: 'SEED_user7', discordUsername: 'Grace (seed)', role: 'USER' as const },
  { discordId: 'SEED_user8', discordUsername: 'Henry (seed)', role: 'USER' as const },
  { discordId: 'SEED_captain1', discordUsername: 'Captain One (seed)', role: 'USER' as const },
  { discordId: 'SEED_captain2', discordUsername: 'Captain Two (seed)', role: 'USER' as const },
];

// Mock event: sample players (generic names for a fantasy-style draft)
const MOCK_PLAYERS = [
  { name: 'Player Alpha', team: 'Team A' },
  { name: 'Player Bravo', team: 'Team A' },
  { name: 'Player Charlie', team: 'Team B' },
  { name: 'Player Delta', team: 'Team B' },
  { name: 'Player Echo', team: 'Team C' },
  { name: 'Player Foxtrot', team: 'Team C' },
  { name: 'Player Golf', team: 'Team D' },
  { name: 'Player Hotel', team: 'Team D' },
  { name: 'Player India', team: 'Team A' },
  { name: 'Player Juliet', team: 'Team B' },
  { name: 'Player Kilo', team: 'Team C' },
  { name: 'Player Lima', team: 'Team D' },
];

const MOCK_TEAMS = ['Team A', 'Team B', 'Team C', 'Team D'];

async function seedUsers() {
  console.log('Seeding users...');
  const created: string[] = [];
  for (const u of SEED_USERS) {
    const user = await prisma.user.upsert({
      where: { discordId: u.discordId },
      create: { discordId: u.discordId, discordUsername: u.discordUsername, role: u.role },
      update: { discordUsername: u.discordUsername, role: u.role },
    });
    created.push(`${u.discordUsername} (${u.role})`);
  }
  console.log('  Created/updated:', created.join(', '));
  return SEED_USERS;
}

async function seedEvent() {
  const eventCode = 'MOCK2024';
  const existing = await prisma.event.findUnique({ where: { eventCode } });
  if (existing) {
    console.log(`  Event ${eventCode} already exists, skipping.`);
    return existing;
  }

  const event = await prisma.event.create({
    data: {
      name: 'Mock Draft Event',
      description: 'Seeded event for local testing. Add more players/teams in Admin → Manage Event.',
      eventCode,
      status: 'OPEN',
    },
  });

  for (const t of MOCK_TEAMS) {
    await prisma.team.create({
      data: { eventId: event.id, name: t },
    });
  }

  const event2 = await prisma.event.findUnique({
    where: { id: event.id },
    include: { teams: true },
  });
  if (!event2) throw new Error('Event not found after create');

  for (const p of MOCK_PLAYERS) {
    await prisma.player.create({
      data: {
        eventId: event.id,
        name: p.name,
        team: p.team,
      },
    });
  }

  console.log(`  Event "${event.name}" (${eventCode}) created with ${MOCK_TEAMS.length} teams and ${MOCK_PLAYERS.length} players.`);
  return event;
}

async function main() {
  const withEvent = process.argv.includes('--with-event');

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Create backend/.env from .env.example.');
    process.exit(1);
  }

  try {
    await seedUsers();
    if (withEvent) {
      console.log('Seeding mock event...');
      await seedEvent();
    }
    console.log('\nDone. Seed users cannot log in via Discord (fake discordIds).');
    console.log('  - Create events while logged in as an ADMIN. In Manage Event, add teams and assign captains (player + Discord username).');
    if (withEvent) {
      console.log('  - Mock event MOCK2024: go to Admin → Manage Event to add players, add teams with captains, set OPEN, then Initialize Draft.');
    }
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
