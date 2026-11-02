import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'

// GET /api/admin/structure/graph
// Returns a flat node + edge list describing how every entity links together
// (venue → department → section → staff, plus the workflow web: checklists →
// tasks → training/SOP, required-training, how-to guides, resource links).
// Consumed by the MAP view on the Structure page (React Flow). Manager sees
// their own venue; admin sees all.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'execution.tasks.view')
  if (denied) return denied

  const scope = session.user.role === 'MANAGER' ? { id: session.user.venueId } : {}

  const venues = await prisma.venue.findMany({
    where: { deletedAt: null, ...scope },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true },
  })
  const venueIds = venues.map((v) => v.id)

  const [departments, sections, staff, tasks, training, checklists] = await Promise.all([
    prisma.department.findMany({
      where: { deletedAt: null, venueId: { in: venueIds } },
      select: { id: true, name: true, colour: true, venueId: true },
      orderBy: { name: 'asc' },
    }),
    prisma.section.findMany({
      where: { deletedAt: null, venueId: { in: venueIds } },
      select: { id: true, name: true, colour: true, venueId: true, departmentId: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
    prisma.staff.findMany({
      where: { deletedAt: null, venueId: { in: venueIds } },
      select: { id: true, firstName: true, lastName: true, role: true, venueId: true, departmentId: true },
      orderBy: [{ firstName: 'asc' }],
    }),
    prisma.task.findMany({
      where: { deletedAt: null, venueId: { in: venueIds } },
      select: {
        id: true, title: true, venueId: true, departmentId: true, sectionId: true,
        assignedToStaffId: true, scheduleType: true, isActive: true,
      },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.guide.findMany({
      where: { deletedAt: null, venueId: { in: venueIds } },
      select: {
        id: true, title: true, venueId: true, departmentId: true, status: true,
        isTracked: true, isOnboarding: true, requiresSignOff: true,
        audiences: { select: { kind: true, targetId: true } },
        taskGuides: { select: { taskId: true, isRequiredForCompetency: true } },
        steps: { select: { links: { select: { kind: true, targetId: true } } } },
      },
      orderBy: { title: 'asc' },
    }),
    prisma.checklist.findMany({
      where: { deletedAt: null, venueId: { in: venueIds } },
      select: {
        id: true, name: true, venueId: true, departmentId: true, sectionId: true, appearFromTime: true,
        tasks: { select: { taskId: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
  ])

  // Scoped to the staff actually in the graph — this previously had no `where`
  // at all and scanned every staff-section row in the database on each load.
  const staffSections = staff.length
    ? await prisma.staffSection.findMany({
        where: { staffId: { in: staff.map((s) => s.id) } },
        select: { staffId: true, sectionId: true },
      })
    : []

  const staffPositions = staff.length
    ? await prisma.staffPosition.findMany({
        where: { staffId: { in: staff.map((s) => s.id) } },
        select: { staffId: true, positionId: true },
      })
    : []

  const positions = await prisma.position.findMany({
    where: { deletedAt: null, venueId: { in: venueIds } },
    select: { id: true, name: true, venueId: true, departmentId: true, colour: true },
    orderBy: { name: 'asc' },
  })

  const pathways = await prisma.pathway.findMany({
    where: { deletedAt: null, venueId: { in: venueIds } },
    select: {
      id: true, name: true, venueId: true, status: true,
      departmentId: true, sectionId: true, positionId: true,
      nodes: { select: { kind: true, targetId: true } },
    },
    orderBy: { name: 'asc' },
  })

  type GNode = {
    id: string
    type: 'venue' | 'department' | 'section' | 'position' | 'staff' | 'task' | 'checklist' | 'guide' | 'pathway'
    label: string
    sub?: string
    colour?: string | null
    venueId: string
  }
  type GEdge = { id: string; source: string; target: string; kind: string }

  const nodes: GNode[] = []
  const edges: GEdge[] = []
  const nodeIds = new Set<string>()
  const addNode = (n: GNode) => { nodes.push(n); nodeIds.add(n.id) }
  const addEdge = (source: string, target: string, kind: string) => {
    if (!nodeIds.has(source) || !nodeIds.has(target)) return
    const id = `${kind}:${source}->${target}`
    edges.push({ id, source, target, kind })
  }

  for (const v of venues) addNode({ id: `venue:${v.id}`, type: 'venue', label: v.name, venueId: v.id })
  for (const d of departments) {
    addNode({ id: `dept:${d.id}`, type: 'department', label: d.name, colour: d.colour, venueId: d.venueId })
  }
  for (const s of sections) {
    addNode({ id: `section:${s.id}`, type: 'section', label: s.name, colour: s.colour, venueId: s.venueId })
  }
  for (const p of staff) {
    addNode({ id: `staff:${p.id}`, type: 'staff', label: `${p.firstName} ${p.lastName}`, sub: p.role, venueId: p.venueId })
  }
  for (const t of tasks) {
    addNode({ id: `task:${t.id}`, type: 'task', label: t.title, sub: t.scheduleType, colour: t.isActive ? null : '#6B6B6B', venueId: t.venueId })
  }
  for (const c of checklists) {
    addNode({ id: `checklist:${c.id}`, type: 'checklist', label: c.name, sub: c.appearFromTime ? `FROM ${c.appearFromTime}` : 'LIST', venueId: c.venueId })
  }
  for (const g of training) {
    addNode({
      id: `guide:${g.id}`,
      type: 'guide',
      label: g.title,
      sub: [g.status, g.isTracked ? 'TRACKED' : 'REFERENCE'].join(' · '),
      colour: g.status === 'DRAFT' ? '#6B6B6B' : null,
      venueId: g.venueId,
    })
  }
  for (const p of positions) {
    addNode({ id: `position:${p.id}`, type: 'position', label: p.name, colour: p.colour, venueId: p.venueId })
  }
  for (const p of pathways) {
    addNode({
      id: `pathway:${p.id}`,
      type: 'pathway',
      label: p.name,
      sub: `${p.status} · ${p.nodes.length} NODES`,
      colour: p.status === 'DRAFT' ? '#6B6B6B' : null,
      venueId: p.venueId,
    })
  }

  // Hierarchy edges
  for (const d of departments) addEdge(`venue:${d.venueId}`, `dept:${d.id}`, 'contains')
  for (const s of sections) addEdge(`dept:${s.departmentId}`, `section:${s.id}`, 'contains')
  for (const p of staff) {
    if (p.departmentId) addEdge(`dept:${p.departmentId}`, `staff:${p.id}`, 'member')
  }
  for (const ss of staffSections) addEdge(`section:${ss.sectionId}`, `staff:${ss.staffId}`, 'works')

  // Task scoping
  for (const t of tasks) {
    if (t.sectionId) addEdge(`section:${t.sectionId}`, `task:${t.id}`, 'scope')
    else if (t.departmentId) addEdge(`dept:${t.departmentId}`, `task:${t.id}`, 'scope')
    if (t.assignedToStaffId) addEdge(`staff:${t.assignedToStaffId}`, `task:${t.id}`, 'assigned')
  }

  // Checklist scoping + tasks
  for (const c of checklists) {
    if (c.sectionId) addEdge(`section:${c.sectionId}`, `checklist:${c.id}`, 'scope')
    else if (c.departmentId) addEdge(`dept:${c.departmentId}`, `checklist:${c.id}`, 'scope')
    for (const ct of c.tasks) addEdge(`checklist:${c.id}`, `task:${ct.taskId}`, 'list-task')
  }

  // Positions
  for (const p of positions) {
    if (p.departmentId) addEdge(`dept:${p.departmentId}`, `position:${p.id}`, 'contains')
  }
  for (const sp of staffPositions) addEdge(`position:${sp.positionId}`, `staff:${sp.staffId}`, 'holds')

  // Guide scoping + workflow links
  for (const g of training) {
    if (g.departmentId) addEdge(`dept:${g.departmentId}`, `guide:${g.id}`, 'scope')
    for (const a of g.audiences) {
      const prefix =
        a.kind === 'DEPARTMENT' ? 'dept' : a.kind === 'SECTION' ? 'section' : 'position'
      addEdge(`${prefix}:${a.targetId}`, `guide:${g.id}`, 'scope')
    }
    for (const tg of g.taskGuides) {
      // Competency points task → guide; a plain how-to points the other way.
      if (tg.isRequiredForCompetency) addEdge(`task:${tg.taskId}`, `guide:${g.id}`, 'requires')
      else addEdge(`guide:${g.id}`, `task:${tg.taskId}`, 'how-to')
    }
    // Step links — the guide references other parts of the system.
    for (const st of g.steps) {
      for (const l of st.links) {
        if (l.kind === 'TASK') addEdge(`guide:${g.id}`, `task:${l.targetId}`, 'how-to')
        else if (l.kind === 'CHECKLIST') addEdge(`guide:${g.id}`, `checklist:${l.targetId}`, 'embeds')
        else if (l.kind === 'GUIDE') addEdge(`guide:${g.id}`, `guide:${l.targetId}`, 'related')
        else if (l.kind === 'SECTION') addEdge(`section:${l.targetId}`, `guide:${g.id}`, 'scope')
      }
    }
  }

  // Pathways — who they target, and what they string together
  for (const p of pathways) {
    if (p.positionId) addEdge(`position:${p.positionId}`, `pathway:${p.id}`, 'scope')
    else if (p.sectionId) addEdge(`section:${p.sectionId}`, `pathway:${p.id}`, 'scope')
    else if (p.departmentId) addEdge(`dept:${p.departmentId}`, `pathway:${p.id}`, 'scope')
    else addEdge(`venue:${p.venueId}`, `pathway:${p.id}`, 'scope')

    for (const n of p.nodes) {
      if (!n.targetId) continue
      if (n.kind === 'GUIDE') addEdge(`pathway:${p.id}`, `guide:${n.targetId}`, 'step')
      else if (n.kind === 'TASK') addEdge(`pathway:${p.id}`, `task:${n.targetId}`, 'step')
      else if (n.kind === 'CHECKLIST') addEdge(`pathway:${p.id}`, `checklist:${n.targetId}`, 'step')
    }
  }

  // De-dupe edges (a task can link a module via several paths)
  const seen = new Set<string>()
  const dedupedEdges = edges.filter((e) => {
    const key = `${e.kind}:${e.source}->${e.target}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return NextResponse.json({
    venues: venues.map((v) => ({ id: v.id, name: v.name })),
    nodes,
    edges: dedupedEdges,
  })
}
