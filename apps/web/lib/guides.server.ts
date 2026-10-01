// Server half of the guide write path. Shared by the admin and worker guide
// routes so both persist steps, task links and audiences identically — the
// step diff in particular must not exist twice (a created step has no id until
// it exists, and links are joined back by array index).
//
// Prisma-backed: never import from a client component.

import { prisma } from '@hospo-ops/db'
import { STEP_LINK_KINDS, type StepLinkKind } from '@/lib/guide-links'
import { isGuideType, type GuideType } from '@/lib/guide-types'
import { sanitiseRichText } from '@/lib/rich-text'

export interface GuideLinkInput {
  kind: StepLinkKind
  targetId: string
  qty?: number | null
  note?: string | null
}

export interface GuideStepInput {
  id?: string | null // present for an existing step — keeps ids (and links) stable
  heading?: string | null
  content: string
  imageUrl?: string | null
  videoUrl?: string | null
  links?: GuideLinkInput[]
}

export interface GuideTaskLinkInput {
  taskId: string
  isRequiredForCompetency: boolean
}

export interface GuideAudienceInput {
  kind: 'DEPARTMENT' | 'SECTION' | 'POSITION'
  targetId: string
}

export function guideTypeValue(value: unknown): GuideType | null {
  return isGuideType(value) ? value : null
}

/** Sanitised body HTML, or null when it carries no text. */
export function cleanBodyHtml(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const clean = sanitiseRichText(raw)
  return clean.trim() ? clean : null
}

/** Drop empty steps (a step needs a heading or content to exist). */
export function cleanGuideSteps(raw: unknown): GuideStepInput[] {
  if (!Array.isArray(raw)) return []
  return (raw as GuideStepInput[]).filter((s) => s?.content?.trim() || s?.heading?.trim())
}

function stepFields(s: GuideStepInput, i: number) {
  return {
    order: i,
    heading: s.heading?.trim() || null,
    content: s.content?.trim() ?? '',
    imageUrl: s.imageUrl || null,
    videoUrl: s.videoUrl?.trim() || null,
  }
}

/** Dedupe + validate step links; `order` follows array position. */
export function cleanLinks(links: GuideLinkInput[] | undefined) {
  const seen = new Set<string>()
  return (links ?? [])
    .filter((l) => {
      if (!l?.targetId || !STEP_LINK_KINDS.includes(l.kind)) return false
      const key = `${l.kind}:${l.targetId}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .map((l, order) => ({
      kind: l.kind,
      targetId: l.targetId,
      qty: typeof l.qty === 'number' ? l.qty : null,
      note: l.note?.trim() || null,
      order,
    }))
}

/** Nested create for steps (guide POST). Links are created only when provided. */
export function guideStepsCreate(steps: GuideStepInput[]) {
  return steps.map((s, i) => ({
    ...stepFields(s, i),
    ...(s.links !== undefined ? { links: { create: cleanLinks(s.links) } } : {}),
  }))
}

export function cleanTaskGuides(raw: unknown): GuideTaskLinkInput[] {
  if (!Array.isArray(raw)) return []
  return (raw as GuideTaskLinkInput[])
    .filter((tg) => tg?.taskId)
    .map((tg) => ({ taskId: tg.taskId, isRequiredForCompetency: !!tg.isRequiredForCompetency }))
}

export function cleanAudiences(raw: unknown): GuideAudienceInput[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  return (raw as GuideAudienceInput[])
    .filter((a) => {
      if (!a?.targetId || !['DEPARTMENT', 'SECTION', 'POSITION'].includes(a.kind)) return false
      const key = `${a.kind}:${a.targetId}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .map((a) => ({ kind: a.kind, targetId: a.targetId }))
}

/**
 * Prisma nested-write that diffs steps by id against the existing set rather
 * than deleting and recreating — step ids (and anything hanging off them) stay
 * stable across unrelated edits.
 */
export function guideStepsWrite(steps: GuideStepInput[], existingIds: string[]) {
  const incomingIds = new Set(steps.map((s) => s.id).filter((id): id is string => !!id))
  return {
    deleteMany: { id: { in: existingIds.filter((id) => !incomingIds.has(id)) } },
    update: steps
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => s.id && existingIds.includes(s.id))
      .map(({ s, i }) => ({ where: { id: s.id! }, data: stepFields(s, i) })),
    create: steps
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => !s.id || !existingIds.includes(s.id))
      .map(({ s, i }) => stepFields(s, i)),
  }
}

/**
 * True when the caller supplied `links` on any step (i.e. it manages links and
 * a wholesale replace is wanted). The worker editor omits `links`, so it never
 * wipes links authored elsewhere.
 */
export function stepsManageLinks(steps: GuideStepInput[]): boolean {
  return steps.some((s) => s.links !== undefined)
}

/**
 * Replace all step links for the ordered saved steps. Steps come back ordered
 * 0..n-1 matching the input array, so index is a safe join.
 */
export async function syncStepLinks(savedSteps: { id: string }[], steps: GuideStepInput[]): Promise<void> {
  await prisma.$transaction([
    prisma.guideStepLink.deleteMany({ where: { stepId: { in: savedSteps.map((s) => s.id) } } }),
    ...savedSteps.flatMap((step, i) => {
      const rows = cleanLinks(steps[i]?.links).map((l) => ({
        stepId: step.id,
        kind: l.kind,
        targetId: l.targetId,
        qty: l.qty,
        note: l.note,
        order: l.order,
      }))
      return rows.length ? [prisma.guideStepLink.createMany({ data: rows })] : []
    }),
  ])
}
