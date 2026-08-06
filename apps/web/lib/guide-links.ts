// Step links — the shared vocabulary for what a guide step points at.
//
// One polymorphic table (GuideStepLink) replaces the five junctions the legacy
// TrainingStep carried. Losing the foreign key means two jobs move into code:
// batch-loading targets, and surviving a deleted one. Both live in
// `guide-links.server.ts`.
//
// This module stays Prisma-free on purpose: the worker reader renders links in
// the browser, and importing the server half would drag the pg driver into the
// client bundle (it does — `next build` fails on `Can't resolve 'fs'`).

export type StepLinkKind = 'ITEM' | 'TASK' | 'CHECKLIST' | 'GUIDE' | 'SECTION' | 'RECIPE'

export const STEP_LINK_KINDS: StepLinkKind[] = [
  'ITEM', 'TASK', 'CHECKLIST', 'GUIDE', 'SECTION', 'RECIPE',
]

export const STEP_LINK_LABEL: Record<StepLinkKind, string> = {
  ITEM: 'TOOL / ITEM',
  TASK: 'TASK',
  CHECKLIST: 'CHECKLIST',
  GUIDE: 'GUIDE',
  SECTION: 'SECTION',
  RECIPE: 'RECIPE',
}

export interface StepLinkRow {
  id: string
  kind: StepLinkKind
  targetId: string
  qty: number | null
  note: string | null
  order: number
}

/** What the reader shows for a link, whatever kind it is. */
export interface LinkTarget {
  id: string
  label: string
  /** Secondary line — storage path, department, schedule, etc. */
  sub: string | null
  imageUrl: string | null
  /** True when the target no longer exists (hard-deleted or purged). */
  missing: boolean
}

export interface ResolvedStepLink extends StepLinkRow {
  target: LinkTarget
}

const MISSING_LABEL: Record<StepLinkKind, string> = {
  ITEM: 'ITEM REMOVED',
  TASK: 'TASK REMOVED',
  CHECKLIST: 'CHECKLIST REMOVED',
  GUIDE: 'GUIDE REMOVED',
  SECTION: 'SECTION REMOVED',
  RECIPE: 'RECIPE REMOVED',
}

export function targetKey(kind: StepLinkKind, targetId: string): string {
  return `${kind}:${targetId}`
}

/** Distinct target ids per kind — the input to one batched query per kind. */
export function groupTargetIdsByKind(
  links: readonly StepLinkRow[],
): Partial<Record<StepLinkKind, string[]>> {
  const out: Partial<Record<StepLinkKind, string[]>> = {}
  for (const l of links) {
    const seen = (out[l.kind] ??= [])
    if (!seen.includes(l.targetId)) seen.push(l.targetId)
  }
  return out
}

/**
 * Attach a resolved target to every link, substituting a `missing` placeholder
 * where the index has no entry. Sorted by `order` so the reader is stable.
 */
export function attachTargets(
  links: readonly StepLinkRow[],
  index: ReadonlyMap<string, LinkTarget>,
): ResolvedStepLink[] {
  return [...links]
    .sort((a, b) => a.order - b.order)
    .map((l) => ({
      ...l,
      target:
        index.get(targetKey(l.kind, l.targetId)) ?? {
          id: l.targetId,
          label: MISSING_LABEL[l.kind],
          sub: null,
          imageUrl: null,
          missing: true,
        },
    }))
}
