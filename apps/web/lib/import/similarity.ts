// Pure matching helpers for the shared importer. No Prisma imports.

export function normaliseImportKey(value: unknown): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

export function tokenSet(value: string): Set<string> {
  return new Set(
    normaliseImportKey(value)
      .split(/[^A-Z0-9]+/)
      .filter(Boolean),
  )
}

/** Jaccard similarity of the two token sets (0..1). */
export function tokenJaccard(a: string, b: string): number {
  const left = tokenSet(a)
  const right = tokenSet(b)
  if (left.size === 0 && right.size === 0) return 0
  let intersection = 0
  for (const token of left) if (right.has(token)) intersection++
  const union = left.size + right.size - intersection
  return union === 0 ? 0 : intersection / union
}

export function levenshtein(a: string, b: string): number {
  const left = normaliseImportKey(a)
  const right = normaliseImportKey(b)
  if (left === right) return 0
  if (left.length === 0) return right.length
  if (right.length === 0) return left.length
  let previous = Array.from({ length: right.length + 1 }, (_, i) => i)
  for (let i = 1; i <= left.length; i++) {
    const current = [i]
    for (let j = 1; j <= right.length; j++) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost)
    }
    previous = current
  }
  return previous[right.length]
}

/** 1 means identical, 0 means completely different. */
export function levenshteinRatio(a: string, b: string): number {
  const max = Math.max(normaliseImportKey(a).length, normaliseImportKey(b).length)
  if (max === 0) return 1
  return 1 - levenshtein(a, b) / max
}

export const SIMILAR_JACCARD = 0.8
export const SIMILAR_LEVENSHTEIN = 0.85

/** Best "potential copy" among existing rows, or null when nothing is close. */
export function findSimilar<T extends { id: string; name: string }>(
  name: string,
  existing: T[],
): { target: T; score: number } | null {
  let best: { target: T; score: number } | null = null
  for (const row of existing) {
    const jaccard = tokenJaccard(name, row.name)
    const ratio = levenshteinRatio(name, row.name)
    if (jaccard < SIMILAR_JACCARD && ratio < SIMILAR_LEVENSHTEIN) continue
    const score = Math.max(jaccard, ratio)
    if (!best || score > best.score) best = { target: row, score }
  }
  return best
}
