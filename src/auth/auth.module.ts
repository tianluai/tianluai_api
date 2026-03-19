import { Global, Module } from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import { AUTH_STRATEGY } from './auth-strategy.interface';
import { ClerkAuthStrategy } from './strategies/clerk-auth.strategy';

@Global()
@Module({
  providers: [
    ClerkAuthStrategy,
    { provide: AUTH_STRATEGY, useClass: ClerkAuthStrategy },
    AuthGuard,
  ],
  exports: [AuthGuard],
})
export class AuthModule {}
