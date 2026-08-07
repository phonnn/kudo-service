import type { AuthProvider } from './interfaces/auth-provider.interface';
import type { SecurityConfig } from './security.config';
import { LocalAuthProvider } from './providers/local-auth.provider';

export function createAuthProvider(config: SecurityConfig): AuthProvider {
  switch (config.provider) {
    case 'local':
      return new LocalAuthProvider(config);
  }
}
