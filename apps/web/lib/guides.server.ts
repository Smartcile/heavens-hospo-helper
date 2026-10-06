// Server half of the guide write path. Shared by the admin and worker guide
// routes so both persist steps, task links and audiences identically — the
// step diff in particular must not exist twice (a created step has no id until
// it exists, and links are joined back by array index).
//
// Prisma-backed: never import from a client component.

import { prisma } from '@hospo-ops/db'
import { STEP_LINK_KINDS, type StepLinkKind } from '@/lib/guide-links'
import { mergeStepImages } from '@/lib/guide-media'
import { isGuideType, type GuideType } from '@/lib/guide-types'
import { sanitiseCells, sanitiseColumns, type ReferenceColumn } from '@/lib/reference-table'
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
  imageUrl?: string | null // legacy single image; kept in sync with imageUrls[0]
  imageUrls?: string[] | null
  videoUrl?: string | null // external link (YouTube/Vimeo)
  videoPath?: string | null // locally uploaded + transcoded clip
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

/**
 * Resolve a submitted folderId to a live folder in the guide's venue, or null.
 * A stale/foreign/missing id files the guide as UNFILED rather than erroring.
 */
export async function scopedFolderId(folderId: unknown, venueId: string): Promise<string | null> {
  if (typeof folderId !== 'string' || !folderId) return null
  const folder = await prisma.guideFolder.findUnique({
    where: { id: folderId },
    select: { venueId: true, deletedAt: true },
  })
  if (!folder || folder.deletedAt || folder.venueId !== venueId) return null
  return folderId
}

/**
 * Resolve a submitted sourceMenuId to a live menu in the guide's venue, or null.
 * A stale/foreign/missing id clears the source rather than erroring.
 */
export async function scopedMenuId(menuId: unknown, venueId: string): Promise<string | null> {
  if (typeof menuId !== 'string' || !menuId) return null
  const menu = await prisma.menu.findUnique({
    where: { id: menuId },
    select: { venueId: true, deletedAt: true },
  })
  if (!menu || menu.deletedAt || menu.venueId !== venueId) return null
  return menuId
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
  // `imageUrl` stays as the first image so legacy readers (PDF, file manager)
  // keep working; the ordered list is the source of truth.
  const images = mergeStepImages(s.imageUrls, s.imageUrl)
  return {
    order: i,
    heading: s.heading?.trim() || null,
    content: s.content?.trim() ?? '',
    imageUrl: images[0] ?? null,
    imageUrls: images,
    videoUrl: s.videoUrl?.trim() || null,
    videoPath: s.videoPath?.trim() || null,
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

export interface GuideTableRowInput {
  id?: string | null
  menuItemId?: string | null
  cells?: Record<string, string> | null
}

/** Validate the admin column list (see reference-table.ts). */
export function cleanTableColumns(raw: unknown): ReferenceColumn[] {
  return sanitiseColumns(raw)
}

/**
 * Keep only rows that carry something (a linked product or a manual cell), with
 * their manual data restricted to the guide's current columns.
 */
export function cleanTableRows(raw: unknown, columns: ReferenceColumn[]): GuideTableRowInput[] {
  if (!Array.isArray(raw)) return []
  const out: GuideTableRowInput[] = []
  for (const item of raw) {
    const r = (item ?? {}) as GuideTableRowInput
    const cells = sanitiseCells(r.cells, columns)
    const menuItemId = typeof r.menuItemId === 'string' && r.menuItemId ? r.menuItemId : null
    if (!menuItemId && Object.keys(cells).length === 0) continue
    out.push({ id: typeof r.id === 'string' ? r.id : null, menuItemId, cells })
  }
  return out
}

function tableRowFields(r: GuideTableRowInput, i: number) {
  return { sortOrder: i, menuItemId: r.menuItemId ?? null, cells: r.cells ?? {} }
}

/** Nested create for rows (guide POST). */
export function tableRowsCreate(rows: GuideTableRowInput[]) {
  return rows.map((r, i) => tableRowFields(r, i))
}

/** Diff rows by id (guide PUT) so a stable row keeps its id across saves. */
export function tableRowsWrite(rows: GuideTableRowInput[], existingIds: string[]) {
  const incoming = new Set(rows.map((r) => r.id).filter((id): id is string => !!id))
  return {
    deleteMany: { id: { in: existingIds.filter((id) => !incoming.has(id)) } },
    update: rows
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => r.id && existingIds.includes(r.id))
      .map(({ r, i }) => ({ where: { id: r.id! }, data: tableRowFields(r, i) })),
    create: rows
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => !r.id || !existingIds.includes(r.id))
      .map(({ r, i }) => tableRowFields(r, i)),
  }
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
