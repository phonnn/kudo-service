import { hashValue, verifyValue } from './hash.helper';

describe('hash.helper', () => {
  describe('hashValue', () => {
    it('produces a salt:hash pair, salted differently each time', async () => {
      const a = await hashValue('correct horse');
      const b = await hashValue('correct horse');

      expect(a).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
      expect(a).not.toBe(b);
    });
  });

  describe('verifyValue', () => {
    it('accepts the value that produced the stored hash', async () => {
      const stored = await hashValue('correct horse');
      await expect(verifyValue('correct horse', stored)).resolves.toBe(true);
    });

    it('rejects a different value', async () => {
      const stored = await hashValue('correct horse');
      await expect(verifyValue('wrong value', stored)).resolves.toBe(false);
    });

    it('rejects a malformed stored hash missing the salt/hash separator', async () => {
      await expect(verifyValue('anything', 'not-a-valid-hash')).resolves.toBe(
        false,
      );
    });

    it('rejects an empty stored hash', async () => {
      await expect(verifyValue('anything', '')).resolves.toBe(false);
    });
  });
});
