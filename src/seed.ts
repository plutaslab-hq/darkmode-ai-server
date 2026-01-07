import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create subscription plans
  const plans = [
    {
      name: 'Free',
      slug: 'free',
      description: 'Perfect for trying out DarkMode AI',
      priceMonthly: 0,
      priceYearly: 0,
      monthlyMinutes: 60,
      maxDocuments: 5,
      maxSessions: 3,
      features: JSON.stringify([
        '60 minutes/month',
        '3 sessions/day',
        '5 document uploads',
        'Basic profiles',
        'Community support',
      ]),
      sortOrder: 0,
    },
    {
      name: 'Pro',
      slug: 'pro',
      description: 'For professionals who need more power',
      priceMonthly: 1999, // $19.99
      priceYearly: 19999, // $199.99 (2 months free)
      monthlyMinutes: 600,
      maxDocuments: 50,
      maxSessions: -1, // unlimited
      features: JSON.stringify([
        '10 hours/month',
        'Unlimited sessions',
        '50 document uploads',
        'All profiles',
        'Priority support',
        'Analytics dashboard',
        'Custom prompts',
      ]),
      sortOrder: 1,
    },
    {
      name: 'Enterprise',
      slug: 'enterprise',
      description: 'For teams and organizations',
      priceMonthly: 9999, // $99.99
      priceYearly: 99999, // $999.99
      monthlyMinutes: -1, // unlimited
      maxDocuments: -1,
      maxSessions: -1,
      features: JSON.stringify([
        'Unlimited usage',
        'Unlimited documents',
        'Team management',
        'API access',
        'Custom integrations',
        'Dedicated support',
        'SLA guarantee',
        'On-premise option',
      ]),
      sortOrder: 2,
    },
  ];

  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { slug: plan.slug },
      update: plan,
      create: plan,
    });
    console.log(`Created plan: ${plan.name}`);
  }

  console.log('Seeding completed!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
