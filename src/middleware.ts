import { defineMiddleware } from 'astro:middleware';
import { validateSession } from './lib/auth';

export const onRequest = defineMiddleware(async (context, next) => {
  const db = context.locals.runtime.env.DB;
  const sessionCookie = context.cookies.get('session');

  context.locals.user = null;
  context.locals.session = null;

  if (sessionCookie) {
    const result = await validateSession(db, sessionCookie.value);
    if (result) {
      context.locals.user = result.user;
      context.locals.session = result.session;
    } else {
      context.cookies.delete('session', { path: '/' });
    }
  }

  return next();
});
