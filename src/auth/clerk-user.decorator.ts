import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthPayload } from './auth.types';

export const ClerkUserId = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthPayload }>();
    return request.user.sub;
  },
);
