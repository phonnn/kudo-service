import { Test } from '@nestjs/testing';
import type { DomainEvent } from '@kudo/messaging';
import { EVENT_BUS } from '../../../infra/token.constant';
import type { CommentCreatedPayload } from '../../feed/events/domain-events';
import { UserRepository } from '../../user/repositories/user.repository';
import { NotificationType } from '../dto/notification-type.enum';
import { NotificationService } from '../services/notification.service';
import { CommentCreatedListener } from './comment-created.listener';

function eventFor(
  payload: CommentCreatedPayload,
): DomainEvent<CommentCreatedPayload> {
  return { id: 'event-1', payload } as DomainEvent<CommentCreatedPayload>;
}

describe('CommentCreatedListener', () => {
  it('notifies the post author when someone else comments, including the commenter name', async () => {
    const { listener, notifications, deps } = await createListener();
    deps.users.findById.mockResolvedValue({
      id: 'commenter-1',
      email: 'a@example.com',
      name: 'Ada',
      passwordHash: 'hash',
    });
    const event = eventFor({
      postId: 'post-1',
      postAuthorId: 'author-1',
      commentId: 'comment-1',
      authorId: 'commenter-1',
    });

    await listener['handle'](event);

    expect(notifications.notify).toHaveBeenCalledWith({
      userId: 'author-1',
      type: NotificationType.COMMENT,
      refId: 'event-1',
      payload: {
        postId: 'post-1',
        commentId: 'comment-1',
        authorId: 'commenter-1',
        senderName: 'Ada',
      },
    });
  });

  it('falls back to a null sender name when the commenter no longer exists', async () => {
    const { listener, notifications, deps } = await createListener();
    deps.users.findById.mockResolvedValue(null);
    const event = eventFor({
      postId: 'post-1',
      postAuthorId: 'author-1',
      commentId: 'comment-1',
      authorId: 'commenter-1',
    });

    await listener['handle'](event);

    expect(notifications.notify).toHaveBeenCalledWith({
      userId: 'author-1',
      type: NotificationType.COMMENT,
      refId: 'event-1',
      payload: {
        postId: 'post-1',
        commentId: 'comment-1',
        authorId: 'commenter-1',
        senderName: null,
      },
    });
  });

  it('does not notify when the author comments on their own post', async () => {
    const { listener, notifications, deps } = await createListener();
    const event = eventFor({
      postId: 'post-1',
      postAuthorId: 'author-1',
      commentId: 'comment-1',
      authorId: 'author-1',
    });

    await listener['handle'](event);

    expect(notifications.notify).not.toHaveBeenCalled();
    expect(deps.users.findById).not.toHaveBeenCalled();
  });
});

async function createListener(): Promise<{
  listener: CommentCreatedListener;
  notifications: jest.Mocked<Pick<NotificationService, 'notify'>>;
  deps: { users: jest.Mocked<Pick<UserRepository, 'findById'>> };
}> {
  const notifications = { notify: jest.fn() };
  const users = { findById: jest.fn().mockResolvedValue(null) };
  const bus = { subscribe: jest.fn(), publish: jest.fn(), close: jest.fn() };

  const module = await Test.createTestingModule({
    providers: [
      CommentCreatedListener,
      { provide: EVENT_BUS, useValue: bus },
      { provide: NotificationService, useValue: notifications },
      { provide: UserRepository, useValue: users },
    ],
  }).compile();

  return {
    listener: module.get(CommentCreatedListener),
    notifications,
    deps: { users },
  };
}
