import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { verifyToken } from '@clerk/backend';
import { Request } from 'express';
import type { AuthPayload } from '../auth.types';
import type { IAuthStrategy } from '../auth-strategy.interface';

@Injectable()
export class ClerkAuthStrategy implements IAuthStrategy {
  constructor(private readonly config: ConfigService) {}

  async validate(request: Request): Promise<AuthPayload> {
    const token =
      request.headers.authorization?.replace(/^Bearer\s+/i, '') ?? null;

    if (!token) {
      throw new UnauthorizedException('Missing or invalid authorization token');
    }

    const jwtKeyRaw = this.config.get<string>('CLERK_JWT_KEY');
    const jwtKey = jwtKeyRaw?.replace(/\\n/g, '\n') ?? null;
    if (!jwtKey) {
      throw new UnauthorizedException(
        'Server auth not configured (set CLERK_JWT_KEY)',
      );
    }

    const authorizedPartiesEnv = this.config.get<string>(
      'CLERK_AUTHORIZED_PARTIES',
    );
    const authorizedParties = authorizedPartiesEnv
      ? authorizedPartiesEnv
          .split(',')
          .map((party) => party.trim())
          .filter(Boolean)
      : [];

    try {
      const result = await verifyToken(token, {
        jwtKey,
        ...(authorizedParties.length > 0 && { authorizedParties }),
      });

      type PayloadShape = { sub?: string; sid?: string };
      const raw = result as { data?: PayloadShape } | PayloadShape;
      const payload: PayloadShape =
        typeof raw === 'object' &&
        raw !== null &&
        'data' in raw &&
        raw.data != null
          ? raw.data
          : (raw as PayloadShape);
      const { sub, sid } = payload;

      if (!sub) {
        console.error('[ClerkAuthStrategy] No sub in result:', result);
        throw new UnauthorizedException('Invalid or expired token');
      }

      return { sub, sid };
    } catch (err: unknown) {
      if (err instanceof UnauthorizedException) throw err;
      const message =
        err instanceof Error ? err.message : 'Invalid or expired token';
      console.error('[ClerkAuthStrategy] Token verification error:', err);
      throw new UnauthorizedException(message);
    }
  }
}
