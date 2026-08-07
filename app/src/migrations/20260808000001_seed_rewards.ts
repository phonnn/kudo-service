import { randomUUID } from 'node:crypto';
import type { Kysely } from 'kysely';

const REWARDS = [
  {
    name: 'Company Hoodie',
    description:
      'Cozy branded hoodie in your size. The classic recognition flex.',
    costPoints: 500,
    stock: 50,
    imageUrl:
      'https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=600&h=400&fit=crop',
  },
  {
    name: 'Friday Afternoon Off',
    description:
      'Clock out at noon this Friday, guilt-free. Fully company-funded.',
    costPoints: 1000,
    stock: null,
    imageUrl:
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&h=400&fit=crop',
  },
  {
    name: 'Premium Coffee Kit',
    description:
      'A bag of specialty beans and a pour-over set for the desk barista.',
    costPoints: 350,
    stock: 40,
    imageUrl:
      'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=600&h=400&fit=crop',
  },
  {
    name: 'Noise-Cancelling Headphones',
    description: 'Block out the open-plan office. Focus mode, unlocked.',
    costPoints: 2500,
    stock: 10,
    imageUrl:
      'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&h=400&fit=crop',
  },
  {
    name: 'Team Lunch Voucher',
    description:
      'Treat yourself (and a colleague) to a proper lunch on the company.',
    costPoints: 600,
    stock: null,
    imageUrl:
      'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&h=400&fit=crop',
  },
  {
    name: 'Extra Personal Day',
    description: 'One additional paid day off, yours to use whenever you like.',
    costPoints: 1500,
    stock: null,
    imageUrl:
      'https://images.unsplash.com/photo-1499796683658-b659bc751db1?w=600&h=400&fit=crop',
  },
  {
    name: 'Mechanical Keyboard',
    description: 'A tactile, clicky upgrade for the people who type all day.',
    costPoints: 1800,
    stock: 15,
    imageUrl:
      'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=600&h=400&fit=crop',
  },
  {
    name: 'Branded Water Bottle',
    description: 'Insulated stainless-steel bottle. Low-cost, always in stock.',
    costPoints: 200,
    stock: null,
    imageUrl:
      'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=600&h=400&fit=crop',
  },
  {
    name: 'Movie Night Voucher',
    description:
      'Two cinema tickets plus snacks. Go see something on the big screen.',
    costPoints: 450,
    stock: 30,
    imageUrl:
      'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=600&h=400&fit=crop',
  },
  {
    name: 'Desk Plant',
    description:
      'A low-maintenance succulent to bring a little life to your workspace.',
    costPoints: 150,
    stock: null,
    imageUrl:
      'https://images.unsplash.com/photo-1485955900006-10f4d324d411?w=600&h=400&fit=crop',
  },
];

export async function up(db: Kysely<any>): Promise<void> {
  await db
    .insertInto('reward')
    .values(
      REWARDS.map((reward) => ({
        id: randomUUID(),
        name: reward.name,
        description: reward.description,
        cost_points: reward.costPoints,
        stock: reward.stock,
        image_url: reward.imageUrl,
        active: true,
      })),
    )
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db
    .deleteFrom('reward')
    .where(
      'name',
      'in',
      REWARDS.map((reward) => reward.name),
    )
    .execute();
}
