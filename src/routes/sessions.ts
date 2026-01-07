import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { ApiError } from '../middleware/errorHandler.js';
import { config } from '../config/index.js';

const router = Router();

// Get all sessions
router.get('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 1, limit = 20, profile } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    const where = {
      userId: req.user!.id,
      ...(profile && { profile: String(profile) }),
    };

    const [sessions, total] = await Promise.all([
      prisma.session.findMany({
        where,
        select: {
          id: true,
          profile: true,
          language: true,
          startedAt: true,
          endedAt: true,
          durationSeconds: true,
          questionsCount: true,
          responsesCount: true,
          status: true,
        },
        orderBy: { startedAt: 'desc' },
        skip,
        take: Number(limit),
      }),
      prisma.session.count({ where }),
    ]);

    res.json({
      sessions,
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

// Get single session
router.get('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const session = await prisma.session.findFirst({
      where: {
        id: req.params.id,
        userId: req.user!.id,
      },
    });

    if (!session) {
      throw ApiError.notFound('Session not found');
    }

    res.json({ session });
  } catch (error) {
    next(error);
  }
});

// Create session
router.post('/', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { profile, language } = req.body;

    // Check daily session limit
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { subscriptionStatus: true, monthlyMinutesUsed: true, monthlyMinutesLimit: true },
    });

    if (!user) {
      throw ApiError.notFound('User not found');
    }

    // Check usage limits based on plan
    const planKey = user.subscriptionStatus === 'ACTIVE' ? 'pro' : 'free';
    const planLimits = config.plans[planKey as keyof typeof config.plans];

    if (planLimits.maxSessionsPerDay !== -1) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const todaySessions = await prisma.session.count({
        where: {
          userId: req.user!.id,
          createdAt: { gte: todayStart },
        },
      });

      if (todaySessions >= planLimits.maxSessionsPerDay) {
        throw ApiError.tooManyRequests('Daily session limit reached. Upgrade for unlimited sessions.');
      }
    }

    // Check minutes limit
    if (user.monthlyMinutesUsed >= user.monthlyMinutesLimit) {
      throw ApiError.tooManyRequests('Monthly minutes limit reached. Upgrade for more minutes.');
    }

    const session = await prisma.session.create({
      data: {
        userId: req.user!.id,
        profile: profile || 'interview',
        language: language || 'en-US',
      },
    });

    res.status(201).json({ session });
  } catch (error) {
    next(error);
  }
});

// Update session
router.patch('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { messages, questionsCount, responsesCount, screenshotsCount, status } = req.body;

    const session = await prisma.session.findFirst({
      where: {
        id: req.params.id,
        userId: req.user!.id,
      },
    });

    if (!session) {
      throw ApiError.notFound('Session not found');
    }

    const updateData: Record<string, unknown> = {};

    if (messages !== undefined) updateData.messages = messages;
    if (questionsCount !== undefined) updateData.questionsCount = questionsCount;
    if (responsesCount !== undefined) updateData.responsesCount = responsesCount;
    if (screenshotsCount !== undefined) updateData.screenshotsCount = screenshotsCount;
    if (status !== undefined) updateData.status = status;

    const updatedSession = await prisma.session.update({
      where: { id: req.params.id },
      data: updateData,
    });

    res.json({ session: updatedSession });
  } catch (error) {
    next(error);
  }
});

// End session
router.post('/:id/end', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const session = await prisma.session.findFirst({
      where: {
        id: req.params.id,
        userId: req.user!.id,
        status: 'ACTIVE',
      },
    });

    if (!session) {
      throw ApiError.notFound('Active session not found');
    }

    const endedAt = new Date();
    const durationSeconds = Math.floor((endedAt.getTime() - session.startedAt.getTime()) / 1000);
    const durationMinutes = Math.ceil(durationSeconds / 60);

    // Update session
    const updatedSession = await prisma.session.update({
      where: { id: req.params.id },
      data: {
        endedAt,
        durationSeconds,
        status: 'COMPLETED',
      },
    });

    // Update user usage
    await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        monthlyMinutesUsed: { increment: durationMinutes },
      },
    });

    // Update analytics
    await prisma.userAnalytics.upsert({
      where: { userId: req.user!.id },
      update: {
        totalSessions: { increment: 1 },
        totalDuration: { increment: durationSeconds },
        totalQuestions: { increment: session.questionsCount },
        totalResponses: { increment: session.responsesCount },
      },
      create: {
        userId: req.user!.id,
        totalSessions: 1,
        totalDuration: durationSeconds,
        totalQuestions: session.questionsCount,
        totalResponses: session.responsesCount,
      },
    });

    // Log usage
    await prisma.usageLog.create({
      data: {
        userId: req.user!.id,
        type: 'SESSION',
        minutes: durationMinutes,
        sessionId: session.id,
        metadata: {
          profile: session.profile,
          questions: session.questionsCount,
          responses: session.responsesCount,
        },
      },
    });

    res.json({
      session: updatedSession,
      usage: {
        durationMinutes,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Delete session
router.delete('/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const session = await prisma.session.findFirst({
      where: {
        id: req.params.id,
        userId: req.user!.id,
      },
    });

    if (!session) {
      throw ApiError.notFound('Session not found');
    }

    await prisma.session.delete({ where: { id: req.params.id } });

    res.json({ message: 'Session deleted' });
  } catch (error) {
    next(error);
  }
});

export default router;
