import path from 'path'

/**
 * Server-only file-storage helpers. EVERY file the app writes (photo uploads,
 * gift-card PDFs + templates, guide/checklist media, backup archives) lives
 * under the single UPLOAD_PATH root so files survive container re-deploys:
 * the compose stack mounts a volume there and `db push`-style re-deploys never
 * touch it. Dev uses `UPLOAD_PATH=./public/uploads` (resolved from the app
 * cwd), which is also where /api/upload serves static files from in dev.
 *
 * Do NOT write to `public/uploads` directly from server code — it is inside
 * the image (and next standalone build) and is wiped on every redeploy.
 */

export function storageRoot(): string {
  const raw = process.env.UPLOAD_PATH
  // Absolute by default (Docker mounts /app/uploads). Relative values resolve
  // against the server cwd (dev: apps/web).
  return raw ? path.resolve(raw) : '/app/uploads'
}

/** An absolute path inside the storage root, e.g. storageDir('gift-cards'). */
export function storageDir(...parts: string[]): string {
  return path.join(storageRoot(), ...parts)
}

/** The storage-root-relative path for a stored absolute path ('' when outside). */
export function storageRel(root: string, absPath: string): string {
  const rel = path.relative(root, absPath)
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel : ''
}

/**
 * Resolve a user-supplied path safely beneath a root. Returns null when the
 * path would escape the root (traversal). Use for every path that comes from
 * the client (file browser, downloads).
 */
export function resolveWithinRoot(root: string, rel: string): string | null {
  const base = path.resolve(root)
  const target = path.resolve(base, rel)
  if (target !== base && !target.startsWith(base + path.sep)) return null
  return target
}

export const STORAGE_ROOTS = ['media', 'backups'] as const
export type StorageRoot = (typeof STORAGE_ROOTS)[number]

export function storageRootPath(root: StorageRoot): string {
  return root === 'backups' ? storageDir('backups') : storageRoot()
}
