/**
 * Payload attached to request.user after successful auth.
 * Strategy-specific (e.g. Clerk uses sub/sid); keep minimal for guard.
 */
export interface AuthPayload {
  sub: string;
  sid?: string;
}

/** @deprecated Use AuthPayload. Kept for compatibility with ClerkUserId decorator. */
export type ClerkPayload = AuthPayload;
