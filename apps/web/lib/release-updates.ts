// Release update verification — pure, Prisma-free helpers shared by the admin
// API and the Settings → UPDATES client. Content is the committed GitHub
// snapshot (`content/release-updates.json`); the only stored state is one
// per-admin tick (`UpdateConfirmation`).

export type ReleaseIssueState = 'OPEN' | 'CLOSED'

export interface ReleaseIssue {
  number: number
  title: string
  state: ReleaseIssueState
  url: string
  closedAt: string | null
  labels: string[]
}

export interface ReleaseSnapshot {
  version: string
  generatedAt: string
  repo: string
  issues: ReleaseIssue[]
}

export interface ReleaseConfirmation {
  issueNumber: number
  confirmedAt: string
  note?: string | null
}

export type ReleaseStatusFilter = 'CLOSED' | 'OPEN'

export interface ReleaseAreaGroup {
  area: string
  issues: ReleaseIssue[]
}

export interface ReleaseProgress {
  total: number
  confirmed: number
  percent: number
}

/** Known areas first (the WORKFLOW.md prefixes), then anything unexpected. */
export const RELEASE_AREA_ORDER = [
  'UI',
  'AVAILABILITY',
  'ROSTER',
  'TASKS',
  'GUIDES',
  'BOOKINGS',
  'ORDERS',
  'INVENTORY',
  'EVENTS',
  'SWIFTPOS',
  'OTHER',
] as const

/** `[AREA] Title` → `AREA`; anything without a prefix falls back to OTHER. */
export function parseArea(title: string): string {
  const match = /^\s*\[([^\]]+)\]/.exec(title)
  if (!match) return 'OTHER'
  const area = match[1]
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return area || 'OTHER'
}

export function issueArea(issue: ReleaseIssue): string {
  return parseArea(issue.title)
}

function normaliseLabel(raw: unknown): string | null {
  if (typeof raw === 'string') return raw
  if (raw && typeof raw === 'object' && typeof (raw as { name?: unknown }).name === 'string') {
    return (raw as { name: string }).name
  }
  return null
}

function normaliseIssue(raw: unknown): ReleaseIssue | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const number = Number(row.number)
  if (!Number.isInteger(number) || number <= 0) return null
  if (typeof row.title !== 'string' || !row.title.trim()) return null
  return {
    number,
    title: row.title,
    state: row.state === 'OPEN' ? 'OPEN' : 'CLOSED',
    url: typeof row.url === 'string' ? row.url : '',
    closedAt: typeof row.closedAt === 'string' ? row.closedAt : null,
    labels: Array.isArray(row.labels)
      ? row.labels.map(normaliseLabel).filter((label): label is string => !!label)
      : [],
  }
}

/** Tolerant parse of the committed snapshot: bad rows are dropped, never thrown. */
export function normaliseSnapshot(raw: unknown): ReleaseSnapshot {
  const data = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const seen = new Set<number>()
  const issues: ReleaseIssue[] = []
  if (Array.isArray(data.issues)) {
    for (const item of data.issues) {
      const issue = normaliseIssue(item)
      if (!issue || seen.has(issue.number)) continue
      seen.add(issue.number)
      issues.push(issue)
    }
  }
  issues.sort((a, b) => a.number - b.number)
  return {
    version: typeof data.version === 'string' ? data.version : '',
    generatedAt: typeof data.generatedAt === 'string' ? data.generatedAt : '',
    repo: typeof data.repo === 'string' ? data.repo : '',
    issues,
  }
}

/** No requested version means "current"; a different version is stale. */
export function versionMatches(
  snapshotVersion: string,
  requestedVersion: string | null | undefined,
): boolean {
  if (!requestedVersion) return true
  return requestedVersion.trim() === snapshotVersion
}

