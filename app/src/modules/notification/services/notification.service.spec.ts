import { Test } from '@nestjs/testing';
import type { RealtimePush } from '@kudo/realtime';
import { REALTIME_PUSH } from '../../../infra/token.constant';
import { NotificationType } from '../dto/notification-type.enum';
import { InvalidCursorError } from '../errors/invalid-cursor.error';
import { NotificationRepository } from '../repositories/notification.repository';
import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  describe('notify', () => {
    it('persists the notification and pushes it in realtime when it is genuinely new', async () => {
      const { service, deps } = await createService();
      const created = {
        id: 'notif-1',
        type: NotificationType.COMMENT,
        payload: { postId: 'post-1' },
        readAt: null,
        createdAt: new Date(),
      };
      deps.notifications.create.mockResolvedValue(created);

      await service.notify({
        userId: 'user-1',
        type: NotificationType.COMMENT,
        refId: 'event-1',
        payload: { postId: 'post-1' },
      });

      expect(deps.realtime.publish).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ data: created }),
      );
    });

    it('does not push when create() reports a dedup (redelivery of the same event)', async () => {
      const { service, deps } = await createService();
      deps.notifications.create.mockResolvedValue(null);

      await service.notify({
        userId: 'user-1',
        type: NotificationType.COMMENT,
        refId: 'event-1',
        payload: {},
      });

      expect(deps.realtime.publish).not.toHaveBeenCalled();
    });
  });

  describe('listForUser', () => {
    it('caps the limit at MAX_LIMIT and returns no cursor short of a full page', async () => {
      const { service, deps } = await createService();
      deps.notifications.listForUser.mockResolvedValue([
        {
          id: 'notif-1',
          type: NotificationType.COMMENT,
          payload: {},
          readAt: null,
          createdAt: new Date(),
        },
      ]);

      const page = await service.listForUser('user-1', 999, undefined);

      expect(deps.notifications.listForUser).toHaveBeenCalledWith(
        'user-1',
        50,
        null,
      );
      expect(page.nextCursor).toBeNull();
    });

    it('returns a cursor when the page is full', async () => {
      const { service, deps } = await createService();
      const createdAt = new Date('2026-01-01T00:00:00.000Z');
      deps.notifications.listForUser.mockResolvedValue([
        {
          id: 'notif-1',
          type: NotificationType.COMMENT,
          payload: {},
          readAt: null,
          createdAt,
        },
      ]);

      const page = await service.listForUser('user-1', 1, undefined);
      expect(page.nextCursor).not.toBeNull();
    });

    it('round-trips a cursor produced by a prior page through decode -> repository call', async () => {
      const { service, deps } = await createService();
      const createdAt = new Date('2026-01-01T00:00:00.000Z');
      const cursor = Buffer.from(
        JSON.stringify({ createdAt: createdAt.toISOString(), id: 'notif-1' }),
      ).toString('base64url');
      deps.notifications.listForUser.mockResolvedValue([]);

      await service.listForUser('user-1', 20, cursor);

      expect(deps.notifications.listForUser).toHaveBeenCalledWith(
        'user-1',
        20,
        { createdAt, id: 'notif-1' },
      );
    });

    it('throws InvalidCursorError on a malformed cursor', async () => {
      const { service } = await createService();
      await expect(
        service.listForUser('user-1', 20, 'not-a-valid-cursor'),
      ).rejects.toThrow(InvalidCursorError);
    });
  });

  describe('markRead', () => {
    it('delegates to the repository, scoped by user', async () => {
      const { service, deps } = await createService();
      deps.notifications.markRead.mockResolvedValue(true);

      await expect(service.markRead('notif-1', 'user-1')).resolves.toBe(true);
      expect(deps.notifications.markRead).toHaveBeenCalledWith(
        'notif-1',
        'user-1',
      );
    });
  });
});

interface MockDeps {
  notifications: jest.Mocked<
    Pick<NotificationRepository, 'create' | 'listForUser' | 'markRead'>
  >;
  realtime: jest.Mocked<Pick<RealtimePush, 'publish'>>;
}

function createDeps(): MockDeps {
  return {
    notifications: {
      create: jest.fn(),
      listForUser: jest.fn().mockResolvedValue([]),
      markRead: jest.fn(),
    },
    realtime: { publish: jest.fn() },
  };
}

async function createService(): Promise<{
  service: NotificationService;
  deps: MockDeps;
}> {
  const deps = createDeps();

  const module = await Test.createTestingModule({
    providers: [
      NotificationService,
      { provide: NotificationRepository, useValue: deps.notifications },
      { provide: REALTIME_PUSH, useValue: deps.realtime },
    ],
  }).compile();

  return { service: module.get(NotificationService), deps };
}
