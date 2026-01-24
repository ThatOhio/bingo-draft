import express from 'express';
import { z } from 'zod';
import prisma from '../db';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';

const router = express.Router();

const createEventSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  eventCode: z.string().min(3).max(20),
  draftDeadline: z.string().datetime().optional(),
  draftStartTime: z.string().datetime().optional(),
});

const updateEventSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.enum(['PLANNED', 'OPEN', 'DRAFTING', 'PAUSED', 'COMPLETED', 'CLOSED']).optional(),
  draftDeadline: z.string().datetime().optional(),
  draftStartTime: z.string().datetime().optional(),
});

// Get all events (public)
router.get('/', async (req, res) => {
  try {
    const events = await prisma.event.findMany({
      include: {
        captain: {
          select: {
            id: true,
            discordUsername: true,
          },
        },
        _count: {
          select: {
            participants: true,
            players: true,
            teams: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json({ events });
  } catch (error) {
    console.error('Get events error:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// Get event by code (public)
router.get('/code/:eventCode', async (req, res) => {
  try {
    const { eventCode } = req.params;
    const event = await prisma.event.findUnique({
      where: { eventCode },
      include: {
        captain: {
          select: {
            id: true,
            discordUsername: true,
          },
        },
        players: {
          orderBy: {
            name: 'asc',
          },
        },
        teams: {
          orderBy: {
            name: 'asc',
          },
        },
        _count: {
          select: {
            participants: true,
          },
        },
      },
    });

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    res.json({ event });
  } catch (error) {
    console.error('Get event error:', error);
    res.status(500).json({ error: 'Failed to fetch event' });
  }
});

// Get single event
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const event = await prisma.event.findUnique({
      where: { id },
      include: {
        captain: {
          select: {
            id: true,
            discordUsername: true,
          },
        },
        players: {
          orderBy: {
            name: 'asc',
          },
        },
        teams: {
          orderBy: {
            name: 'asc',
          },
        },
        draftOrder: true,
        _count: {
          select: {
            participants: true,
            draftPicks: true,
          },
        },
      },
    });

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    res.json({ event });
  } catch (error) {
    console.error('Get event error:', error);
    res.status(500).json({ error: 'Failed to fetch event' });
  }
});

// Create event (admin/captain only)
router.post('/', authenticate, requireRole('ADMIN', 'CAPTAIN'), async (req: AuthRequest, res) => {
  try {
    const data = createEventSchema.parse(req.body);
    const userId = req.userId!;

    // Check if event code already exists
    const existingEvent = await prisma.event.findUnique({
      where: { eventCode: data.eventCode },
    });

    if (existingEvent) {
      return res.status(400).json({ error: 'Event code already exists' });
    }

    const event = await prisma.event.create({
      data: {
        ...data,
        draftDeadline: data.draftDeadline ? new Date(data.draftDeadline) : null,
        draftStartTime: data.draftStartTime ? new Date(data.draftStartTime) : null,
        captainId: userId,
      },
      include: {
        captain: {
          select: {
            id: true,
            discordUsername: true,
          },
        },
      },
    });

    res.status(201).json({ event });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Create event error:', error);
    res.status(500).json({ error: 'Failed to create event' });
  }
});

// Update event
router.put('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const data = updateEventSchema.parse(req.body);

    // Check permissions
    const event = await prisma.event.findUnique({
      where: { id },
    });

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const isAdmin = req.userRole === 'ADMIN';
    const isCaptain = event.captainId === req.userId;

    if (!isAdmin && !isCaptain) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const updatedEvent = await prisma.event.update({
      where: { id },
      data: {
        ...data,
        draftDeadline: data.draftDeadline ? new Date(data.draftDeadline) : undefined,
        draftStartTime: data.draftStartTime ? new Date(data.draftStartTime) : undefined,
      },
      include: {
        captain: {
          select: {
            id: true,
            discordUsername: true,
          },
        },
      },
    });

    res.json({ event: updatedEvent });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Update event error:', error);
    res.status(500).json({ error: 'Failed to update event' });
  }
});

// Bulk import players from text (pasteable list)
router.post('/:id/players/bulk-import', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { text } = req.body; // Text with one player per line

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text content is required' });
    }

    // Check permissions
    const event = await prisma.event.findUnique({
      where: { id },
    });

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const isAdmin = req.userRole === 'ADMIN';
    const isCaptain = event.captainId === req.userId;

    if (!isAdmin && !isCaptain) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    // Parse text: one player per line, optionally with format "Name | Team | Notes"
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    const players = lines.map(line => {
      const parts = line.split('|').map(p => p.trim());
      return {
        name: parts[0] || line.trim(),
        team: parts[1] || null,
        notes: parts[2] || null,
      };
    });

    // Delete existing players
    await prisma.player.deleteMany({
      where: { eventId: id },
    });

    // Create new players
    const createdPlayers = await prisma.player.createMany({
      data: players.map((p) => ({
        eventId: id,
        name: p.name,
        team: p.team || null,
        notes: p.notes || null,
      })),
    });

    res.json({ count: createdPlayers.count, players: createdPlayers });
  } catch (error) {
    console.error('Bulk import players error:', error);
    res.status(500).json({ error: 'Failed to bulk import players' });
  }
});

// Import players
router.post('/:id/players/import', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { players } = req.body;

    if (!Array.isArray(players)) {
      return res.status(400).json({ error: 'Players must be an array' });
    }

    // Check permissions
    const event = await prisma.event.findUnique({
      where: { id },
    });

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const isAdmin = req.userRole === 'ADMIN';
    const isCaptain = event.captainId === req.userId;

    if (!isAdmin && !isCaptain) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    // Delete existing players
    await prisma.player.deleteMany({
      where: { eventId: id },
    });

    // Create new players
    const createdPlayers = await prisma.player.createMany({
      data: players.map((p: any) => ({
        eventId: id,
        name: p.name,
        team: p.team || null,
        notes: p.notes || null,
      })),
    });

    res.json({ count: createdPlayers.count });
  } catch (error) {
    console.error('Import players error:', error);
    res.status(500).json({ error: 'Failed to import players' });
  }
});

// Add team
router.post('/:id/teams', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Team name is required' });
    }

    // Check permissions
    const event = await prisma.event.findUnique({
      where: { id },
    });

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const isAdmin = req.userRole === 'ADMIN';
    const isCaptain = event.captainId === req.userId;

    if (!isAdmin && !isCaptain) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const team = await prisma.team.create({
      data: {
        eventId: id,
        name,
      },
    });

    res.status(201).json({ team });
  } catch (error) {
    console.error('Create team error:', error);
    res.status(500).json({ error: 'Failed to create team' });
  }
});

export default router;
