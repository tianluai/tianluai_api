/**
 * Payload attached to `request.user` after successful auth.
 * `sub` is the standard JWT subject (stable user id from the identity provider).
 */
export interface AuthPayload {
  sub: string;
  sid?: string;
}

/** @deprecated Use AuthPayload. */
export type ClerkPayload = AuthPayload;
