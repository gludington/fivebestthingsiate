import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const db = locals.runtime.env.DB;
  
  try {
    const { itemIds } = await request.json() as { itemIds: number[] };
    
    if (!Array.isArray(itemIds)) {
      return new Response(JSON.stringify({ error: 'itemIds must be an array' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Update order_index for each item
    for (let i = 0; i < itemIds.length; i++) {
      await db.prepare(
        'UPDATE items SET order_index = ? WHERE id = ? AND user_id = ?'
      ).bind(i, itemIds[i], user.id).run();
    }
    
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error reordering items:', error);
    return new Response(JSON.stringify({ error: 'Failed to reorder items' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
