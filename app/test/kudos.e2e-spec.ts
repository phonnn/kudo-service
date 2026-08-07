import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { Database } from '@kudo/database';
import { AppModule } from '../src/app.module';
import { DATABASE } from '../src/infra/token.constant';
import { SenderBalanceRepository } from '../src/modules/point/repositories/sender-balance.repository';
import { ReceiverBalanceRepository } from '../src/modules/point/repositories/receiver-balance.repository';

interface FeedPostRow {
  id: string;
  status: 'pending' | 'published' | 'failed';
}

jest.setTimeout(30000);

describe('Kudos (e2e)', () => {
  let app: INestApplication<App>;
  let database: Database;
  let senderBalances: SenderBalanceRepository;
  let receiverBalances: ReceiverBalanceRepository;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    database = app.get<Database>(DATABASE);
    senderBalances = app.get(SenderBalanceRepository);
    receiverBalances = app.get(ReceiverBalanceRepository);
  });

  afterAll(async () => {
    await app.close();
  });

  async function registerUser(): Promise<{ userId: string; token: string }> {
    const email = `${randomUUID()}@example.test`;
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, name: 'Test User', password: 'password123' })
      .expect(201);

    return {
      userId: (response.body as { userId: string }).userId,
      token: (response.body as { tokens: { accessToken: string } }).tokens
        .accessToken,
    };
  }

  async function waitForPostStatus(
    postId: string,
    status: FeedPostRow['status'],
    timeoutMs = 5000,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const row = await database
        .client<{ feed_post: FeedPostRow }>()
        .selectFrom('feed_post')
        .select(['id', 'status'])
        .where('id', '=', postId)
        .executeTakeFirst();

      if (row?.status === status) return;
      if (Date.now() > deadline) {
        throw new Error(
          `feed_post ${postId} did not reach status '${status}' in time (last seen: ${row?.status})`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  describe('POST /kudos', () => {
    it('sends kudos end to end: pending on response, published once the async chain settles', async () => {
      const sender = await registerUser();
      const recipient = await registerUser();
      await senderBalances.provision(sender.userId);
      await receiverBalances.provision(recipient.userId);

      const sendResponse = await request(app.getHttpServer())
        .post('/kudos')
        .set('Authorization', `Bearer ${sender.token}`)
        .set('Idempotency-Key', randomUUID())
        .send({
          recipientId: recipient.userId,
          points: 20,
          tag: 'teamwork',
          description: 'Great job on the release',
        })
        .expect(201);

      expect(sendResponse.body).toEqual({
        transferId: expect.any(String),
        postId: expect.any(String),
        status: 'pending',
      });

      const { postId } = sendResponse.body as { postId: string };
      await waitForPostStatus(postId, 'published');

      const feedResponse = await request(app.getHttpServer())
        .get('/kudos')
        .set('Authorization', `Bearer ${sender.token}`)
        .expect(200);

      const { items } = feedResponse.body as {
        items: {
          id: string;
          kudo: { recipientId: string; points: number } | null;
        }[];
      };
      const published = items.find((item) => item.id === postId);
      expect(published?.kudo).toEqual(
        expect.objectContaining({ recipientId: recipient.userId, points: 20 }),
      );
    });

    it('is idempotent: replaying the same idempotency key returns the original post without reserving budget twice', async () => {
      const sender = await registerUser();
      const recipient = await registerUser();
      await senderBalances.provision(sender.userId);
      await receiverBalances.provision(recipient.userId);
      const idempotencyKey = randomUUID();
      const body = {
        recipientId: recipient.userId,
        points: 15,
        tag: 'ownership',
        description: 'Thanks for the help',
      };

      const first = await request(app.getHttpServer())
        .post('/kudos')
        .set('Authorization', `Bearer ${sender.token}`)
        .set('Idempotency-Key', idempotencyKey)
        .send(body)
        .expect(201);

      const second = await request(app.getHttpServer())
        .post('/kudos')
        .set('Authorization', `Bearer ${sender.token}`)
        .set('Idempotency-Key', idempotencyKey)
        .send(body)
        .expect(201);

      expect(second.body).toEqual(first.body);

      const { postId } = first.body as { postId: string };
      await waitForPostStatus(postId, 'published');

      const remaining = await senderBalances.getRemaining(sender.userId);
      expect(remaining).toBe(200 - 15);
    });

    it('rejects without a bearer token', async () => {
      await request(app.getHttpServer())
        .post('/kudos')
        .set('Idempotency-Key', randomUUID())
        .send({
          recipientId: randomUUID(),
          points: 20,
          tag: 'teamwork',
          description: 'Great job',
        })
        .expect(401);
    });

    it('rejects without an idempotency-key header', async () => {
      const sender = await registerUser();
      await request(app.getHttpServer())
        .post('/kudos')
        .set('Authorization', `Bearer ${sender.token}`)
        .send({
          recipientId: randomUUID(),
          points: 20,
          tag: 'teamwork',
          description: 'Great job',
        })
        .expect(400);
    });

    it('rejects a points value outside the allowed 10-50 range', async () => {
      const sender = await registerUser();
      await request(app.getHttpServer())
        .post('/kudos')
        .set('Authorization', `Bearer ${sender.token}`)
        .set('Idempotency-Key', randomUUID())
        .send({
          recipientId: randomUUID(),
          points: 5,
          tag: 'teamwork',
          description: 'Great job',
        })
        .expect(400);
    });

    it('rejects an unknown tag', async () => {
      const sender = await registerUser();
      await request(app.getHttpServer())
        .post('/kudos')
        .set('Authorization', `Bearer ${sender.token}`)
        .set('Idempotency-Key', randomUUID())
        .send({
          recipientId: randomUUID(),
          points: 20,
          tag: 'not-a-real-tag',
          description: 'Great job',
        })
        .expect(400);
    });
  });
});
