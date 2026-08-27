import { randomBytes } from 'node:crypto';
import { mkdirSync, existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve, join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Uploaded images live on disk rather than in Postgres. In production this must
// point at a mounted Railway volume — the container filesystem is replaced on
// every deploy, so anything written outside the volume disappears the next time
// the app ships. Locally it defaults to a gitignored folder in the repo.
// Anchored to the server directory rather than process.cwd(), which differs
// between `npm run dev --prefix server` and `npm start` from the repo root —
// otherwise dev uploads land in two different folders depending on how the
// process was started.
const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_DIR =
  process.env.NODE_ENV === 'production' ? '/data/uploads' : join(serverRoot, 'uploads');

export const uploadDir = resolve(process.env.UPLOAD_DIR || DEFAULT_DIR);

// The public path these are served from (see server/index.js).
export const UPLOAD_ROUTE = '/uploads';

const TYPES = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

export const ACCEPTED_TYPES = Object.keys(TYPES);
export const MAX_BYTES = 5 * 1024 * 1024;

let ready = false;

function ensureDir() {
  if (ready) return;
  mkdirSync(uploadDir, { recursive: true });
  ready = true;
}

/** True when the configured directory is writable — surfaced in the admin UI
 *  so a missing volume is diagnosed before someone uploads into a void. */
export function storageAvailable() {
  try {
    ensureDir();
    return existsSync(uploadDir);
  } catch {
    return false;
  }
}

/**
 * Writes an image buffer and returns the public URL for it.
 * The filename is random rather than derived from anything the user supplies,
 * so an upload can never traverse a path or overwrite another promo's image.
 */
export function saveImage(buffer, contentType) {
  const ext = TYPES[contentType];
  if (!ext) throw new Error('Unsupported image type.');
  ensureDir();
  const name = `${randomBytes(16).toString('hex')}${ext}`;
  writeFileSync(join(uploadDir, name), buffer);
  return `${UPLOAD_ROUTE}/${name}`;
}

/**
 * Deletes a previously saved image. Only ever touches a bare filename inside
 * the upload directory, so a tampered image_url cannot reach the filesystem.
 * Never throws — losing a file is not a reason to fail deleting the record.
 */
export function deleteImage(imageUrl) {
  try {
    if (typeof imageUrl !== 'string' || !imageUrl.startsWith(`${UPLOAD_ROUTE}/`)) return;
    // basename() strips any directory component, so a tampered image_url like
    // "/uploads/../../etc/passwd" collapses to a harmless filename before it
    // is joined. The startsWith check is the belt to that braces.
    const target = join(uploadDir, basename(imageUrl));
    if (!target.startsWith(uploadDir)) return;
    if (existsSync(target)) unlinkSync(target);
  } catch {
    // An orphaned file is harmless; a failed delete must not block the request.
  }
}
