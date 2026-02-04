import type { APIRoute } from 'astro';
import { createGoogleOAuth, createSession } from '../../../lib/auth';

export const GET: APIRoute = async ({ url, cookies, locals, redirect }) => {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = locals.runtime.env;
  const db = locals.runtime.env.DB;

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const storedState = cookies.get('google_oauth_state')?.value;
  const codeVerifier = cookies.get('google_code_verifier')?.value;

  if (!code || !state || !storedState || state !== storedState || !codeVerifier) {
    return new Response('Invalid state or missing code verifier', { status: 400 });
  }

  try {
    const google = createGoogleOAuth(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
    const tokens = await google.validateAuthorizationCode(code, codeVerifier);

    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`
      }
    });

    const googleUser = await response.json() as {
      id: string;
      email: string;
      name: string;
      picture: string;
    };

    // Create or update user
    const existingUser = await db.prepare(
      'SELECT * FROM users WHERE email = ?'
    ).bind(googleUser.email).first();

    let userId: string;

    if (existingUser) {
      userId = existingUser.id as string;
      // Update user info
      await db.prepare(`
        UPDATE users SET name = ?, picture = ? WHERE id = ?
      `).bind(googleUser.name, googleUser.picture, userId).run();
    } else {
      userId = `google_${googleUser.id}`;
      await db.prepare(`
        INSERT INTO users (id, email, name, picture)
        VALUES (?, ?, ?, ?)
      `).bind(userId, googleUser.email, googleUser.name, googleUser.picture).run();
    }

    // Create session
    const sessionId = await createSession(db, userId);

    cookies.set('session', sessionId, {
      path: '/',
      secure: true,
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 30, // 30 days
      sameSite: 'lax'
    });

    cookies.delete('google_oauth_state', { path: '/' });
    cookies.delete('google_code_verifier', { path: '/' });

    return redirect('/');
  } catch (error) {
    console.error('OAuth error:', error);
    return new Response('Authentication failed', { status: 500 });
  }
};
