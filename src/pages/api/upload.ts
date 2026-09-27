import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { shrinkPhoto } from '../../lib/photos';

// The Images binding accepts up to 20 MB.
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
// The browser normally resizes photos well under this. Anything bigger, or HEIC (which most
// browsers can't display), is shrunk on the server.
const MAX_STORED_BYTES = 1024 * 1024;
const NEEDS_CONVERSION = new Set(['image/heic', 'image/heif']);

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const bucket = env.PHOTOS;
  
  try {
    const formData = await request.formData();
    const file = formData.get('image') as File;
    
    if (!file) {
      return new Response(JSON.stringify({ error: 'No file provided' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validate file type. Raster formats only: an SVG served from this origin could run script.
    if (!EXTENSIONS[file.type]) {
      return new Response(JSON.stringify({ error: 'File must be a JPEG, PNG, WebP, GIF, AVIF or HEIC image' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return new Response(JSON.stringify({ error: 'File must be less than 20MB' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let photo: Blob = file;
    let extension = EXTENSIONS[file.type];
    if (file.size > MAX_STORED_BYTES || NEEDS_CONVERSION.has(file.type)) {
      try {
        photo = await shrinkPhoto(env.IMAGES, file);
        extension = 'webp';
      } catch (error) {
        console.error('Error resizing image:', error);
        return new Response(JSON.stringify({ error: 'Could not process this image. Try a JPEG or PNG.' }), {
          status: 422,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // Generate unique filename
    // Unguessable, since /api/images serves any key without a session check.
    const filename = `${user.id}/${Date.now()}-${crypto.randomUUID()}.${extension}`;

    // Upload to R2
    await bucket.put(filename, await photo.arrayBuffer(), {
      httpMetadata: {
        contentType: photo.type || file.type,
      },
    });

    // Return the filename (will be used to construct URL)
    return new Response(JSON.stringify({ 
      filename,
      url: `/api/images/${filename}`
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error uploading image:', error);
    return new Response(JSON.stringify({ error: 'Failed to upload image' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
