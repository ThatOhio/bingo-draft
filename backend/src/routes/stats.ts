import express from 'express';
import prisma from '../db';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = express.Router();

// Get rankings for an event
router.get('/:eventId/rankings', async (req, res) => {
  try {
    const { eventId } = req.params;

    // Get event and actual draft picks
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        draftPicks: {
          include: {
            player: true,
          },
          orderBy: {
            pickNumber: 'asc',
          },
        },
      },
    });

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Only show rankings if draft is completed
    if (event.status !== 'COMPLETED') {
      return res.json({ rankings: [], message: 'Rankings will be available after the draft completes' });
    }

    // Get all submissions
    const submissions = await prisma.draftOrderSubmission.findMany({
      where: { eventId },
      include: {
        user: {
          select: {
            id: true,
            discordUsername: true,
          },
        },
        items: {
          include: {
            player: true,
          },
          orderBy: {
            position: 'asc',
          },
        },
      },
    });

    // Calculate scores
    const actualOrder = event.draftPicks.map(p => ({
      playerId: p.playerId,
      pickNumber: p.pickNumber,
    }));

    const rankings = submissions.map(submission => {
      const userOrder = submission.items.map(item => ({
        playerId: item.playerId,
        predictedPosition: item.position,
      }));

      // Calculate accuracy: how many picks match exactly
      let exactMatches = 0;
      let closeMatches = 0; // Within 3 positions
      const matchDetails: Array<{
        playerName: string;
        predicted: number;
        actual: number;
        difference: number;
      }> = [];

      userOrder.forEach(userPick => {
        const actualPick = actualOrder.find(ap => ap.playerId === userPick.playerId);
        if (actualPick) {
          const difference = Math.abs(userPick.predictedPosition - actualPick.pickNumber);
          if (difference === 0) {
            exactMatches++;
          } else if (difference <= 3) {
            closeMatches++;
          }

          const player = submission.items.find(i => i.playerId === userPick.playerId)?.player;
          if (player) {
            matchDetails.push({
              playerName: player.name,
              predicted: userPick.predictedPosition,
              actual: actualPick.pickNumber,
              difference,
            });
          }
        }
      });

      // Calculate score (exact matches worth more)
      const score = exactMatches * 10 + closeMatches * 3;

      return {
        userId: submission.user.id,
        userName: submission.user.discordUsername,
        exactMatches,
        closeMatches,
        score,
        totalPlayers: userOrder.length,
        matchDetails: matchDetails.sort((a, b) => a.difference - b.difference),
      };
    });

    // Sort by score (descending)
    rankings.sort((a, b) => b.score - a.score);

    // Add rank
    const rankingsWithRank = rankings.map((ranking, index) => ({
      ...ranking,
      rank: index + 1,
    }));

    res.json({ rankings: rankingsWithRank });
  } catch (error) {
    console.error('Get rankings error:', error);
    res.status(500).json({ error: 'Failed to calculate rankings' });
  }
});

// Get user's stats
router.get('/:eventId/my-stats', authenticate, async (req: AuthRequest, res) => {
  try {
    const { eventId } = req.params;
    const userId = req.userId!;

    // Get user's submission
    const submission = await prisma.draftOrderSubmission.findUnique({
      where: {
        userId_eventId: {
          userId,
          eventId,
        },
      },
      include: {
        items: {
          include: {
            player: true,
          },
          orderBy: {
            position: 'asc',
          },
        },
      },
    });

    if (!submission) {
      return res.status(404).json({ error: 'No submission found' });
    }

    // Get actual draft picks
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        draftPicks: {
          include: {
            player: true,
            team: true,
          },
          orderBy: {
            pickNumber: 'asc',
          },
        },
      },
    });

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Calculate stats
    const actualOrder = event.draftPicks.map(p => ({
      playerId: p.playerId,
      pickNumber: p.pickNumber,
      player: p.player,
      team: p.team,
    }));

    const userOrder = submission.items.map(item => ({
      playerId: item.playerId,
      predictedPosition: item.position,
      player: item.player,
    }));

    let exactMatches = 0;
    let closeMatches = 0;
    const matchDetails: Array<{
      playerName: string;
      predicted: number;
      actual: number | null;
      difference: number | null;
      team: string | null;
    }> = [];

    userOrder.forEach(userPick => {
      const actualPick = actualOrder.find(ap => ap.playerId === userPick.playerId);
      if (actualPick) {
        const difference = Math.abs(userPick.predictedPosition - actualPick.pickNumber);
        if (difference === 0) {
          exactMatches++;
        } else if (difference <= 3) {
          closeMatches++;
        }

        matchDetails.push({
          playerName: userPick.player.name,
          predicted: userPick.predictedPosition,
          actual: actualPick.pickNumber,
          difference,
          team: actualPick.team.name,
        });
      } else {
        // Player not yet drafted
        matchDetails.push({
          playerName: userPick.player.name,
          predicted: userPick.predictedPosition,
          actual: null,
          difference: null,
          team: null,
        });
      }
    });

    const score = exactMatches * 10 + closeMatches * 3;

    res.json({
      submission: {
        submittedAt: submission.submittedAt,
        locked: submission.locked,
      },
      stats: {
        exactMatches,
        closeMatches,
        score,
        totalPlayers: userOrder.length,
        matchDetails: matchDetails.sort((a, b) => {
          if (a.actual === null) return 1;
          if (b.actual === null) return -1;
          return (a.difference || 0) - (b.difference || 0);
        }),
      },
    });
  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Export data (admin/captain only)
router.get('/:eventId/export', authenticate, async (req: AuthRequest, res) => {
  try {
    const { eventId } = req.params;

    // Check permissions
    const event = await prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const isAdmin = req.userRole === 'ADMIN';
    const isCaptain = event.captainId === req.userId;

    if (!isAdmin && !isCaptain) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    // Get all data
    const eventData = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        players: true,
        teams: {
          include: {
            draftPicks: {
              include: {
                player: true,
              },
              orderBy: {
                pickNumber: 'asc',
              },
            },
          },
        },
        draftPicks: {
          include: {
            team: true,
            player: true,
          },
          orderBy: {
            pickNumber: 'asc',
          },
        },
        submissions: {
          include: {
            user: {
              select: {
                id: true,
                discordUsername: true,
              },
            },
            items: {
              include: {
                player: true,
              },
              orderBy: {
                position: 'asc',
              },
            },
          },
        },
      },
    });

    res.json({ event: eventData });
  } catch (error) {
    console.error('Export data error:', error);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

export default router;
