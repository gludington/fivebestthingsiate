import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ params, locals }) => {
  const bucket = locals.runtime.env.IMAGES;
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
