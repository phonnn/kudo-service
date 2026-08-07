import type { Request } from 'express';
import type { Principal } from './auth-provider.interface';

export interface AuthenticatedRequest extends Request {
  principal?: Principal;
}
