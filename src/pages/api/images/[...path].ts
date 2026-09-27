import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const GET: APIRoute = async ({ params }) => {
  const bucket = env.PHOTOS;
  const { path } = params;

  if (!path) {
    return new Response('Not found', { status: 404 });
  }

  try {
    const object = await bucket.get(path);

    if (!object) {
      return new Response('Image not found', { status: 404 });
    }


    const responseHeaders = new Headers();

    if (object.httpMetadata?.contentType) {
      responseHeaders.set('Content-Type', object.httpMetadata.contentType);
    }
    if (object.httpMetadata?.contentLanguage) {
      responseHeaders.set('Content-Language', object.httpMetadata.contentLanguage);
    }

    // 2. Add ETag and other standard R2 properties
    responseHeaders.set('ETag', object.httpEtag);
    // Keys are unique per upload and never overwritten, so browsers can keep them forever.
    responseHeaders.set('Cache-Control', 'public, max-age=31536000, immutable');
    // Never let a stored file be sniffed or run as a document on this origin.
    responseHeaders.set('X-Content-Type-Options', 'nosniff');
    responseHeaders.set('Content-Security-Policy', "default-src 'none'; sandbox");

    // 3. Add custom metadata if you have any
    if (object.customMetadata) {
      for (const [key, value] of Object.entries(object.customMetadata)) {
        responseHeaders.set(`x-amz-meta-${key}`, value as string);
      }
    }

    return new Response(object.body, {
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('Error fetching image:', error);
    return new Response('Error fetching image', { status: 500 });
  }
};
