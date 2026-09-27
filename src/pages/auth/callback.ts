import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import * as oidc from 'openid-client';
import {
  cookieOptions,
  createSession,
  getOidcConfig,
  LOGIN_COOKIE,
  rolesFrom,
  SESSION_COOKIE,
  upsertUser,
  type OidcProfile,
} from '../../lib/auth';

export const GET: APIRoute = async ({ url, cookies, redirect }) => {
  const saved = cookies.get(LOGIN_COOKIE)?.value;
  cookies.delete(LOGIN_COOKIE, { path: '/' });

  if (!saved) {
    return new Response('Sign-in expired, please try again.', { status: 400 });
  }

  const { verifier, state, nonce } = JSON.parse(saved);

  try {
    const config = await getOidcConfig(env);
    // Validate against APP_URL rather than the incoming URL, which may carry an internal host.
    const callbackUrl = new URL(`${env.APP_URL}/auth/callback${url.search}`);
    const tokens = await oidc.authorizationCodeGrant(config, callbackUrl, {
      pkceCodeVerifier: verifier,
      expectedState: state,
      expectedNonce: nonce,
    });

    // Profile claims (email, name, picture) come from UserInfo, not the ID token.
    const claims = tokens.claims()!;
    const profile = (await oidc.fetchUserInfo(config, tokens.access_token, claims.sub)) as OidcProfile;

    const userId = await upsertUser(env.DB, profile);
    // Users without the required role still get a session; they see the no-access page.
    const { sessionId, maxAge } = await createSession(env.DB, userId, tokens, rolesFrom(claims));
    cookies.set(SESSION_COOKIE, sessionId, cookieOptions(maxAge));

    return redirect('/');
  } catch (error) {
    console.error('OIDC callback error:', error);
    return new Response('Authentication failed', { status: 500 });
  }
};
