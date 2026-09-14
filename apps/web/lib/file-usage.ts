import { prisma } from '@hospo-ops/db'

// ── File usage lookup ────────────────────────────────────────────────────
// The file manager shows WHERE each stored file is referenced, and the
// DELETE route refuses to remove a file that is still linked. Lookups match
// on the file's basename (upload filenames are uuid-prefixed so they are
// unique across the store). Soft-deleted rows do not count as usage.

export interface FileUsage {
  kind: 'template' | 'gift-card' | 'staff' | 'completion' | 'training-step' | 'guide-step' | 'inventory' | 'menu' | 'woo-image'
  label: string
  ref: string
  id: string
}

const contains = (basename: string) => ({ contains: basename })

function textListsContain(col: unknown, basename: string): boolean {
  return Array.isArray(col) && col.some((u) => typeof u === 'string' && u.includes(basename))
}

/** Every active DB reference to one file (by basename). */
export async function fileUsages(basename: string): Promise<FileUsage[]> {
  const [templates, cards, staff, completions, trainingSteps, guideSteps, items, menus] = await Promise.all([
    prisma.giftCardTemplate.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, filePath: true },
    }),
    prisma.giftCard.findMany({
      where: { deletedAt: null },
      select: { id: true, number: true, pdfPath: true },
    }),
    prisma.staff.findMany({
      where: { deletedAt: null, profilePhotoUrl: contains(basename) },
      select: { id: true, firstName: true, lastName: true },
    }),
    prisma.taskCompletion.findMany({
      where: { photoUrl: contains(basename), task: { deletedAt: null } },
      select: { id: true, task: { select: { title: true } } },
    }),
    prisma.trainingStep.findMany({
      where: { imageUrl: contains(basename), module: { deletedAt: null } },
      select: { id: true, module: { select: { title: true } } },
    }),
    prisma.guideStep.findMany({
      where: { imageUrl: contains(basename), guide: { deletedAt: null } },
      select: { id: true, guide: { select: { title: true } } },
    }),
    prisma.inventoryItem.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, imageUrls: true },
    }),
    prisma.menuItem.findMany({
      where: { deletedAt: null, imageUrl: contains(basename) },
      select: { id: true, name: true, wooImageId: true },
    }),
  ])

  const usages: FileUsage[] = []
  for (const t of templates) {
    if (t.filePath && t.filePath.endsWith(basename)) {
      usages.push({ kind: 'template', label: 'GIFT CARD TEMPLATE', ref: t.name, id: t.id })
    }
  }
  for (const c of cards) {
    if (c.pdfPath && c.pdfPath.endsWith(basename)) {
      usages.push({ kind: 'gift-card', label: 'GIFT CARD', ref: `CARD ${c.number}`, id: c.id })
    }
  }
  for (const s of staff) {
    usages.push({ kind: 'staff', label: 'STAFF PHOTO', ref: `${s.firstName} ${s.lastName}`.trim() || s.id, id: s.id })
  }
  for (const c of completions) {
    usages.push({ kind: 'completion', label: 'TASK PHOTO', ref: c.task?.title ?? '', id: c.id })
  }
  for (const s of trainingSteps) {
    usages.push({ kind: 'training-step', label: 'LEGACY TRAINING PHOTO', ref: s.module?.title ?? '', id: s.id })
  }
  for (const s of guideSteps) {
    usages.push({ kind: 'guide-step', label: 'GUIDE PHOTO', ref: s.guide?.title ?? '', id: s.id })
  }
  for (const it of items) {
    if (textListsContain(it.imageUrls, basename)) {
      usages.push({ kind: 'inventory', label: 'INVENTORY PHOTO', ref: it.name, id: it.id })
    }
  }
  for (const m of menus) {
    usages.push({ kind: 'menu', label: 'MENU PRODUCT PHOTO', ref: m.name, id: m.id })
    if (m.wooImageId) {
      // Also synced to WordPress as the product's image — the explorer shows
      // this so a pushed image is traceable to its local file.
      usages.push({ kind: 'woo-image', label: 'WOO PRODUCT IMAGE (ON WORDPRESS)', ref: m.name, id: m.id })
    }
  }
  return usages
}

