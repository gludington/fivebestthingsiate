import type { APIRoute } from 'astro';

export const DELETE: APIRoute = async ({ params, locals }) => {
  const user = locals.user;
  
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const db = locals.runtime.env.DB;
  const bucket = locals.runtime.env.IMAGES;
  const { id } = params;
  
  try {
    // Verify item belongs to user and get image_url
    const item = await db.prepare(
      'SELECT * FROM items WHERE id = ? AND user_id = ?'
    ).bind(id, user.id).first();

    if (!item) {
      return new Response(JSON.stringify({ error: 'Item not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Delete image from R2 if it exists
    if (item.image_url) {
      try {
        const filename = item.image_url.replace('/api/images/', '');
        await bucket.delete(filename);
      } catch (error) {
        console.error('Error deleting image from R2:', error);
      }
    }

    await db.prepare('DELETE FROM items WHERE id = ?').bind(id).run();
    
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error deleting item:', error);
    return new Response(JSON.stringify({ error: 'Failed to delete item' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  const user = locals.user;
  
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const db = locals.runtime.env.DB;
  const { id } = params;
  
  try {
    // Verify item belongs to user
    const item = await db.prepare(
      'SELECT * FROM items WHERE id = ? AND user_id = ?'
    ).bind(id, user.id).first();

    if (!item) {
      return new Response(JSON.stringify({ error: 'Item not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const updates = await request.json();
    
    // Validate max lengths
    if (updates.name !== undefined && updates.name.length > 200) {
      return new Response(JSON.stringify({ error: 'Name must be 200 characters or less' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (updates.description !== undefined && updates.description && updates.description.length > 1000) {
      return new Response(JSON.stringify({ error: 'Description must be 1000 characters or less' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (updates.url !== undefined && updates.url && updates.url.length > 500) {
      return new Response(JSON.stringify({ error: 'URL must be 500 characters or less' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const fields = [];
    const values = [];
    
    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.date !== undefined) {
      fields.push('date = ?');
      values.push(updates.date);
    }
    if (updates.description !== undefined) {
      fields.push('description = ?');
      values.push(updates.description);
    }
    if (updates.url !== undefined) {
      fields.push('url = ?');
      values.push(updates.url);
    }
    if (updates.image_url !== undefined) {
      fields.push('image_url = ?');
      values.push(updates.image_url);
    }
    if (updates.order_index !== undefined) {
      fields.push('order_index = ?');
      values.push(updates.order_index);
    }
    
    if (fields.length === 0) {
      return new Response(JSON.stringify({ error: 'No fields to update' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    values.push(id);
    const query = `UPDATE items SET ${fields.join(', ')} WHERE id = ? RETURNING *`;
    
    const result = await db.prepare(query).bind(...values).first();
    
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error updating item:', error);
    return new Response(JSON.stringify({ error: 'Failed to update item' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
