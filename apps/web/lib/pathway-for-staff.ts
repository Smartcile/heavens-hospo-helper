// Bridges the pure progress resolver to the database: works out which pathway
// nodes a given staff member has already completed, then hands the graph to
// resolvePathwayProgress.
//
// Nothing here writes progress — a node is done because a GuideCompletion or
// TaskCompletion already exists elsewhere in the system.

import { prisma } from '@hospo-ops/db'
import {
  resolvePathwayProgress,
  type PathwayProgress,
  type ProgressNode,
} from '@/lib/pathway-progress'

export interface PathwayNodeView {
  id: string
  kind: 'GUIDE' | 'TASK' | 'CHECKLIST' | 'MILESTONE'
  targetId: string | null
  label: string | null
  x: number
  y: number
  stage: number
  points: number
  sortOrder: number
  /** Resolved display name of the target (guide title, task title, …). */
  title: string
  status: 'LOCKED' | 'AVAILABLE' | 'DONE'
  blockedBy: string[]
}

export interface PathwayView {
  id: string
  name: string
  description: string | null
  status: string
  nodes: PathwayNodeView[]
  edges: { fromNodeId: string; toNodeId: string }[]
  progress: Omit<PathwayProgress, 'nodes'>
}

type RawNode = {
  id: string
  kind: string
  targetId: string | null
  label: string | null
  x: number
  y: number
  stage: number
  points: number
  sortOrder: number
}

/**
 * Which of these nodes has the staff member already satisfied?
 * MILESTONE nodes are excluded — they are awarded by the graph, not completed.
 */
export async function completedNodeIds(
  nodes: readonly RawNode[],
  staffId: string,
): Promise<Set<string>> {
  const done = new Set<string>()

  const guideNodes = nodes.filter((n) => n.kind === 'GUIDE' && n.targetId)
  const taskNodes = nodes.filter((n) => n.kind === 'TASK' && n.targetId)
  const listNodes = nodes.filter((n) => n.kind === 'CHECKLIST' && n.targetId)

  const [guideDone, taskDone, listTasks] = await Promise.all([
    guideNodes.length
      ? prisma.guideCompletion.findMany({
          where: { staffId, guideId: { in: guideNodes.map((n) => n.targetId!) } },
          select: { guideId: true },
        })
      : Promise.resolve([]),
    taskNodes.length
      ? prisma.taskCompletion.findMany({
          where: { staffId, taskId: { in: taskNodes.map((n) => n.targetId!) } },
          select: { taskId: true },
          distinct: ['taskId'],
        })
      : Promise.resolve([]),
    listNodes.length
      ? prisma.checklistTask.findMany({
          where: { checklistId: { in: listNodes.map((n) => n.targetId!) } },
          select: { checklistId: true, taskId: true },
        })
      : Promise.resolve([]),
  ])

  const guideSet = new Set(guideDone.map((g) => g.guideId))
  for (const n of guideNodes) if (guideSet.has(n.targetId!)) done.add(n.id)

  const taskSet = new Set(taskDone.map((t) => t.taskId))
  for (const n of taskNodes) if (taskSet.has(n.targetId!)) done.add(n.id)

  // A checklist counts as done once the person has completed every task in it
  // at least once — an empty checklist is not an automatic win.
  if (listTasks.length) {
    const listTaskDone = await prisma.taskCompletion.findMany({
      where: { staffId, taskId: { in: [...new Set(listTasks.map((t) => t.taskId))] } },
      select: { taskId: true },
      distinct: ['taskId'],
    })
    const doneTaskIds = new Set(listTaskDone.map((t) => t.taskId))

    const byList = new Map<string, string[]>()
    for (const lt of listTasks) {
      byList.set(lt.checklistId, [...(byList.get(lt.checklistId) ?? []), lt.taskId])
    }
    for (const n of listNodes) {
      const taskIds = byList.get(n.targetId!) ?? []
      if (taskIds.length && taskIds.every((id) => doneTaskIds.has(id))) done.add(n.id)
    }
  }

  return done
}

/** Display names for every node target, batched one query per kind. */
export async function nodeTitles(nodes: readonly RawNode[]): Promise<Map<string, string>> {
  const titles = new Map<string, string>()
  const ids = (kind: string) =>
    nodes.filter((n) => n.kind === kind && n.targetId).map((n) => n.targetId!)

  const [guides, tasks, lists] = await Promise.all([
    ids('GUIDE').length
      ? prisma.guide.findMany({ where: { id: { in: ids('GUIDE') } }, select: { id: true, title: true } })
      : Promise.resolve([]),
    ids('TASK').length
      ? prisma.task.findMany({ where: { id: { in: ids('TASK') } }, select: { id: true, title: true } })
      : Promise.resolve([]),
    ids('CHECKLIST').length
      ? prisma.checklist.findMany({ where: { id: { in: ids('CHECKLIST') } }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ])

  for (const g of guides) titles.set(`GUIDE:${g.id}`, g.title)
  for (const t of tasks) titles.set(`TASK:${t.id}`, t.title)
  for (const c of lists) titles.set(`CHECKLIST:${c.id}`, c.name)
  return titles
}

/** Full view of a pathway for one person — nodes, edges, statuses and points. */
export async function resolvePathwayForStaff(
  pathwayId: string,
  staffId: string,
): Promise<PathwayView | null> {
  const pathway = await prisma.pathway.findFirst({
    where: { id: pathwayId, deletedAt: null },
    include: {
      nodes: { orderBy: [{ stage: 'asc' }, { sortOrder: 'asc' }] },
      edges: { select: { fromNodeId: true, toNodeId: true } },
    },
  })
  if (!pathway) return null

  const raw = pathway.nodes as RawNode[]
  const [done, titles] = await Promise.all([completedNodeIds(raw, staffId), nodeTitles(raw)])

  const progressNodes: ProgressNode[] = raw.map((n) => ({
    id: n.id,
    kind: n.kind as ProgressNode['kind'],
    points: n.points,
  }))
  const result = resolvePathwayProgress(progressNodes, pathway.edges, done)
  const statusById = new Map(result.nodes.map((n) => [n.id, n]))

  return {
    id: pathway.id,
    name: pathway.name,
    description: pathway.description,
    status: pathway.status,
    nodes: raw.map((n) => {
      const s = statusById.get(n.id)!
      return {
        id: n.id,
        kind: n.kind as PathwayNodeView['kind'],
        targetId: n.targetId,
        label: n.label,
        x: n.x,
        y: n.y,
        stage: n.stage,
        points: n.points,
        sortOrder: n.sortOrder,
        title:
          n.label ||
          (n.targetId ? titles.get(`${n.kind}:${n.targetId}`) : null) ||
          (n.kind === 'MILESTONE' ? 'MILESTONE' : 'REMOVED'),
        status: s.status,
        blockedBy: s.blockedBy,
      }
    }),
    edges: pathway.edges,
    progress: {
      earnedPoints: result.earnedPoints,
      totalPoints: result.totalPoints,
      level: result.level,
      nextLevelAt: result.nextLevelAt,
    },
  }
}
