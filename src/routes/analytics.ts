import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// Get user analytics
router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    let analytics = await prisma.userAnalytics.findUnique({
      where: { userId: req.user!.id },
    });

    if (!analytics) {
      analytics = await prisma.userAnalytics.create({
        data: { userId: req.user!.id },
      });
    }

    res.json({ analytics });
  } catch (error) {
    next(error);
  }
});

// Get session stats by period
router.get('/sessions', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { period = '30d' } = req.query;

    let startDate = new Date();
    switch (period) {
      case '7d':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(startDate.getDate() - 90);
        break;
      case 'year':
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
      default:
        startDate.setDate(startDate.getDate() - 30);
    }

    const sessions = await prisma.session.findMany({
      where: {
        userId: req.user!.id,
        startedAt: { gte: startDate },
      },
      select: {
        id: true,
        profile: true,
        startedAt: true,
        durationSeconds: true,
        questionsCount: true,
        responsesCount: true,
        status: true,
      },
      orderBy: { startedAt: 'asc' },
    });

    // Aggregate by day
    const dailyStats: Record<string, { sessions: number; duration: number; questions: number }> = {};

    sessions.forEach((session) => {
      const dateKey = session.startedAt.toISOString().split('T')[0];
      if (!dailyStats[dateKey]) {
        dailyStats[dateKey] = { sessions: 0, duration: 0, questions: 0 };
      }
      dailyStats[dateKey].sessions++;
      dailyStats[dateKey].duration += session.durationSeconds;
      dailyStats[dateKey].questions += session.questionsCount;
    });

    // Profile breakdown
    const profileStats: Record<string, number> = {};
    sessions.forEach((session) => {
      profileStats[session.profile] = (profileStats[session.profile] || 0) + 1;
    });

    res.json({
      period,
      totalSessions: sessions.length,
      totalDuration: sessions.reduce((sum, s) => sum + s.durationSeconds, 0),
      totalQuestions: sessions.reduce((sum, s) => sum + s.questionsCount, 0),
      dailyStats,
      profileStats,
    });
  } catch (error) {
    next(error);
  }
});

// Get usage logs
router.get('/usage', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 1, limit = 50, type } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    const where = {
      userId: req.user!.id,
      ...(type && { type: String(type) as 'SESSION' | 'TRANSCRIPTION' | 'AI_RESPONSE' | 'SCREENSHOT_ANALYSIS' }),
    };

    const [logs, total] = await Promise.all([
      prisma.usageLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: Number(limit),
      }),
      prisma.usageLog.count({ where }),
    ]);

    res.json({
      logs,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    next(error);
  }
});

// Get streak info
router.get('/streak', authenticate, async (req: Request, res: Response, next: NextFunction): Promise<Response | void> => {
  try {
    const analytics = await prisma.userAnalytics.findUnique({
      where: { userId: req.user!.id },
      select: {
        currentStreak: true,
        longestStreak: true,
        lastActiveDate: true,
      },
    });

    if (!analytics) {
      return res.json({
        currentStreak: 0,
        longestStreak: 0,
        lastActiveDate: null,
      });
    }

    // Check if streak is still active
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let currentStreak = analytics.currentStreak;

    if (analytics.lastActiveDate) {
      const lastActive = new Date(analytics.lastActiveDate);
      lastActive.setHours(0, 0, 0, 0);

      if (lastActive < yesterday) {
        // Streak broken
        currentStreak = 0;
        await prisma.userAnalytics.update({
          where: { userId: req.user!.id },
          data: { currentStreak: 0 },
        });
      }
    }

    res.json({
      currentStreak,
      longestStreak: analytics.longestStreak,
      lastActiveDate: analytics.lastActiveDate,
    });
  } catch (error) {
    next(error);
  }
});

// Update streak (called after session ends)
router.post('/streak/update', authenticate, async (req: Request, res: Response, next: NextFunction): Promise<Response | void> => {
  try {
    const analytics = await prisma.userAnalytics.findUnique({
      where: { userId: req.user!.id },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (!analytics) {
      await prisma.userAnalytics.create({
        data: {
          userId: req.user!.id,
          currentStreak: 1,
          longestStreak: 1,
          lastActiveDate: today,
        },
      });
      return res.json({ currentStreak: 1, longestStreak: 1 });
    }

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let newStreak = 1;

    if (analytics.lastActiveDate) {
      const lastActive = new Date(analytics.lastActiveDate);
      lastActive.setHours(0, 0, 0, 0);

      if (lastActive.getTime() === today.getTime()) {
        // Already active today
        return res.json({
          currentStreak: analytics.currentStreak,
          longestStreak: analytics.longestStreak,
        });
      } else if (lastActive.getTime() === yesterday.getTime()) {
        // Continue streak
        newStreak = analytics.currentStreak + 1;
      }
    }

    const longestStreak = Math.max(newStreak, analytics.longestStreak);

    await prisma.userAnalytics.update({
      where: { userId: req.user!.id },
      data: {
        currentStreak: newStreak,
        longestStreak,
        lastActiveDate: today,
      },
    });

    res.json({ currentStreak: newStreak, longestStreak });
  } catch (error) {
    next(error);
  }
});

// Get leaderboard (anonymized)
router.get('/leaderboard', authenticate, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const topUsers = await prisma.userAnalytics.findMany({
      take: 10,
      orderBy: { totalSessions: 'desc' },
      select: {
        totalSessions: true,
        totalDuration: true,
        longestStreak: true,
        user: {
          select: {
            name: true,
          },
        },
      },
    });

    // Anonymize names
    const leaderboard = topUsers.map((u, index) => ({
      rank: index + 1,
      name: u.user.name ? u.user.name.charAt(0) + '***' : 'Anonymous',
      totalSessions: u.totalSessions,
      totalHours: Math.round(u.totalDuration / 3600),
      longestStreak: u.longestStreak,
    }));

    res.json({ leaderboard });
  } catch (error) {
    next(error);
  }
});

export default router;
