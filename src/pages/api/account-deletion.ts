import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { deleteUserData, verifyDeletionNotice } from '../../lib/account';

// Push delivery of a Security Event Token (RFC 8935): the body is the signed JWT. Called by
// loodingdongs-auth, never by browsers, so there's no session involved.
export const POST: APIRoute = async ({ request }) => {
  const error = (status: number, err: string, description: string) =>
    new Response(JSON.stringify({ err, description }), { status, headers: { 'Content-Type': 'application/json' } });

  if (!request.headers.get('content-type')?.startsWith('application/secevent+jwt')) {
    return error(400, 'invalid_request', 'Expected Content-Type: application/secevent+jwt');
  }

  let userId: string;
  try {
    userId = await verifyDeletionNotice(env, (await request.text()).trim());
  } catch (e) {
    console.error('Rejected account deletion notice:', e);
    return error(400, 'authentication_failed', 'Invalid or expired deletion notice');
  }

  await deleteUserData(env, userId);
  console.log('Deleted data for user', userId);
  return new Response(null, { status: 202 });
};
