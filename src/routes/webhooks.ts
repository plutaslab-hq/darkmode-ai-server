import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { prisma } from '../lib/prisma.js';
import { config } from '../config/index.js';
import { emailService } from '../services/email.service.js';

const router = Router();

const stripe = new Stripe(config.stripe.secretKey, {
  apiVersion: '2023-10-16',
});

// Stripe webhook handler
router.post('/stripe', async (req: Request, res: Response): Promise<Response | void> => {
  const sig = req.headers['stripe-signature'] as string;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      config.stripe.webhookSecret
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return res.status(400).send(`Webhook Error: ${(err as Error).message}`);
  }

  // Log webhook event
  await prisma.webhookEvent.create({
    data: {
      source: 'stripe',
      eventType: event.type,
      payload: event.data.object as object,
    },
  });

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutComplete(session);
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdate(subscription);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(subscription);
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentSucceeded(invoice);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentFailed(invoice);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    // Mark event as processed
    await prisma.webhookEvent.updateMany({
      where: {
        source: 'stripe',
        eventType: event.type,
        processed: false,
      },
      data: {
        processed: true,
        processedAt: new Date(),
      },
    });

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook processing error:', error);

    // Log error
    await prisma.webhookEvent.updateMany({
      where: {
        source: 'stripe',
        eventType: event.type,
        processed: false,
      },
      data: {
        error: (error as Error).message,
      },
    });

    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.userId;
  if (!userId) return;

  const subscriptionId = session.subscription as string;

  if (subscriptionId) {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    await prisma.user.update({
      where: { id: userId },
      data: {
        subscriptionId,
        subscriptionStatus: 'ACTIVE',
        subscriptionPlan: 'pro',
        subscriptionEndDate: new Date(subscription.current_period_end * 1000),
        monthlyMinutesLimit: 600, // Pro limit
      },
    });
  }
}

async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;

  const user = await prisma.user.findUnique({
    where: { stripeCustomerId: customerId },
  });

  if (!user) return;

  let status: 'FREE' | 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'EXPIRED' = 'FREE';

  switch (subscription.status) {
    case 'active':
      status = 'ACTIVE';
      break;
    case 'trialing':
      status = 'TRIAL';
      break;
    case 'past_due':
      status = 'PAST_DUE';
      break;
    case 'canceled':
      status = 'CANCELED';
      break;
    case 'unpaid':
    case 'incomplete_expired':
      status = 'EXPIRED';
      break;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      subscriptionId: subscription.id,
      subscriptionStatus: status,
      subscriptionEndDate: new Date(subscription.current_period_end * 1000),
      monthlyMinutesLimit: status === 'ACTIVE' ? 600 : 60,
    },
  });
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;

  const user = await prisma.user.findUnique({
    where: { stripeCustomerId: customerId },
  });

  if (!user) return;

  await prisma.user.update({
    where: { id: user.id },
    data: {
      subscriptionId: null,
      subscriptionStatus: 'FREE',
      subscriptionPlan: null,
      subscriptionEndDate: null,
      monthlyMinutesLimit: 60, // Reset to free tier
    },
  });
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;

  const user = await prisma.user.findUnique({
    where: { stripeCustomerId: customerId },
  });

  if (!user) return;

  // Reset monthly usage on successful payment (new billing period)
  await prisma.user.update({
    where: { id: user.id },
    data: {
      monthlyMinutesUsed: 0,
      lastUsageReset: new Date(),
    },
  });
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;

  const user = await prisma.user.findUnique({
    where: { stripeCustomerId: customerId },
  });

  if (!user) return;

  await prisma.user.update({
    where: { id: user.id },
    data: {
      subscriptionStatus: 'PAST_DUE',
    },
  });

  // Send payment failure notification email
  const invoiceUrl = invoice.hosted_invoice_url || undefined;
  await emailService.sendPaymentFailed(user.email, user.name || undefined, invoiceUrl);
}

export default router;
