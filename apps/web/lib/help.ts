/**
 * Heavenly Help — pure helpers shared by the API routes, the two help pages and
 * the deploy seed. Content is a repo-authored pack (content/help/articles.ts);
 * these functions decide what a viewer sees, how it is grouped/searched, and
 * whether the seeded copy is stale.
 */

export type HelpAudience = 'EVERYONE' | 'ADMIN' | 'WORKER'
export type HelpViewer = 'ADMIN' | 'WORKER'

export interface HelpArticleLike {
  slug: string
  title: string
  summary: string | null
  category: string
  audience: HelpAudience
  sortOrder: number
  bodyHtml: string | null
}

export interface HelpArticleView extends HelpArticleLike {
  id: string
}

/** Viewer audience rule: admins see EVERYONE + ADMIN; workers EVERYONE + WORKER. */
export function helpVisibleTo(audience: HelpAudience, viewer: HelpViewer): boolean {
  if (audience === 'EVERYONE') return true
  return audience === viewer
}

export function visibleHelpArticles<T extends { audience: HelpAudience; sortOrder: number }>(
  articles: T[],
  viewer: HelpViewer,
): T[] {
  return articles
    .filter((a) => helpVisibleTo(a.audience, viewer))
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

/** Category order follows the lowest sortOrder in that category. */
export function groupHelpArticles<T extends { category: string; sortOrder: number }>(
  articles: T[],
): { category: string; articles: T[] }[] {
  const byCategory = new Map<string, T[]>()
  for (const article of articles) {
    if (!byCategory.has(article.category)) byCategory.set(article.category, [])
    byCategory.get(article.category)!.push(article)
  }
  return [...byCategory.entries()]
    .map(([category, rows]) => ({
      category,
      articles: [...rows].sort((a, b) => a.sortOrder - b.sortOrder),
    }))
    .sort((a, b) => Math.min(...a.articles.map((x) => x.sortOrder)) - Math.min(...b.articles.map((x) => x.sortOrder)))
}

export function searchHelpArticles<T extends { title: string; summary: string | null; bodyHtml: string | null }>(
  articles: T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase()
  if (!q) return articles
  return articles.filter((a) =>
    `${a.title} ${a.summary ?? ''} ${stripTags(a.bodyHtml ?? '')}`.toLowerCase().includes(q),
  )
}

/** Tolerant label text for a search index / coverage checks. */
function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Deterministic content hash (FNV-1a 32-bit, hex). Used by the seed to avoid
 * rewriting unchanged rows on every deploy.
 */
export function helpContentHash(article: HelpArticleLike): string {
  const payload = JSON.stringify([
    article.slug,
    article.title,
    article.summary,
    article.category,
    article.audience,
    article.sortOrder,
    article.bodyHtml,
  ])
  let hash = 0x811c9dc5
  for (let i = 0; i < payload.length; i++) {
    hash ^= payload.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/** Slugs a feature batch must document (used by the coverage test). */
export const HELP_REQUIRED_SLUGS = [
  'getting-started',
  'dashboard',
  'ops-menu',
  'ops-orders-bookings',
  'inventory',
  'events',
  'rooms-plans',
  'team-roster-availability',
  'tasks-guides',
  'tasks-groups',
  'worker-app',
  'gift-cards',
  'settings',
  'compliance',
] as const
