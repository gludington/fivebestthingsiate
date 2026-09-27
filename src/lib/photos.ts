// Photos live in R2 under `${userId}/...` and are referenced from items.image_url as
// `/api/images/<key>`.

export const IMAGE_PATH_PREFIX = '/api/images/';

// Longest side for stored photos; the browser resizes to the same size before upload.
export const MAX_PHOTO_DIMENSION = 1600;

// Shrinks a photo with Cloudflare Images: fits it within MAX_PHOTO_DIMENSION and re-encodes it as
// WebP, applying EXIF rotation. Runs on Cloudflare's image service, not the Worker's CPU budget.
export async function shrinkPhoto(images: ImagesBinding, file: File): Promise<Blob> {
  const info = await images.info(file.stream());
  if (!('width' in info)) {
    throw new Error(`Unsupported image format: ${info.format}`);
  }

  const transform: ImageTransform = {};
  if (Math.max(info.width, info.height) > MAX_PHOTO_DIMENSION) {
    // Constrain only the longer side; the other scales to keep the aspect ratio.
    if (info.width >= info.height) transform.width = MAX_PHOTO_DIMENSION;
    else transform.height = MAX_PHOTO_DIMENSION;
  }

  const result = await images.input(file.stream()).transform(transform).output({ format: 'image/webp', quality: 82 });
  return result.response().blob();
}

// Uploads younger than this may belong to a form that's still open, so the sweep leaves them.
const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;

export function photoKey(imageUrl: string | null | undefined): string | null {
  return imageUrl?.startsWith(IMAGE_PATH_PREFIX) ? imageUrl.slice(IMAGE_PATH_PREFIX.length) : null;
}

// The R2 key of a photo this user uploaded, or null for anyone else's (or no photo). Items only
// ever point at, and deletes only ever touch, the owner's own photos.
export function ownPhotoKey(imageUrl: string | null | undefined, userId: string): string | null {
  const key = photoKey(imageUrl);
  return key?.startsWith(`${userId}/`) ? key : null;
}

// Client-supplied image_url is valid if empty or one of the user's own uploads.
export function isValidImageUrl(imageUrl: unknown, userId: string): boolean {
  return imageUrl == null || imageUrl === '' || (typeof imageUrl === 'string' && ownPhotoKey(imageUrl, userId) !== null);
}

// Deletes a user's photos that no item references: replaced images and uploads from forms that
// were never saved. Run in the background after a user changes their items.
export async function sweepOrphanedPhotos(db: D1Database, bucket: R2Bucket, userId: string) {
  const { results } = await db
    .prepare('SELECT image_url FROM items WHERE user_id = ? AND image_url IS NOT NULL')
    .bind(userId)
    .all<{ image_url: string }>();
  const referenced = new Set(results.map((r) => photoKey(r.image_url)));

  const cutoff = Date.now() - ORPHAN_GRACE_MS;
  const orphans: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix: `${userId}/`, cursor });
    for (const object of page.objects) {
      if (!referenced.has(object.key) && object.uploaded.getTime() < cutoff) {
        orphans.push(object.key);
      }
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  // R2 deletes up to 1000 keys per call.
  for (let i = 0; i < orphans.length; i += 1000) {
    await bucket.delete(orphans.slice(i, i + 1000));
  }
}
