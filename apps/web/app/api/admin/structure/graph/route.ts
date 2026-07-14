import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

// GET /api/admin/structure/graph
// Returns a flat node + edge list describing how every entity links together
// (venue → department → section → staff, plus the workflow web: checklists →
// tasks → training/SOP, required-training, how-to guides, resource links).
// Consumed by the MAP view on the Structure page (React Flow). Manager sees
// their own venue; admin sees all.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
    prisma.trainingModule.findMany({
      where: { deletedAt: null, venueId: { in: venueIds } },
      select: {
        id: true, title: true, kind: true, venueId: true, departmentId: true, linkedTaskId: true,
        requiresSignOff: true,
        steps: { select: { linkedTaskId: true, linkedChecklistId: true } },
        moduleTasks: { select: { taskId: true } },
        moduleDepartments: { select: { departmentId: true } },
        requiredByTasks: { select: { taskId: true } },
        linksTo: { select: { toModuleId: true } },
        resourceSections: { select: { sectionId: true } },
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

  const staffSections = await prisma.staffSection.findMany({ select: { staffId: true, sectionId: true } })

  type GNode = {
    id: string
    type: 'venue' | 'department' | 'section' | 'staff' | 'task' | 'checklist' | 'training'
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
  for (const m of training) {
    addNode({ id: `training:${m.id}`, type: 'training', label: m.title, sub: m.kind, venueId: m.venueId })
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

  // Training scoping + workflow links
  for (const m of training) {
    if (m.departmentId) addEdge(`dept:${m.departmentId}`, `training:${m.id}`, 'scope')
    for (const md of m.moduleDepartments) addEdge(`dept:${md.departmentId}`, `training:${m.id}`, 'scope')
    for (const rs of m.resourceSections) addEdge(`section:${rs.sectionId}`, `training:${m.id}`, 'scope')
    // How-to: this module is the guide for a task
    if (m.linkedTaskId) addEdge(`training:${m.id}`, `task:${m.linkedTaskId}`, 'how-to')
    for (const mt of m.moduleTasks) addEdge(`training:${m.id}`, `task:${mt.taskId}`, 'how-to')
    for (const st of m.steps) {
      if (st.linkedTaskId) addEdge(`training:${m.id}`, `task:${st.linkedTaskId}`, 'how-to')
      if (st.linkedChecklistId) addEdge(`training:${m.id}`, `checklist:${st.linkedChecklistId}`, 'embeds')
    }
    // Competency: a task requires this training
    for (const rt of m.requiredByTasks) addEdge(`task:${rt.taskId}`, `training:${m.id}`, 'requires')
    // Resource cross-references
    for (const lt of m.linksTo) addEdge(`training:${m.id}`, `training:${lt.toModuleId}`, 'related')
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
