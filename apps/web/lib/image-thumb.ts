// Pure helpers for the on-demand image thumbnails served by
// `/api/upload/[filename]?w=<px>`. The server uses the parser, every grid and
// picker uses the URL builder — one place, so the browser and the route agree.

const LOCAL_UPLOAD = /^\/api\/upload\//

const MIN_THUMB_WIDTH = 32
const MAX_THUMB_WIDTH = 1600

/**
 * Append `?w=<px>` to a local upload URL so the server serves a cached,
 * downscaled copy. Remote URLs (http…) and empty values pass through — only
 * files this app stores can be resized.
 */
export function thumbUrl(url: string | null | undefined, width: number): string | null {
  if (!url) return null
  if (!LOCAL_UPLOAD.test(url)) return url
  const w = Math.round(width)
  if (!Number.isFinite(w)) return url
  return `${url}${url.includes('?') ? '&' : '?'}w=${Math.min(MAX_THUMB_WIDTH, Math.max(MIN_THUMB_WIDTH, w))}`
}

/** A sane thumbnail width from the query, or null to serve the original. */
export function parseThumbWidth(raw: string | null): number | null {
  if (!raw) return null
  const n = Number(raw)
  if (!Number.isFinite(n)) return null
  const w = Math.round(n)
  return w >= MIN_THUMB_WIDTH && w <= MAX_THUMB_WIDTH ? w : null
}
