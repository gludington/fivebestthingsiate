// Account deletion. loodingdongs-auth calls this through a Service Binding (the AccountDeletion
// RPC entrypoint in src/worker.ts) when an admin deletes someone's account there.

// Removes everything this app holds about a user: their photos in R2, the groups they own, and
// their user row, which takes their items, sessions and group memberships with it
// (ON DELETE CASCADE). Safe to call for someone who never used the app.
export async function deleteUserData(env: Env, userId: string) {
  let cursor: string | undefined;
  do {
    const page = await env.PHOTOS.list({ prefix: `${userId}/`, cursor });
    if (page.objects.length) await env.PHOTOS.delete(page.objects.map((o) => o.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  await env.DB.batch([
    env.DB.prepare('DELETE FROM groups WHERE owner_id = ?').bind(userId),
    env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId),
  ]);
}
