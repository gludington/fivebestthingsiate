// Worker entry point: Astro's request handler, plus RPC entrypoints that other Workers on this
// Cloudflare account can call through a Service Binding. RPC methods have no URL, so nothing here
// is reachable from the internet; only Workers that declare a binding to it can call them.
import { WorkerEntrypoint } from 'cloudflare:workers';
import astro from '@astrojs/cloudflare/entrypoints/server';
import { deleteUserData } from './lib/account';

export default astro;

// Bound by loodingdongs-auth (binding FIVEBEST, entrypoint AccountDeletion): when an admin deletes
// an account there, it calls deleteUser with that account's `sub`.
export class AccountDeletion extends WorkerEntrypoint<Env> {
  async deleteUser(sub: string): Promise<{ deleted: true }> {
    if (typeof sub !== 'string' || !sub) throw new Error('deleteUser needs the account sub');
    await deleteUserData(this.env, sub);
    console.log('Deleted data for user', sub);
    return { deleted: true };
  }
}
