import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const SALT_BYTES = 16;
const KEY_LENGTH = 64;

// scrypt via node:crypto rather than bcrypt/argon2 — no extra dependency.
// Stored as `salt:hash`, both hex, so verifyValue never needs a second
// lookup. Generic over any secret worth hashing at rest (passwords today;
// equally usable for opaque tokens, API keys, ...).
export async function hashValue(value: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = (await scrypt(value, salt, KEY_LENGTH)) as Buffer;
  return `${salt.toString('hex')}:${derived.toString('hex')}`;
}

export async function verifyValue(
  value: string,
  storedHash: string,
): Promise<boolean> {
  const [saltHex, hashHex] = storedHash.split(':');
  if (!saltHex || !hashHex) return false;

  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const derived = (await scrypt(value, salt, expected.length)) as Buffer;

  return timingSafeEqual(derived, expected);
}
