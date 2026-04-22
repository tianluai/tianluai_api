import { Injectable, UnauthorizedException } from '@nestjs/common';
import { jwtVerify } from 'jose';
import { Request } from 'express';
import type { AuthPayload } from '../auth.types';
import type { IAuthStrategy } from '../auth-strategy.interface';

/**
 * Validates Bearer tokens minted by the Next.js app (NextAuth + shared `AUTH_JWT_SECRET`).
 */
@Injectable()
export class JwtAuthStrategy implements IAuthStrategy {
  async validate(request: Request): Promise<AuthPayload> {
    const token =
      request.headers.authorization?.replace(/^Bearer\s+/i, '') ?? null;

    if (!token) {
      throw new UnauthorizedException('Missing or invalid authorization token');
    }

    const secretValue = process.env.AUTH_JWT_SECRET ?? '';
    if (!secretValue) {
      throw new UnauthorizedException(
        'Server auth not configured (set AUTH_JWT_SECRET)',
      );
    }

    try {
      const secret = new TextEncoder().encode(secretValue);
      const { payload } = await jwtVerify(token, secret, {
        algorithms: ['HS256'],
      });
      const subject = typeof payload.sub === 'string' ? payload.sub : undefined;
      if (!subject) {
        throw new UnauthorizedException('Invalid or expired token');
      }
      return { sub: subject };
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
