import { Test } from '@nestjs/testing';
import type { DomainEvent } from '@kudo/messaging';
import { EVENT_BUS } from '../../../infra/token.constant';
import type { ReactionCreatedPayload } from '../../feed/events/domain-events';
import { ReactionType } from '../../feed/dto/reaction-type.enum';
import { NotificationType } from '../dto/notification-type.enum';
import { NotificationService } from '../services/notification.service';
import { ReactionCreatedListener } from './reaction-created.listener';

function eventFor(
  payload: ReactionCreatedPayload,
): DomainEvent<ReactionCreatedPayload> {
  return { id: 'event-1', payload } as DomainEvent<ReactionCreatedPayload>;
}

describe('ReactionCreatedListener', () => {
  it('notifies the post author when someone else reacts', async () => {
    const { listener, notifications } = await createListener();
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
      },
    });
  });

  it('does not notify when the author reacts to their own post', async () => {
    const { listener, notifications } = await createListener();
    const event = eventFor({
      postId: 'post-1',
      postAuthorId: 'author-1',
      userId: 'author-1',
      type: ReactionType.CLAP,
    });

    await listener['handle'](event);

    expect(notifications.notify).not.toHaveBeenCalled();
  });
});

async function createListener(): Promise<{
  listener: ReactionCreatedListener;
  notifications: jest.Mocked<Pick<NotificationService, 'notify'>>;
}> {
  const notifications = { notify: jest.fn() };
  const bus = { subscribe: jest.fn(), publish: jest.fn(), close: jest.fn() };

  const module = await Test.createTestingModule({
    providers: [
      ReactionCreatedListener,
      { provide: EVENT_BUS, useValue: bus },
      { provide: NotificationService, useValue: notifications },
    ],
  }).compile();

  return { listener: module.get(ReactionCreatedListener), notifications };
}
