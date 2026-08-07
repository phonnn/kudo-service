import { hashValue } from '../helpers/hash.helper';
import type { SecurityConfig } from '../security.config';
import { LocalAuthProvider } from './local-auth.provider';

type LocalConfig = Extract<SecurityConfig, { provider: 'local' }>;

const config: LocalConfig = {
  provider: 'local',
  accessTokenSecret: 'access-secret',
  refreshTokenSecret: 'refresh-secret',
};

describe('LocalAuthProvider', () => {
  describe('issueToken', () => {
    it('issues a token pair when no password is given (trusted re-issue)', async () => {
      const provider = new LocalAuthProvider(config);
      const tokens = await provider.issueToken({ subject: 'user-1' });

      expect(tokens.accessToken).toEqual(expect.any(String));
      expect(tokens.refreshToken).toEqual(expect.any(String));
      expect(tokens.accessToken).not.toBe(tokens.refreshToken);
    });

    it('issues a token pair when the password matches the stored hash', async () => {
      const provider = new LocalAuthProvider(config);
      const passwordHash = await hashValue('correct horse');

      const tokens = await provider.issueToken({
        subject: 'user-1',
        password: 'correct horse',
        passwordHash,
      });

      expect(tokens.accessToken).toEqual(expect.any(String));
    });

    it('rejects when the password does not match the stored hash', async () => {
      const provider = new LocalAuthProvider(config);
      const passwordHash = await hashValue('correct horse');

      await expect(
        provider.issueToken({
          subject: 'user-1',
          password: 'wrong password',
          passwordHash,
        }),
      ).rejects.toThrow('Invalid credentials');
    });

    it('rejects when a password is given but there is no stored hash to check it against', async () => {
      const provider = new LocalAuthProvider(config);

      await expect(
        provider.issueToken({ subject: 'user-1', password: 'anything' }),
      ).rejects.toThrow('Invalid credentials');
    });
  });

  describe('verifyToken / refreshToken', () => {
    it('round-trips: a token issued by issueToken verifies back to the same subject and claims', async () => {
      const provider = new LocalAuthProvider(config);
      const tokens = await provider.issueToken({
        subject: 'user-1',
        claims: { email: 'a@example.com' },
      });

      const principal = await provider.verifyToken(tokens.accessToken);
      expect(principal).toEqual({
        subject: 'user-1',
        claims: { email: 'a@example.com' },
      });
    });

    it('rejects an access token verified against the refresh secret', async () => {
      const provider = new LocalAuthProvider(config);
      const tokens = await provider.issueToken({ subject: 'user-1' });

      await expect(
        provider.refreshToken(tokens.accessToken),
      ).rejects.toBeDefined();
    });

    it('rejects a garbage token', async () => {
      const provider = new LocalAuthProvider(config);
      await expect(provider.verifyToken('not-a-jwt')).rejects.toBeDefined();
    });

    it('issues a fresh token pair from a valid refresh token, carrying the same subject and claims', async () => {
      const provider = new LocalAuthProvider(config);
      const issued = await provider.issueToken({
        subject: 'user-1',
        claims: { email: 'a@example.com' },
      });

      const refreshed = await provider.refreshToken(issued.refreshToken);
      const principal = await provider.verifyToken(refreshed.accessToken);

      expect(principal).toEqual({
        subject: 'user-1',
        claims: { email: 'a@example.com' },
      });
    });
  });
});
