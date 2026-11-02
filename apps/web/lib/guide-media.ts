// Pure helpers for guide step media — the ordered photo list and video. Shared
// by the admin/worker write paths, the worker reader and the PDF export so the
// ordering and the legacy single-image fallback can never drift. Prisma-free:
// imported by client components (the reader) as well as the server.

/** A step carries at most this many photos. */
export const MAX_STEP_IMAGES = 20

/** Clean an incoming image list: strings only, trimmed, de-duped, capped. */
export function cleanImageList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of raw) {
    if (typeof v !== 'string') continue
    const url = v.trim()
    if (!url || seen.has(url)) continue
    seen.add(url)
    out.push(url)
    if (out.length >= MAX_STEP_IMAGES) break
  }
  return out
}

/**
 * The ordered photo list for a step. New rows carry `imageUrls`; legacy rows
 * carry a single `imageUrl`, which folds in as the first (only) image.
 */
export function mergeStepImages(imageUrls: unknown, imageUrl?: string | null): string[] {
  const list = cleanImageList(imageUrls)
  if (list.length) return list
  const legacy = typeof imageUrl === 'string' ? imageUrl.trim() : ''
  return legacy ? [legacy] : []
}
