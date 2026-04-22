import { Global, Module } from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import { AUTH_STRATEGY } from './auth-strategy.interface';
// Clerk (paused): import { ClerkAuthStrategy } from './strategies/clerk-auth.strategy';
import { JwtAuthStrategy } from './strategies/jwt-auth.strategy';

@Global()
@Module({
  providers: [
    // Clerk (paused): ClerkAuthStrategy,
    JwtAuthStrategy,
    { provide: AUTH_STRATEGY, useClass: JwtAuthStrategy },
    AuthGuard,
  ],
  exports: [AuthGuard, AUTH_STRATEGY],
})
export class AuthModule {}
