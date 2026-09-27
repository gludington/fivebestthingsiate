import { createRemoteJWKSet, jwtVerify } from 'jose';
import { getOidcConfig } from './auth';

// loodingdongs-auth tells this app to delete a user by POSTing a Security Event Token
// (RFC 8417/8935) to /api/account-deletion when their account is deleted there. It's signed
// with the auth server's regular keys, the same JWKS that signs our ID tokens.

export const ACCOUNT_PURGED = 'https://schemas.openid.net/secevent/risc/event-type/account-purged';

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

// Returns the user id (the issuer's `sub`) the notice is about, or throws if it isn't a valid,
// fresh account-purged notice addressed to this app.
export async function verifyDeletionNotice(env: Env, token: string): Promise<string> {
  if (!jwks) {
    const config = await getOidcConfig(env);
    jwks = createRemoteJWKSet(new URL(config.serverMetadata().jwks_uri!));
  }
  const issuer = env.ISSUER.replace(/\/$/, '');
  const { payload } = await jwtVerify(token, jwks, {
    issuer,
    audience: env.OIDC_CLIENT_ID,
    // Only security event tokens: an ID token (typ JWT) can't be replayed here.
    typ: 'secevent+jwt',
    requiredClaims: ['iat', 'jti', 'events'],
    maxTokenAge: '15m',
  });

  const event = (payload.events as Record<string, { subject?: { format?: string; iss?: string; sub?: string } }> | undefined)?.[ACCOUNT_PURGED];
  const subject = event?.subject;
  if (subject?.format !== 'iss_sub' || subject.iss !== issuer || !subject.sub) {
    throw new Error('Not an account-purged event for a user of this issuer');
  }
  return subject.sub;
}

// Removes everything this app holds about a user: their photos in R2, the groups they own, and
// their user row, which takes their items, sessions and group memberships with it
// (ON DELETE CASCADE). Safe to call for someone who never used the app.
export async function deleteUserData(env: Env, userId: string) {
  let cursor: string | undefined;
  do {
    const page = await env.PHOTOS.list({ prefix: `${userId}/`, cursor });
    if (page.objects.length) await env.PHOTOS.delete(page.objects.map((o) => o.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  await env.DB.batch([
    env.DB.prepare('DELETE FROM groups WHERE owner_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId),
  ]);
}
