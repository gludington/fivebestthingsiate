import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { isValidImageUrl, isValidItemUrl, ownPhotoKey, sweepOrphanedPhotos } from '../../../lib/photos';

export const DELETE: APIRoute = async ({ params, locals }) => {
  const user = locals.user;
  
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const db = env.DB;
  const bucket = env.PHOTOS;
  const { id } = params;
  
  try {
    // Verify item belongs to user and get image_url
    const item = await db.prepare(
      'SELECT * FROM items WHERE id = ? AND user_id = ?'
    ).bind(id, user.id).first<{ image_url: string | null }>();

    if (!item) {
      return new Response(JSON.stringify({ error: 'Item not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Delete image from R2 if it exists
    const key = ownPhotoKey(item.image_url, user.id);
    if (key) {
      try {
        await bucket.delete(key);
      } catch (error) {
        console.error('Error deleting image from R2:', error);
      }
    }

    await db.prepare('DELETE FROM items WHERE id = ? AND user_id = ?').bind(id, user.id).run();
    locals.cfContext.waitUntil(sweepOrphanedPhotos(db, bucket, user.id));
    
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

  const db = env.DB;
  const { id } = params;
  
  try {
    // Verify item belongs to user
    const item = await db.prepare(
      'SELECT * FROM items WHERE id = ? AND user_id = ?'
    ).bind(id, user.id).first<{ image_url: string | null }>();

    if (!item) {
      return new Response(JSON.stringify({ error: 'Item not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const updates = await request.json() as {
      name?: string;
      date?: string;
      description?: string | null;
      url?: string | null;
      image_url?: string | null;
      order_index?: number;
    };
    
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
    
    if (updates.url !== undefined && !isValidItemUrl(updates.url)) {
      return new Response(JSON.stringify({ error: 'Link must be an http(s) URL' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (updates.image_url !== undefined && !isValidImageUrl(updates.image_url, user.id)) {
      return new Response(JSON.stringify({ error: 'Invalid image' }), {
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
    
    values.push(id, user.id);
    const query = `UPDATE items SET ${fields.join(', ')} WHERE id = ? AND user_id = ? RETURNING *`;
    
    const result = await db.prepare(query).bind(...values).first();

    // A replaced photo is no longer referenced; remove it now rather than waiting for the sweep.
    const oldKey = ownPhotoKey(item.image_url, user.id);
    if (updates.image_url !== undefined && oldKey && oldKey !== ownPhotoKey(updates.image_url, user.id)) {
      locals.cfContext.waitUntil(env.PHOTOS.delete(oldKey));
    }
    locals.cfContext.waitUntil(sweepOrphanedPhotos(db, env.PHOTOS, user.id));
    
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
