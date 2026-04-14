import { Injectable, UnauthorizedException } from '@nestjs/common';
import { verifyToken } from '@clerk/backend';
import { Request } from 'express';
import type { AuthPayload } from '../auth.types';
import type { IAuthStrategy } from '../auth-strategy.interface';

@Injectable()
export class ClerkAuthStrategy implements IAuthStrategy {
  async validate(request: Request): Promise<AuthPayload> {
    const token =
      request.headers.authorization?.replace(/^Bearer\s+/i, '') ?? null;

    if (!token) {
      throw new UnauthorizedException('Missing or invalid authorization token');
    }

    const secretKey = process.env.CLERK_SECRET_KEY ?? '';

    if (!secretKey) {
      throw new UnauthorizedException(
        'Server auth not configured (set CLERK_SECRET_KEY)',
      );
    }

    try {
      const result: Record<string, unknown> = (await verifyToken(token, {
        secretKey,
      })) as Record<string, unknown>;

      const subject = typeof result.sub === 'string' ? result.sub : undefined;
      const sessionId = typeof result.sid === 'string' ? result.sid : undefined;

      if (!subject) {
        console.error('[ClerkAuthStrategy] No sub in result:', result);
        throw new UnauthorizedException('Invalid or expired token');
      }

      return { sub: subject, sid: sessionId };
    } catch (error: unknown) {
      if (error instanceof UnauthorizedException) throw error;
      const message =
        error instanceof Error ? error.message : 'Invalid or expired token';
      console.error('[ClerkAuthStrategy] Token verification error:', error);
      throw new UnauthorizedException(message);
    }
  }
}
