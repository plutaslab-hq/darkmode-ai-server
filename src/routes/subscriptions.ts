import { Router, Request, Response, NextFunction } from 'express';
import Stripe from 'stripe';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { ApiError } from '../middleware/errorHandler.js';
import { config } from '../config/index.js';

const router = Router();

const stripe = new Stripe(config.stripe.secretKey, {
  apiVersion: '2023-10-16',
});

// Get subscription status
router.get('/status', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        subscriptionStatus: true,
        subscriptionPlan: true,
        subscriptionEndDate: true,
        stripeCustomerId: true,
        monthlyMinutesUsed: true,
        monthlyMinutesLimit: true,
      },
    });

    if (!user) {
      throw ApiError.notFound('User not found');
    }

    res.json({
      subscription: {
        status: user.subscriptionStatus,
        plan: user.subscriptionPlan,
        endDate: user.subscriptionEndDate,
        usage: {
          minutesUsed: user.monthlyMinutesUsed,
          minutesLimit: user.monthlyMinutesLimit,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

// Get available plans
router.get('/plans', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const plans = await prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    res.json({ plans });
  } catch (error) {
    next(error);
  }
});

// Create checkout session
router.post('/checkout', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { priceId, billingPeriod = 'monthly' } = req.body;

    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
    });

    if (!user) {
      throw ApiError.notFound('User not found');
    }

    // Get or create Stripe customer
    let customerId = user.stripeCustomerId;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name || undefined,
        metadata: {
          userId: user.id,
        },
      });
      customerId = customer.id;

      await prisma.user.update({
        where: { id: user.id },
        data: { stripeCustomerId: customerId },
      });
    }

    // Determine price ID
    const stripePriceId = priceId || (billingPeriod === 'yearly'
      ? config.stripe.priceIdYearly
      : config.stripe.priceIdMonthly);

    if (!stripePriceId) {
      throw ApiError.badRequest('Price ID not configured');
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: stripePriceId,
          quantity: 1,
        },
      ],
      success_url: `${config.frontendUrl}/settings/subscription?success=true`,
      cancel_url: `${config.frontendUrl}/settings/subscription?canceled=true`,
      metadata: {
        userId: user.id,
      },
    });

    res.json({ url: session.url });
  } catch (error) {
    next(error);
  }
});

// Create billing portal session
router.post('/portal', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { stripeCustomerId: true },
    });

    if (!user?.stripeCustomerId) {
      throw ApiError.badRequest('No subscription found');
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${config.frontendUrl}/settings/subscription`,
    });

    res.json({ url: session.url });
  } catch (error) {
    next(error);
  }
});

// Cancel subscription
router.post('/cancel', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { subscriptionId: true, stripeCustomerId: true },
    });

    if (!user?.subscriptionId) {
      throw ApiError.badRequest('No active subscription');
    }

    // Cancel at period end
    await stripe.subscriptions.update(user.subscriptionId, {
      cancel_at_period_end: true,
    });

    await prisma.user.update({
      where: { id: req.user!.id },
      data: { subscriptionStatus: 'CANCELED' },
    });

    res.json({ message: 'Subscription will be canceled at the end of the billing period' });
  } catch (error) {
    next(error);
  }
});

// Resume subscription
router.post('/resume', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { subscriptionId: true },
    });

    if (!user?.subscriptionId) {
      throw ApiError.badRequest('No subscription to resume');
    }

    await stripe.subscriptions.update(user.subscriptionId, {
      cancel_at_period_end: false,
    });

    await prisma.user.update({
      where: { id: req.user!.id },
      data: { subscriptionStatus: 'ACTIVE' },
    });

    res.json({ message: 'Subscription resumed' });
  } catch (error) {
    next(error);
  }
});

export default router;
