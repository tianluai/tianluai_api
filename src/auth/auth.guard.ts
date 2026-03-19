import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Inject,
} from '@nestjs/common';
import { Request } from 'express';
import type { AuthPayload } from './auth.types';
import { AUTH_STRATEGY, type IAuthStrategy } from './auth-strategy.interface';

/**
 * Generic auth guard: delegates validation to the configured strategy.
 * Keeps "auth" (protect route, require user) separate from how tokens are validated
 * (e.g. Clerk today; swap strategy later without changing guard or controllers).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(AUTH_STRATEGY) private readonly strategy: IAuthStrategy,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const payload = await this.strategy.validate(request);
    (request as Request & { user: AuthPayload }).user = payload;
    return true;
  }
}