/** Usage for every file name in a directory, in one round of DB queries. */
export async function fileUsagesForNames(names: string[]): Promise<Record<string, FileUsage[]>> {
  const clean = names.filter(Boolean)
  const grouped: Record<string, FileUsage[]> = {}
  if (clean.length === 0) return grouped

  const orContains = (field: 'imageUrl' | 'profilePhotoUrl' | 'photoUrl') => ({
    OR: clean.map((n) => ({ [field]: { contains: n } })),
  })

  const [templates, cards, staff, completions, trainingSteps, guideSteps, items, menus] = await Promise.all([
    prisma.giftCardTemplate.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, filePath: true },
    }),
    prisma.giftCard.findMany({
      where: { deletedAt: null },
      select: { id: true, number: true, pdfPath: true },
    }),
    prisma.staff.findMany({
      where: { deletedAt: null, ...orContains('profilePhotoUrl') },
      select: { id: true, firstName: true, lastName: true, profilePhotoUrl: true },
    }),
    prisma.taskCompletion.findMany({
      where: { ...orContains('photoUrl'), task: { deletedAt: null } },
      select: { id: true, photoUrl: true, task: { select: { title: true } } },
    }),
    prisma.trainingStep.findMany({
      where: { ...orContains('imageUrl'), module: { deletedAt: null } },
      select: { id: true, imageUrl: true, module: { select: { title: true } } },
    }),
    prisma.guideStep.findMany({
      where: { ...orContains('imageUrl'), guide: { deletedAt: null } },
      select: { id: true, imageUrl: true, guide: { select: { title: true } } },
    }),
    prisma.inventoryItem.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, imageUrls: true },
    }),
    prisma.menuItem.findMany({
      where: { deletedAt: null, ...orContains('imageUrl') },
      select: { id: true, name: true, imageUrl: true, wooImageId: true },
    }),
  ])

  const matchName = (url: string | null | undefined): string | undefined =>
    clean.find((n) => url != null && url.includes(n))

  for (const t of templates) {
    const n = t.filePath ? clean.find((x) => t.filePath!.endsWith(x)) : undefined
    if (n) (grouped[n] ??= []).push({ kind: 'template', label: 'GIFT CARD TEMPLATE', ref: t.name, id: t.id })
  }
  for (const c of cards) {
    const n = c.pdfPath ? clean.find((x) => c.pdfPath!.endsWith(x)) : undefined
    if (n) (grouped[n] ??= []).push({ kind: 'gift-card', label: 'GIFT CARD', ref: `CARD ${c.number}`, id: c.id })
  }
  for (const s of staff) {
    const n = matchName(s.profilePhotoUrl)
    if (n) (grouped[n] ??= []).push({ kind: 'staff', label: 'STAFF PHOTO', ref: `${s.firstName} ${s.lastName}`.trim() || s.id, id: s.id })
  }
  for (const c of completions) {
    const n = matchName(c.photoUrl)
    if (n) (grouped[n] ??= []).push({ kind: 'completion', label: 'TASK PHOTO', ref: c.task?.title ?? '', id: c.id })
  }
  for (const s of trainingSteps) {
    const n = matchName(s.imageUrl)
    if (n) (grouped[n] ??= []).push({ kind: 'training-step', label: 'LEGACY TRAINING PHOTO', ref: s.module?.title ?? '', id: s.id })
  }
  for (const s of guideSteps) {
    const n = matchName(s.imageUrl)
    if (n) (grouped[n] ??= []).push({ kind: 'guide-step', label: 'GUIDE PHOTO', ref: s.guide?.title ?? '', id: s.id })
  }
  for (const it of items) {
    const urls = Array.isArray(it.imageUrls) ? it.imageUrls : null
    const n = urls ? clean.find((x) => urls.some((u) => typeof u === 'string' && u.includes(x))) : undefined
    if (n) (grouped[n] ??= []).push({ kind: 'inventory', label: 'INVENTORY PHOTO', ref: it.name, id: it.id })
  }
  for (const m of menus) {
    const n = matchName(m.imageUrl)
    if (n) {
      (grouped[n] ??= []).push({ kind: 'menu', label: 'MENU PRODUCT PHOTO', ref: m.name, id: m.id })
      if (m.wooImageId) {
        (grouped[n] ??= []).push({ kind: 'woo-image', label: 'WOO PRODUCT IMAGE (ON WORDPRESS)', ref: m.name, id: m.id })
      }
    }
  }
  return grouped
}
