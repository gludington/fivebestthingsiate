import type { APIRoute } from 'astro';
import { deleteSession } from '../../lib/auth';

export const GET: APIRoute = async ({ locals, cookies, redirect }) => {
  const session = locals.session;
  
  if (session) {
    const db = locals.runtime.env.DB;
    await deleteSession(db, session.id);
  }

  cookies.delete('session', { path: '/' });

  return redirect('/');
};
