import * as oidc from 'openid-client';

// Sign-in is delegated to loodingdongs-auth over OIDC (authorization code + PKCE).
// This app keeps its own session in D1; the auth server only proves who the user is.

const SESSION_TTL = 60 * 60 * 24 * 30; // 30 days, in seconds

export const LOGIN_COOKIE = 'oidc_login';
export const SESSION_COOKIE = 'session';

// Cache only the resolved discovery result, never a pending promise: a rejected promise would
// stick for the life of the isolate.
let config: oidc.Configuration | undefined;

export async function getOidcConfig(env: Env): Promise<oidc.Configuration> {
  if (!config) {
    config = await oidc.discovery(
      new URL(env.ISSUER),
      env.OIDC_CLIENT_ID,
      undefined,
      // Clients are registered for HTTP Basic; openid-client would otherwise POST the secret.
      oidc.ClientSecretBasic(env.OIDC_CLIENT_SECRET),
      { execute: env.ISSUER.startsWith('http://') ? [oidc.allowInsecureRequests] : [] },
    );
  }
  return config;
}

export function cookieOptions(maxAge: number) {
  return {
    path: '/',
    secure: import.meta.env.PROD,
    httpOnly: true,
    sameSite: 'lax' as const,
    maxAge,
  };
}

export interface OidcProfile {
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
}

// Creates the user on first sign-in and refreshes their profile on later ones. Users are keyed
// on the issuer's stable `sub`, never on email.
export async function upsertUser(db: D1Database, profile: OidcProfile): Promise<string> {
  if (!profile.email) {
    throw new Error('The auth server did not return an email address');
  }

  await db
    .prepare(
      `INSERT INTO users (id, email, name, picture) VALUES (?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET email = excluded.email, name = excluded.name, picture = excluded.picture`,
    )
    .bind(profile.sub, profile.email, profile.name ?? null, profile.picture ?? null)
    .run();
  return profile.sub;
}

function generateSessionId(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCodePoint(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// The loodingdongs-auth role (granted per app on its /admin page) needed to use this app.
export const REQUIRED_ROLE = 'fivebest-user';

// How often a session's roles are re-read from the auth server, in seconds.
const ROLE_CHECK_INTERVAL = 60 * 60;

export function hasAccess(roles: string[]): boolean {
  return roles.includes(REQUIRED_ROLE);
}

// Roles for this app, from UserInfo (always current) or the ID token.
export function rolesFrom(claims: Record<string, unknown> | undefined): string[] {
  return Array.isArray(claims?.roles) ? claims.roles.filter((r): r is string => typeof r === 'string') : [];
}

export async function createSession(
  db: D1Database,
  userId: string,
  tokens: { id_token?: string; refresh_token?: string },
  roles: string[],
) {
  const sessionId = generateSessionId();
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + SESSION_TTL;

  await db
    .prepare(
      `INSERT INTO sessions (id, user_id, expires_at, id_token, refresh_token, roles, roles_checked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(sessionId, userId, expiresAt, tokens.id_token ?? null, tokens.refresh_token ?? null, JSON.stringify(roles), now)
    .run();

  return { sessionId, maxAge: SESSION_TTL };
}

export async function validateSession(db: D1Database, sessionId: string) {
  const result = await db
    .prepare(
      `SELECT sessions.id AS session_id, sessions.expires_at, sessions.id_token,
              sessions.refresh_token, sessions.roles, sessions.roles_checked_at,
              users.id, users.email, users.name, users.picture
       FROM sessions
       JOIN users ON sessions.user_id = users.id
       WHERE sessions.id = ?`,
    )
    .bind(sessionId)
    .first<{
      session_id: string;
      expires_at: number;
      id_token: string | null;
      refresh_token: string | null;
      roles: string;
      roles_checked_at: number;
      id: string;
      email: string;
      name: string | null;
      picture: string | null;
    }>();

  if (!result) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (result.expires_at < now) {
    await deleteSession(db, sessionId);
    return null;
  }

  return {
    session: {
      id: result.session_id,
      expiresAt: result.expires_at,
      idToken: result.id_token,
      refreshToken: result.refresh_token,
      roles: JSON.parse(result.roles) as string[],
      rolesCheckedAt: result.roles_checked_at,
    },
    user: {
      id: result.id,
      email: result.email,
      name: result.name,
      picture: result.picture,
    },
  };
}

type ValidSession = NonNullable<Awaited<ReturnType<typeof validateSession>>>['session'];

// Re-reads the session's roles from the auth server when they're older than ROLE_CHECK_INTERVAL.
// Returns the current roles, or null when the auth server no longer honors the session (e.g. the
// user signed out everywhere), in which case the session is deleted.
export async function refreshRolesIfStale(env: Env, session: ValidSession): Promise<string[] | null> {
  const now = Math.floor(Date.now() / 1000);
  if (!session.refreshToken || now - session.rolesCheckedAt < ROLE_CHECK_INTERVAL) {
    return session.roles;
  }

  // Refresh tokens rotate, so only one request may use it. Claim the check; if another request
  // already did, keep the current roles.
  const claim = await env.DB
    .prepare('UPDATE sessions SET roles_checked_at = ? WHERE id = ? AND roles_checked_at = ?')
    .bind(now, session.id, session.rolesCheckedAt)
    .run();
  if (claim.meta.changes !== 1) {
    return session.roles;
  }

  try {
    const config = await getOidcConfig(env);
    const tokens = await oidc.refreshTokenGrant(config, session.refreshToken);
    const sub = tokens.claims()?.sub ?? oidc.skipSubjectCheck;
    const roles = rolesFrom(await oidc.fetchUserInfo(config, tokens.access_token, sub));

    await env.DB
      .prepare('UPDATE sessions SET roles = ?, refresh_token = ?, id_token = COALESCE(?, id_token) WHERE id = ?')
      .bind(JSON.stringify(roles), tokens.refresh_token ?? session.refreshToken, tokens.id_token ?? null, session.id)
      .run();
    return roles;
  } catch (error) {
    if (error instanceof oidc.ResponseBodyError && error.error === 'invalid_grant') {
      await deleteSession(env.DB, session.id);
      return null;
    }
    // Auth server unreachable or erroring: keep the last known roles and retry next interval.
    console.error('Role refresh failed:', error);
    return session.roles;
  }
}

export async function deleteSession(db: D1Database, sessionId: string): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
}
