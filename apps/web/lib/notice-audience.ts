// Notice targeting — who sees a notice. A notice can target several
// departments, sections and positions at once (mirrors GuideAudience). Pure and
// Prisma-free so the admin route, worker route and lists agree.

export type NoticeAudienceKind = 'DEPARTMENT' | 'SECTION' | 'POSITION'

export interface NoticeAudienceRow {
  kind: NoticeAudienceKind
  targetId: string
}

export interface NoticeTargeting {
  /** Legacy single-department targeting; still honoured. */
  departmentId: string | null
  audiences: readonly NoticeAudienceRow[]
}

export interface NoticeStaffContext {
  departmentId: string | null
  sectionIds: ReadonlySet<string>
  positionIds: ReadonlySet<string>
}

const KINDS: NoticeAudienceKind[] = ['DEPARTMENT', 'SECTION', 'POSITION']

/** Validate + de-dupe submitted audiences; unknown kinds are dropped. */
export function cleanNoticeAudiences(raw: unknown): NoticeAudienceRow[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: NoticeAudienceRow[] = []
  for (const a of raw) {
    const kind = (a as { kind?: unknown })?.kind as NoticeAudienceKind
    const targetId = (a as { targetId?: unknown })?.targetId
    if (!KINDS.includes(kind) || typeof targetId !== 'string' || !targetId) continue
    const key = `${kind}:${targetId}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ kind, targetId })
  }
  return out
}

/**
 * True when this notice applies to the person. Empty targeting (no audiences,
 * no department) = whole venue.
 */
export function noticeAppliesTo(notice: NoticeTargeting, ctx: NoticeStaffContext): boolean {
  if (notice.audiences.length === 0 && notice.departmentId == null) return true
  if (ctx.departmentId) {
    if (notice.departmentId === ctx.departmentId) return true
    if (notice.audiences.some((a) => a.kind === 'DEPARTMENT' && a.targetId === ctx.departmentId)) return true
  }
  if (notice.audiences.some((a) => a.kind === 'SECTION' && ctx.sectionIds.has(a.targetId))) return true
  if (notice.audiences.some((a) => a.kind === 'POSITION' && ctx.positionIds.has(a.targetId))) return true
  return false
}

/** The Prisma `OR` matching `noticeAppliesTo`. Kept beside the predicate. */
export function noticeWhereOr(ctx: NoticeStaffContext) {
  return [
    { AND: [{ audiences: { none: {} } }, { departmentId: null }] },
    ...(ctx.departmentId
      ? [
          { departmentId: ctx.departmentId },
          { audiences: { some: { kind: 'DEPARTMENT' as const, targetId: ctx.departmentId } } },
        ]
      : []),
    ...(ctx.sectionIds.size
      ? [{ audiences: { some: { kind: 'SECTION' as const, targetId: { in: [...ctx.sectionIds] } } } }]
      : []),
    ...(ctx.positionIds.size
      ? [{ audiences: { some: { kind: 'POSITION' as const, targetId: { in: [...ctx.positionIds] } } } }]
      : []),
  ]
}
