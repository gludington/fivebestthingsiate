import type { APIRoute } from 'astro';
import { createGoogleOAuth, generateState, generateCodeVerifier } from '../../../lib/auth';

export const GET: APIRoute = async ({ locals, cookies, redirect }) => {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = locals.runtime.env;

  const google = createGoogleOAuth(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
  const state = generateState();
  const codeVerifier = generateCodeVerifier();

  const url = await google.createAuthorizationURL(state, codeVerifier, {
    scopes: ['profile', 'email']
  });

  cookies.set('google_oauth_state', state, {
    path: '/',
    secure: true,
    httpOnly: true,
    maxAge: 60 * 10, // 10 minutes
    sameSite: 'lax'
  });

  cookies.set('google_code_verifier', codeVerifier, {
    path: '/',
    secure: true,
    httpOnly: true,
    maxAge: 60 * 10, // 10 minutes
    sameSite: 'lax'
  });

  return redirect(url.toString());
};
