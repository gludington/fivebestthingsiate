import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import * as oidc from 'openid-client';
import { deleteSession, getOidcConfig, SESSION_COOKIE } from '../../lib/auth';

// POST only, so a cross-site link or image can't sign someone out.
export const POST: APIRoute = async ({ locals, cookies, redirect }) => {
  const session = locals.session;
  cookies.delete(SESSION_COOKIE, { path: '/' });

  if (!session) {
    return redirect('/');
  }

  await deleteSession(env.DB, session.id);

  if (!session.idToken) {
    return redirect('/');
  }

  // Also end the loodingdongs-auth session (RP-initiated logout), then come back here.
  const config = await getOidcConfig(env);
  const url = oidc.buildEndSessionUrl(config, {
    id_token_hint: session.idToken,
    post_logout_redirect_uri: `${env.APP_URL}/`,
  });
  return redirect(url.href);
};
