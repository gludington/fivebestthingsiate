import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import * as oidc from 'openid-client';
import { cookieOptions, getOidcConfig, LOGIN_COOKIE, safeReturnTo } from '../../lib/auth';

export const GET: APIRoute = async ({ url: requestUrl, cookies, redirect }) => {
  const config = await getOidcConfig(env);
  const verifier = oidc.randomPKCECodeVerifier();
  const state = oidc.randomState();
  const nonce = oidc.randomNonce();

  // Remembered for the callback; short-lived and httpOnly.
  // returnTo brings people back to e.g. an invite link after signing in.
  const returnTo = safeReturnTo(requestUrl.searchParams.get('returnTo'));
  cookies.set(LOGIN_COOKIE, JSON.stringify({ verifier, state, nonce, returnTo }), cookieOptions(60 * 10));

  const url = oidc.buildAuthorizationUrl(config, {
    redirect_uri: `${env.APP_URL}/auth/callback`,
    // offline_access: a refresh token lets the app re-check roles without a new sign-in.
    scope: 'openid profile email offline_access',
    code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
    code_challenge_method: 'S256',
    state,
    nonce,
  });

  return redirect(url.href);
};
