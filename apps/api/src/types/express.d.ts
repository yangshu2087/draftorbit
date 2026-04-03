import type { AuthUser } from '@draftorbit/shared';

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

export {};
