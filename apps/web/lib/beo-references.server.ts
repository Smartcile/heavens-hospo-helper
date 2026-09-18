// Server-only resolution of the playbook references attached to a BEO area.
// `listReferenceTargets` feeds the admin picker; `resolveReferences` returns the
// details the reference viewer renders (guides include their steps). Targets are
// polymorphic (no FK), so a purged guide/task/checklist is simply absent.

import { prisma } from '@hospo-ops/db'

export interface ReferenceTarget {
  id: string
  name: string
}

export interface GuideReference {
  id: string
  title: string
  description: string | null
  steps: { heading: string | null; content: string; imageUrl: string | null; videoUrl: string | null }[]
}

export interface ResolvedReferences {
  guides: GuideReference[]
  tasks: ReferenceTarget[]
  checklists: ReferenceTarget[]
}

/** Every guide/task/checklist a venue can attach to an area. */
export async function listReferenceTargets(venueId: string) {
  const [guides, tasks, checklists] = await Promise.all([
    prisma.guide.findMany({
      where: { venueId, deletedAt: null },
      select: { id: true, title: true },
      orderBy: { title: 'asc' },
    }),
    prisma.task.findMany({
      where: { venueId, deletedAt: null },
      select: { id: true, title: true },
      orderBy: { title: 'asc' },
    }),
    prisma.checklist.findMany({
      where: { venueId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ])

  return {
    guides: guides.map((g) => ({ id: g.id, name: g.title })),
    tasks: tasks.map((t) => ({ id: t.id, name: t.title })),
    checklists: checklists.map((c) => ({ id: c.id, name: c.name })),
  }
}

function orderById<T extends { id: string }>(list: T[], ids: string[]): T[] {
  const byId = new Map(list.map((x) => [x.id, x]))
  return ids.map((id) => byId.get(id)).filter((x): x is T => !!x)
}

/** Resolve the requested reference ids into displayable details. */
export async function resolveReferences(
  venueId: string,
  ids: { guideIds?: string[]; taskIds?: string[]; checklistIds?: string[] },
): Promise<ResolvedReferences> {
  const guideIds = [...new Set(ids.guideIds ?? [])].filter(Boolean)
  const taskIds = [...new Set(ids.taskIds ?? [])].filter(Boolean)
  const checklistIds = [...new Set(ids.checklistIds ?? [])].filter(Boolean)

  const [guides, tasks, checklists] = await Promise.all([
    guideIds.length
      ? prisma.guide.findMany({
          where: { venueId, deletedAt: null, id: { in: guideIds } },
          select: {
            id: true,
            title: true,
            description: true,
            steps: {
              orderBy: { order: 'asc' },
              select: { heading: true, content: true, imageUrl: true, videoUrl: true },
            },
          },
        })
      : Promise.resolve([]),
    taskIds.length
      ? prisma.task.findMany({
          where: { venueId, deletedAt: null, id: { in: taskIds } },
          select: { id: true, title: true },
        })
      : Promise.resolve([]),
    checklistIds.length
      ? prisma.checklist.findMany({
          where: { venueId, deletedAt: null, id: { in: checklistIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ])

  return {
    guides: orderById(guides, guideIds),
    tasks: orderById(tasks.map((t) => ({ id: t.id, name: t.title })), taskIds),
    checklists: orderById(checklists.map((c) => ({ id: c.id, name: c.name })), checklistIds),
  }
}
