import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthPayload } from './auth.types';

/**
 * Authenticated user id from the JWT **`sub`** claim (OIDC standard).
 * Today Clerk verifies the token and sets `sub`; another provider would still populate `sub`,
 * so the rest of the app does not depend on Clerk by name.
 *
 * Persisted users still store this value (Mongo field `clerkId` until renamed in a migration).
 */
export const AuthUserId = createParamDecorator(
  (_unused: unknown, executionContext: ExecutionContext): string => {
    const request = executionContext.switchToHttp().getRequest<{
      user: AuthPayload;
    }>();
    return request.user.sub;
  },
);
