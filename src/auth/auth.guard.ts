import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { verifyToken } from '@clerk/backend';
import { Request } from 'express';

export interface ClerkPayload {
  sub: string;
  sid?: string;
}

@Injectable()
export class ClerkAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  private getJwtKey(): string | null {
    const fromEnv = this.config.get<string>('CLERK_JWT_KEY');
    if (fromEnv) return fromEnv.replace(/\\n/g, '\n');

    const path = this.config.get<string>('CLERK_JWT_KEY_PATH');
    if (!path) return null;

    try {
      const fullPath = resolve(process.cwd(), path);
      return readFileSync(fullPath, 'utf-8').trim();
    } catch (error) {
      console.error(
        '[ClerkAuthGuard] Failed to read CLERK_JWT_KEY_PATH:',
        path,
        error,
      );
      return null;
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token =
      request.headers.authorization?.replace(/^Bearer\s+/i, '') ?? null;

    if (!token) {
      throw new UnauthorizedException('Missing or invalid authorization token');
    }

    const secretKey = this.config.get<string>('CLERK_SECRET_KEY');
    const jwtKey = this.getJwtKey();
    if (!secretKey && !jwtKey) {
      throw new UnauthorizedException(
        'Server auth not configured (set CLERK_SECRET_KEY or CLERK_JWT_KEY)',
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
        ...(jwtKey ? { jwtKey } : { secretKey: secretKey! }),
        ...(authorizedParties.length > 0 && { authorizedParties }),
      });

      // verifyToken may return { data, errors } (legacy) or the payload directly (v2+)
      const payload =
        (result as { data?: Record<string, unknown> }).data ?? result;
      const sub = (payload as { sub?: string }).sub;
      const sid = (payload as { sid?: string }).sid;

      if (!sub) {
        console.error('[ClerkAuthGuard] No sub in result:', result);
        throw new UnauthorizedException('Invalid or expired token');
      }

      (request as Request & { user: ClerkPayload }).user = { sub, sid };
      return true;
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      const message =
        err instanceof Error ? err.message : 'Invalid or expired token';
      console.error('[ClerkAuthGuard] Token verification error:', err);
      throw new UnauthorizedException(message);
    }
  }
}