function matchesSearch(issue: ReleaseIssue, needle: string): boolean {
  if (!needle) return true
  const q = needle.trim().toLowerCase().replace(/^#/, '')
  if (!q) return true
  return (
    issue.title.toLowerCase().includes(q) ||
    String(issue.number).includes(q) ||
    issueArea(issue).toLowerCase().includes(q) ||
    (issue.closedAt ?? '').slice(0, 10).includes(q)
  )
}

/** Filter by delivered/open state + text search; always sorted by issue number. */
export function filterReleaseIssues(
  issues: ReleaseIssue[],
  opts: { status: ReleaseStatusFilter; search?: string },
): ReleaseIssue[] {
  const search = opts.search ?? ''
  return issues
    .filter((issue) => issue.state === opts.status && matchesSearch(issue, search))
    .sort((a, b) => a.number - b.number)
}

function areaRank(area: string): number {
  const index = (RELEASE_AREA_ORDER as readonly string[]).indexOf(area)
  return index === -1 ? RELEASE_AREA_ORDER.length - 1 : index
}

/** Group by `[AREA]`, known areas first, OTHER (and unknown areas) last. */
export function groupReleaseIssues(issues: ReleaseIssue[]): ReleaseAreaGroup[] {
  const map = new Map<string, ReleaseIssue[]>()
  for (const issue of issues) {
    const area = issueArea(issue)
    const bucket = map.get(area)
    if (bucket) bucket.push(issue)
    else map.set(area, [issue])
  }
  return [...map.entries()]
    .map(([area, rows]) => ({
      area,
      issues: [...rows].sort((a, b) => a.number - b.number),
    }))
    .sort((a, b) => {
      const rank = areaRank(a.area) - areaRank(b.area)
      return rank !== 0 ? rank : a.area.localeCompare(b.area)
    })
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'] as const

/** The fixed calendar day (YYYY-MM-DD) from `closedAt`, or null. */
export function fixedDateKey(issue: ReleaseIssue): string | null {
  if (!issue.closedAt) return null
  const date = new Date(issue.closedAt)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

/** `2026-10-27` / ISO -> `27 OCT 2026`; empty for a missing value. */
export function formatFixedDate(value: string | null | undefined): string {
  if (!value) return ''
  const key = value.slice(0, 10)
  const date = new Date(`${key}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) return value
  return `${String(date.getUTCDate()).padStart(2, '0')} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`
}

export interface ReleaseFixedGroup {
  /** YYYY-MM-DD, or null for issues without a fix date. */
  date: string | null
  issues: ReleaseIssue[]
}

/**
 * Group delivered issues by the day they were fixed, newest first. Issues
 * without a `closedAt` (open issues) land in a final null-date group.
 */
export function groupReleaseIssuesByFixed(issues: ReleaseIssue[]): ReleaseFixedGroup[] {
  const map = new Map<string, ReleaseIssue[]>()
  const undated: ReleaseIssue[] = []
  for (const issue of issues) {
    const key = fixedDateKey(issue)
    if (!key) {
      undated.push(issue)
      continue
    }
    const bucket = map.get(key)
    if (bucket) bucket.push(issue)
    else map.set(key, [issue])
  }
  const groups: ReleaseFixedGroup[] = [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, rows]) => ({ date, issues: [...rows].sort((a, b) => b.number - a.number) }))
  if (undated.length > 0) {
    groups.push({ date: null, issues: [...undated].sort((a, b) => a.number - b.number) })
  }
  return groups
}

/** `x/y VERIFIED` — a zero-issue batch reads 0%, never NaN. */
export function releaseProgress(
  issues: ReleaseIssue[],
  confirmed: ReadonlySet<number> | readonly number[],
): ReleaseProgress {
  const set = confirmed instanceof Set ? confirmed : new Set(confirmed)
  const total = issues.length
  const done = issues.reduce((count, issue) => (set.has(issue.number) ? count + 1 : count), 0)
  return {
    total,
    confirmed: done,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
  }
}

export function confirmedIssueSet(
  confirmations: readonly { issueNumber: number }[],
): Set<number> {
  return new Set(confirmations.map((row) => row.issueNumber))
}
