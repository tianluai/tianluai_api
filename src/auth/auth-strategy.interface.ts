import { Request } from 'express';
import type { AuthPayload } from './auth.types';

/**
 * Strategy for validating the request and producing an auth payload.
 * The guard uses this to stay provider-agnostic (e.g. Clerk today, another provider later).
 */
export const AUTH_STRATEGY = Symbol('AUTH_STRATEGY');

export interface IAuthStrategy {
  validate(request: Request): Promise<AuthPayload>;
}
