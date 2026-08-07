import { Test } from '@nestjs/testing';
import type { DomainEvent } from '@kudo/messaging';
import { EVENT_BUS } from '../../../infra/token.constant';
import type { ReactionCreatedPayload } from '../../feed/events/domain-events';
import { ReactionType } from '../../feed/dto/reaction-type.enum';
import { UserRepository } from '../../user/repositories/user.repository';
import { NotificationType } from '../dto/notification-type.enum';
import { NotificationService } from '../services/notification.service';
import { ReactionCreatedListener } from './reaction-created.listener';

function eventFor(
  payload: ReactionCreatedPayload,
): DomainEvent<ReactionCreatedPayload> {
  return { id: 'event-1', payload } as DomainEvent<ReactionCreatedPayload>;
}

describe('ReactionCreatedListener', () => {
  it('notifies the post author when someone else reacts, including the reactor name', async () => {
    const { listener, notifications, deps } = await createListener();
    deps.users.findById.mockResolvedValue({
      id: 'reactor-1',
      email: 'a@example.com',
      name: 'Ada',
      passwordHash: 'hash',
    });
    const event = eventFor({
      postId: 'post-1',
      postAuthorId: 'author-1',
      userId: 'reactor-1',
      type: ReactionType.CLAP,
    });

    await listener['handle'](event);

    expect(notifications.notify).toHaveBeenCalledWith({
      userId: 'author-1',
      type: NotificationType.REACTION,
      refId: 'event-1',
      payload: {
        postId: 'post-1',
        userId: 'reactor-1',
        type: ReactionType.CLAP,
        senderName: 'Ada',
      },
    });
  });

  it('falls back to a null sender name when the reactor no longer exists', async () => {
    const { listener, notifications, deps } = await createListener();
    deps.users.findById.mockResolvedValue(null);
    const event = eventFor({
      postId: 'post-1',
      postAuthorId: 'author-1',
      userId: 'reactor-1',
      type: ReactionType.CLAP,
    });

    await listener['handle'](event);

    expect(notifications.notify).toHaveBeenCalledWith({
      userId: 'author-1',
      type: NotificationType.REACTION,
      refId: 'event-1',
      payload: {
        postId: 'post-1',
        userId: 'reactor-1',
        type: ReactionType.CLAP,
        senderName: null,
      },
    });
  });

  it('does not notify when the author reacts to their own post', async () => {
    const { listener, notifications, deps } = await createListener();
    const event = eventFor({
      postId: 'post-1',
      postAuthorId: 'author-1',
      userId: 'author-1',
      type: ReactionType.CLAP,
    });

    await listener['handle'](event);

    expect(notifications.notify).not.toHaveBeenCalled();
    expect(deps.users.findById).not.toHaveBeenCalled();
  });
});

async function createListener(): Promise<{
  listener: ReactionCreatedListener;
  notifications: jest.Mocked<Pick<NotificationService, 'notify'>>;
  deps: { users: jest.Mocked<Pick<UserRepository, 'findById'>> };
}> {
  const notifications = { notify: jest.fn() };
  const users = { findById: jest.fn().mockResolvedValue(null) };
  const bus = { subscribe: jest.fn(), publish: jest.fn(), close: jest.fn() };

  const module = await Test.createTestingModule({
    providers: [
      ReactionCreatedListener,
      { provide: EVENT_BUS, useValue: bus },
      { provide: NotificationService, useValue: notifications },
      { provide: UserRepository, useValue: users },
    ],
  }).compile();

  return {
    listener: module.get(ReactionCreatedListener),
    notifications,
    deps: { users },
  };
}
