import { Google } from 'arctic';

export function createGoogleOAuth(clientId: string, clientSecret: string, redirectUri: string) {
  return new Google(clientId, clientSecret, redirectUri);
}

export function generateSessionId(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return bytesToBase64(bytes);
}

export function generateState(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return bytesToBase64(bytes);
}

export function generateCodeVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToBase64(bytes);
}

function bytesToBase64(bytes: Uint8Array): string {
  const binString = Array.from(bytes, (byte) =>
    String.fromCodePoint(byte),
  ).join("");
  return btoa(binString).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export async function validateSession(db: any, sessionId: string): Promise<{ user: any; session: any } | null> {
  const result = await db.prepare(`
    SELECT sessions.id as session_id, sessions.expires_at, users.*
    FROM sessions
    JOIN users ON sessions.user_id = users.id
    WHERE sessions.id = ?
  `).bind(sessionId).first();

  if (!result) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (result.expires_at < now) {
    await db.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
    return null;
  }

  return {
    session: {
      id: result.session_id,
      expiresAt: result.expires_at
    },
    user: {
      id: result.id,
      email: result.email,
      name: result.name,
      picture: result.picture
    }
  };
}

export async function createSession(db: any, userId: string): Promise<string> {
  const sessionId = generateSessionId();
  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30; // 30 days

  await db.prepare(`
    INSERT INTO sessions (id, user_id, expires_at)
    VALUES (?, ?, ?)
  `).bind(sessionId, userId, expiresAt).run();

  return sessionId;
}

export async function deleteSession(db: any, sessionId: string): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
}
