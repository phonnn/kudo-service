import { Test } from '@nestjs/testing';
import { InvalidCursorError } from '../errors/invalid-cursor.error';
import { UserRepository } from '../repositories/user.repository';
import { UserService } from './user.service';

describe('UserService', () => {
  describe('listTeammates', () => {
    it('excludes the current user and trims/passes the search term', async () => {
      const { service, deps } = await createService();
      await service.listTeammates('me', '  ada  ', 10, undefined);

      expect(deps.users.list).toHaveBeenCalledWith({
        search: 'ada',
        excludeUserId: 'me',
        limit: 10,
        cursor: null,
      });
    });

    it('treats a blank search as no filter', async () => {
      const { service, deps } = await createService();
      await service.listTeammates('me', '   ', undefined, undefined);

      expect(deps.users.list).toHaveBeenCalledWith(
        expect.objectContaining({ search: null }),
      );
    });

    it('caps the limit at MAX_LIMIT and omits a cursor short of a full page', async () => {
      const { service, deps } = await createService();
      deps.users.list.mockResolvedValue([
        {
          id: 'user-1',
          name: 'A',
          createdAt: new Date(),
        },
      ]);

      const page = await service.listTeammates('me', undefined, 999, undefined);

      expect(deps.users.list).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 50 }),
      );
      expect(page.nextCursor).toBeNull();
    });

    it('returns a cursor when the page is full', async () => {
      const { service, deps } = await createService();
      deps.users.list.mockResolvedValue([
        {
          id: 'user-1',
          name: 'A',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);

      const page = await service.listTeammates('me', undefined, 1, undefined);
      expect(page.nextCursor).not.toBeNull();
    });

    it('round-trips a cursor produced by a prior page through decode -> repository call', async () => {
      const { service, deps } = await createService();
      const createdAt = new Date('2026-01-01T00:00:00.000Z');
      const cursor = Buffer.from(
        JSON.stringify({ createdAt: createdAt.toISOString(), id: 'user-1' }),
      ).toString('base64url');

      await service.listTeammates('me', undefined, 20, cursor);

      expect(deps.users.list).toHaveBeenCalledWith(
        expect.objectContaining({ cursor: { createdAt, id: 'user-1' } }),
      );
    });

    it('throws InvalidCursorError on a malformed cursor', async () => {
      const { service } = await createService();
      await expect(
        service.listTeammates('me', undefined, 20, 'not-a-valid-cursor'),
      ).rejects.toThrow(InvalidCursorError);
    });
  });
});

interface MockDeps {
  users: jest.Mocked<Pick<UserRepository, 'list'>>;
}

function createDeps(): MockDeps {
  return {
    users: { list: jest.fn().mockResolvedValue([]) },
  };
}

async function createService(): Promise<{
  service: UserService;
  deps: MockDeps;
}> {
  const deps = createDeps();

  const module = await Test.createTestingModule({
    providers: [UserService, { provide: UserRepository, useValue: deps.users }],
  }).compile();

  return { service: module.get(UserService), deps };
}
