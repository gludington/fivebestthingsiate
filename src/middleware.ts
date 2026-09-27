import { defineMiddleware } from 'astro:middleware';
import { env } from 'cloudflare:workers';
import { hasAccess, refreshRolesIfStale, SESSION_COOKIE, validateSession } from './lib/auth';

// Photos are fetched in parallel by key; account deletion is called server-to-server by the auth
// server with a signed notice (no session).
const PUBLIC_PREFIXES = ['/api/images/', '/api/account-deletion'];

export const onRequest = defineMiddleware(async (context, next) => {
  context.locals.user = null;
  context.locals.session = null;
  context.locals.authorized = false;

  const { pathname } = context.url;
  if (PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return next();
  }

  const sessionCookie = context.cookies.get(SESSION_COOKIE);
  if (sessionCookie) {
    const result = await validateSession(env.DB, sessionCookie.value);
    const roles = result && (await refreshRolesIfStale(env, result.session));
    if (result && roles) {
      context.locals.user = result.user;
      context.locals.session = result.session;
      context.locals.authorized = hasAccess(roles);
    } else {
      context.cookies.delete(SESSION_COOKIE, { path: '/' });
    }
  }

  // Signed in without the required role: the API is off limits (pages redirect themselves).
  if (pathname.startsWith('/api/') && context.locals.user && !context.locals.authorized) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return next();
});
