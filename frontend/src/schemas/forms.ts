import { z } from 'zod'

/** Create event: name, eventCode required; optional description and datetimes. */
export const createEventSchema = z.object({
	name: z.string().min(1, 'Event name is required'),
	eventCode: z.string().min(3, 'Code must be at least 3 characters').max(20, 'Code must be at most 20 characters'),
	description: z.string().optional(),
	draftDeadline: z.string().optional(),
	draftStartTime: z.string().optional(),
})

/** Create team: name required; captains optional (empty rows filtered out on submit). */
export const createTeamSchema = z.object({
	name: z.string().min(1, 'Team name is required'),
	captains: z.array(z.object({
		playerId: z.string(),
		discordUsername: z.string(),
	})).optional().default([]),
})

/** Bulk import: raw text with one player per line. */
export const bulkImportSchema = z.object({
	text: z.string().min(1, 'Please enter player names'),
})

export type CreateEventForm = z.infer<typeof createEventSchema>
export type CreateTeamForm = z.infer<typeof createTeamSchema>
export type BulkImportForm = z.infer<typeof bulkImportSchema>
