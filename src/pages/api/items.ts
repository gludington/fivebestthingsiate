import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ locals }) => {
  const user = locals.user;
  
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const db = locals.runtime.env.DB;
  
  try {
    const { results } = await db.prepare(
      'SELECT * FROM items WHERE user_id = ? ORDER BY order_index ASC, created_at DESC'
    ).bind(user.id).all();
    console.log(results);
    return new Response(JSON.stringify(results), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error fetching items:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch items' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

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
    const { name, date, description, url, image_url } = await request.json();
    
    if (!name || !date) {
      return new Response(JSON.stringify({ error: 'Name and date are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validate max lengths
    if (name.length > 200) {
      return new Response(JSON.stringify({ error: 'Name must be 200 characters or less' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (description && description.length > 1000) {
      return new Response(JSON.stringify({ error: 'Description must be 1000 characters or less' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (url && url.length > 500) {
      return new Response(JSON.stringify({ error: 'URL must be 500 characters or less' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get the max order_index for this user
    const maxOrder = await db.prepare(
      'SELECT MAX(order_index) as max_order FROM items WHERE user_id = ?'
    ).bind(user.id).first();

    const nextOrder = (maxOrder?.max_order ?? -1) + 1;
    
    const result = await db.prepare(`
      INSERT INTO items (user_id, name, date, description, url, image_url, order_index)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `).bind(user.id, name, date, description || null, url || null, image_url || null, nextOrder).first();
    
    return new Response(JSON.stringify(result), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error creating item:', error);
    return new Response(JSON.stringify({ error: 'Failed to create item' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
