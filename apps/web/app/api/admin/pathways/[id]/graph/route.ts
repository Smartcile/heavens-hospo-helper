import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { findPathwayCycle, type PathwayNodeKind } from '@/lib/pathway-progress'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'

interface Params {
  params: { id: string }
}

interface IncomingNode {
  id?: string | null
  _clientId?: string
  kind: PathwayNodeKind
  targetId?: string | null
  label?: string | null
  x: number
  y: number
  stage?: number
  points?: number
  sortOrder?: number
}

interface IncomingEdge {
  fromNodeId: string // may be a real id or a _clientId
  toNodeId: string
}

const KINDS: PathwayNodeKind[] = ['GUIDE', 'TASK', 'CHECKLIST', 'MILESTONE']

/**
 * Bulk save of the whole board — nodes, positions and edges — in one
 * transaction, mirroring the floor plan's elements save. Responds with a
 * `_clientId` → real id map so the client can reconcile without a refetch.
 */
export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'training.pathways.edit')
  if (denied) return denied

  const pathway = await prisma.pathway.findUnique({
    where: { id: params.id },
    select: { id: true, venueId: true, deletedAt: true },
  })
  if (!pathway || pathway.deletedAt) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (session.user.role === 'MANAGER' && pathway.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const nodes: IncomingNode[] = Array.isArray(body.nodes) ? body.nodes : []
  const edges: IncomingEdge[] = Array.isArray(body.edges) ? body.edges : []

  for (const n of nodes) {
    if (!KINDS.includes(n.kind)) {
      return NextResponse.json({ error: `Unknown node kind: ${n.kind}` }, { status: 400 })
    }
    if (n.kind !== 'MILESTONE' && !n.targetId) {
      return NextResponse.json({ error: `${n.kind} nodes need a target` }, { status: 400 })
    }
  }

  // A cycle strands part of the tree permanently — reject it here rather than
  // letting the progress resolver quietly lock those nodes forever.
  const keyOf = (n: IncomingNode) => n.id ?? n._clientId ?? ''
  const cycle = findPathwayCycle(
    nodes.map((n) => ({ id: keyOf(n) })),
    edges.map((e) => ({ fromNodeId: e.fromNodeId, toNodeId: e.toNodeId })),
  )
  if (cycle) {
    return NextResponse.json(
      { error: 'CIRCULAR PREREQUISITE — A NODE CANNOT UNLOCK ITSELF', cycle },
      { status: 422 },
    )
  }

  const existingIds = (
    await prisma.pathwayNode.findMany({ where: { pathwayId: params.id }, select: { id: true } })
  ).map((n) => n.id)
  const keptIds = nodes.map((n) => n.id).filter((id): id is string => !!id)
  const removedIds = existingIds.filter((id) => !keptIds.includes(id))

  const fields = (n: IncomingNode, i: number) => ({
    kind: n.kind,
    targetId: n.kind === 'MILESTONE' ? null : n.targetId!,
    label: n.label?.trim() || null,
    x: Number(n.x) || 0,
    y: Number(n.y) || 0,
    stage: Number(n.stage) || 0,
    points: Number.isFinite(n.points) ? Number(n.points) : 10,
    sortOrder: Number(n.sortOrder) || i,
  })

  const idMap = await prisma.$transaction(async (tx) => {
    // Edges are rebuilt wholesale; nothing hangs off an edge, and dropping them
    // first frees the FKs so removed nodes delete cleanly.
    await tx.pathwayEdge.deleteMany({ where: { pathwayId: params.id } })
    if (removedIds.length) {
      await tx.pathwayNode.deleteMany({ where: { id: { in: removedIds } } })
    }

    const map = new Map<string, string>()

    for (const [i, n] of nodes.entries()) {
      if (n.id && existingIds.includes(n.id)) {
        await tx.pathwayNode.update({ where: { id: n.id }, data: fields(n, i) })
        map.set(n.id, n.id)
      } else {
        const created = await tx.pathwayNode.create({
          data: { pathwayId: params.id, ...fields(n, i) },
        })
        map.set(keyOf(n), created.id)
      }
    }

    const seen = new Set<string>()
    const edgeRows = edges.flatMap((e) => {
      const from = map.get(e.fromNodeId)
      const to = map.get(e.toNodeId)
      if (!from || !to || from === to) return []
      const key = `${from}->${to}`
      if (seen.has(key)) return []
      seen.add(key)
      return [{ pathwayId: params.id, fromNodeId: from, toNodeId: to }]
    })
    if (edgeRows.length) await tx.pathwayEdge.createMany({ data: edgeRows })

    return map
  })

  const saved = await prisma.pathwayNode.findMany({
    where: { pathwayId: params.id },
    orderBy: [{ stage: 'asc' }, { sortOrder: 'asc' }],
  })
  const savedEdges = await prisma.pathwayEdge.findMany({ where: { pathwayId: params.id } })

  return NextResponse.json({
    nodes: saved,
    edges: savedEdges,
    idMap: Object.fromEntries(idMap),
    deleted: removedIds.length,
  })
}
