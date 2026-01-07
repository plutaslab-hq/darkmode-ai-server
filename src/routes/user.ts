import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { ApiError } from '../middleware/errorHandler.js';
import crypto from 'crypto';

const router = Router();

// Get user profile
router.get('/profile', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        emailVerified: true,
        subscriptionStatus: true,
        subscriptionPlan: true,
        subscriptionEndDate: true,
        monthlyMinutesUsed: true,
        monthlyMinutesLimit: true,
        preferredLanguage: true,
        preferredProfile: true,
        createdAt: true,
        lastLoginAt: true,
      },
    });

    if (!user) {
      throw ApiError.notFound('User not found');
    }

    res.json({ user });
  } catch (error) {
    next(error);
  }
});

// Update user profile
router.patch('/profile', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, avatarUrl, preferredLanguage, preferredProfile } = req.body;

    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: {
        ...(name !== undefined && { name }),
        ...(avatarUrl !== undefined && { avatarUrl }),
        ...(preferredLanguage !== undefined && { preferredLanguage }),
        ...(preferredProfile !== undefined && { preferredProfile }),
      },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        preferredLanguage: true,
        preferredProfile: true,
      },
    });

    res.json({ user });
  } catch (error) {
    next(error);
  }
});

// Get usage stats
router.get('/usage', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        monthlyMinutesUsed: true,
        monthlyMinutesLimit: true,
        lastUsageReset: true,
        subscriptionStatus: true,
        subscriptionPlan: true,
      },
    });

    if (!user) {
      throw ApiError.notFound('User not found');
    }

    const documentsCount = await prisma.document.count({
      where: { userId: req.user!.id },
    });

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todaySessionsCount = await prisma.session.count({
      where: {
        userId: req.user!.id,
        createdAt: { gte: todayStart },
      },
    });

    res.json({
      usage: {
        minutesUsed: user.monthlyMinutesUsed,
        minutesLimit: user.monthlyMinutesLimit,
        minutesRemaining: Math.max(0, user.monthlyMinutesLimit - user.monthlyMinutesUsed),
        lastReset: user.lastUsageReset,
        documentsCount,
        todaySessionsCount,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Get API keys
router.get('/api-keys', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const apiKeys = await prisma.apiKey.findMany({
      where: { userId: req.user!.id },
      select: {
        id: true,
        name: true,
        key: true,
        lastUsedAt: true,
        expiresAt: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Mask API keys
    const maskedKeys = apiKeys.map((k) => ({
      ...k,
      key: k.key.substring(0, 8) + '...' + k.key.substring(k.key.length - 4),
    }));

    res.json({ apiKeys: maskedKeys });
  } catch (error) {
    next(error);
  }
});

// Create API key
router.post('/api-keys', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, expiresInDays } = req.body;

    if (!name) {
      throw ApiError.badRequest('API key name required');
    }

    const key = 'dk_' + crypto.randomBytes(32).toString('hex');

    let expiresAt: Date | undefined;
    if (expiresInDays) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresInDays);
    }

    const apiKey = await prisma.apiKey.create({
      data: {
        key,
        name,
        userId: req.user!.id,
        expiresAt,
      },
    });

    res.status(201).json({
      message: 'API key created. Save this key - it will not be shown again.',
      apiKey: {
        id: apiKey.id,
        name: apiKey.name,
        key: apiKey.key, // Show full key only on creation
        expiresAt: apiKey.expiresAt,
        createdAt: apiKey.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Revoke API key
router.delete('/api-keys/:id', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const apiKey = await prisma.apiKey.findFirst({
      where: { id, userId: req.user!.id },
    });

    if (!apiKey) {
      throw ApiError.notFound('API key not found');
    }

    await prisma.apiKey.delete({ where: { id } });

    res.json({ message: 'API key revoked' });
  } catch (error) {
    next(error);
  }
});

// Delete account
router.delete('/account', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { password } = req.body;

    if (!password) {
      throw ApiError.badRequest('Password required to delete account');
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
    });

    if (!user) {
      throw ApiError.notFound('User not found');
    }

    // Import bcrypt dynamically to verify password
    const bcrypt = await import('bcryptjs');
    const isValid = await bcrypt.compare(password, user.passwordHash);

    if (!isValid) {
      throw ApiError.unauthorized('Invalid password');
    }

    // Delete user (cascade will handle related records)
    await prisma.user.delete({ where: { id: req.user!.id } });

    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;
