/**
 * Seed script: populate the user DB with test users for local development.
 *
 * Creates:
 *   - 1 ADMIN (seed)
 *   - 2 CAPTAINS (seed)
 *   - 8 PARTICIPANTS (seed)
 *
 * Use --with-event to also create a mock event with a seed captain, players, and teams.
 * Run from backend: npx tsx scripts/seed-users.ts [--with-event]
 *
 * Note: Seed users use fake discordIds (SEED_*) and cannot log in via Discord OAuth.
 * To run a mock draft: log in as your real admin/captain account, create or use the
 * seeded event, add players/teams if needed, then initialize and run the draft.
 */

import 'dotenv/config';
import prisma from '../src/db';

const SEED_USERS = [
  { discordId: 'SEED_admin', discordUsername: 'Admin (seed)', role: 'ADMIN' as const },
  { discordId: 'SEED_captain1', discordUsername: 'Captain One (seed)', role: 'CAPTAIN' as const },
  { discordId: 'SEED_captain2', discordUsername: 'Captain Two (seed)', role: 'CAPTAIN' as const },
  { discordId: 'SEED_user1', discordUsername: 'Alice (seed)', role: 'PARTICIPANT' as const },
  { discordId: 'SEED_user2', discordUsername: 'Bob (seed)', role: 'PARTICIPANT' as const },
  { discordId: 'SEED_user3', discordUsername: 'Carol (seed)', role: 'PARTICIPANT' as const },
  { discordId: 'SEED_user4', discordUsername: 'Dave (seed)', role: 'PARTICIPANT' as const },
  { discordId: 'SEED_user5', discordUsername: 'Eve (seed)', role: 'PARTICIPANT' as const },
  { discordId: 'SEED_user6', discordUsername: 'Frank (seed)', role: 'PARTICIPANT' as const },
  { discordId: 'SEED_user7', discordUsername: 'Grace (seed)', role: 'PARTICIPANT' as const },
  { discordId: 'SEED_user8', discordUsername: 'Henry (seed)', role: 'PARTICIPANT' as const },
];

// Mock event: sample players (generic names for a fantasy-style draft)
const MOCK_PLAYERS = [
  { name: 'Player Alpha', position: 'QB', team: 'Team A' },
  { name: 'Player Bravo', position: 'RB', team: 'Team A' },
  { name: 'Player Charlie', position: 'WR', team: 'Team B' },
  { name: 'Player Delta', position: 'WR', team: 'Team B' },
  { name: 'Player Echo', position: 'TE', team: 'Team C' },
  { name: 'Player Foxtrot', position: 'QB', team: 'Team C' },
  { name: 'Player Golf', position: 'RB', team: 'Team D' },
  { name: 'Player Hotel', position: 'WR', team: 'Team D' },
  { name: 'Player India', position: 'RB', team: 'Team A' },
  { name: 'Player Juliet', position: 'WR', team: 'Team B' },
  { name: 'Player Kilo', position: 'TE', team: 'Team C' },
  { name: 'Player Lima', position: 'QB', team: 'Team D' },
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
  const captain = await prisma.user.findUnique({ where: { discordId: 'SEED_captain1' } });
  if (!captain) {
    throw new Error('Seed captain SEED_captain1 not found. Run user seed first.');
  }

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
      captainId: captain.id,
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
        position: p.position,
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
    console.log('  - In Admin Dashboard → Users: assign CAPTAIN to seed users if desired.');
    console.log('  - Create events while logged in as your real account; you will be the captain.');
    if (withEvent) {
      console.log('  - Mock event MOCK2024: go to Admin → Manage Event to add players/teams, set OPEN, then Initialize Draft.');
    }
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
