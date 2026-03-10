import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ClerkPayload } from './auth.guard';

export const ClerkUserId = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<{ user: ClerkPayload }>();
    return request.user.sub;
  },
);
