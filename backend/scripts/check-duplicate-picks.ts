/**
 * Pre-flight check for the unique constraints on DraftPick.
 *
 * The pick race this migration closes could produce two picks sharing a player or a pick
 * number within an event. Postgres will refuse to create the unique indexes while any
 * such row pair exists, so run this before migrating:
 *
 *   npx tsx scripts/check-duplicate-picks.ts
 *
 * Read-only. Exits non-zero when duplicates are found.
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

interface DuplicateRow {
	eventId: string
	value: string
	n: number
}

async function main(): Promise<void> {
	const totals = await prisma.$queryRawUnsafe<Array<{ total_picks: number; events: number }>>(
		'SELECT COUNT(*)::int AS total_picks, COUNT(DISTINCT "eventId")::int AS events FROM "DraftPick"',
	)
	console.log(
		`DraftPick rows: ${totals[0]?.total_picks ?? 0} across ${totals[0]?.events ?? 0} event(s)`,
	)

	const byPlayer = await prisma.$queryRawUnsafe<DuplicateRow[]>(
		`SELECT "eventId", "playerId"::text AS value, COUNT(*)::int AS n
		 FROM "DraftPick" GROUP BY 1, 2 HAVING COUNT(*) > 1 ORDER BY n DESC`,
	)
	const byPickNumber = await prisma.$queryRawUnsafe<DuplicateRow[]>(
		`SELECT "eventId", "pickNumber"::text AS value, COUNT(*)::int AS n
		 FROM "DraftPick" GROUP BY 1, 2 HAVING COUNT(*) > 1 ORDER BY n DESC`,
	)

	console.log(`Duplicate (eventId, playerId):   ${byPlayer.length}`)
	for (const row of byPlayer) {
		console.log(`  event ${row.eventId} player ${row.value} drafted ${row.n} times`)
	}
	console.log(`Duplicate (eventId, pickNumber): ${byPickNumber.length}`)
	for (const row of byPickNumber) {
		console.log(`  event ${row.eventId} pick #${row.value} used ${row.n} times`)
	}

	if (byPlayer.length > 0 || byPickNumber.length > 0) {
		console.error('\nDuplicates present. Reconcile them by hand before running the migration.')
		process.exitCode = 1
		return
	}
	console.log('\nNo duplicates. Safe to add the unique constraints.')
}

main()
	.catch((err) => {
		console.error('Check failed:', err instanceof Error ? err.message : err)
		process.exitCode = 1
	})
	.finally(() => prisma.$disconnect())
