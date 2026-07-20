import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

// GET /api/admin/structure
// Returns the LIVE entity tree (venue → department → staff / tasks / training,
// plus venue-wide items) so the admin Structure page can render how everything
// is currently linked. Manager sees their own venue; admin sees all.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const scope = session.user.role === 'MANAGER' ? { id: session.user.venueId } : {}

  const venues = await prisma.venue.findMany({
    where: { deletedAt: null, ...scope },
    orderBy: { createdAt: 'asc' },
    include: { departments: { where: { deletedAt: null }, orderBy: { name: 'asc' } } },
  })
  const venueIds = venues.map((v) => v.id)

  const [staff, tasks, training] = await Promise.all([
    prisma.staff.findMany({
      where: { deletedAt: null, venueId: { in: venueIds } },
      select: { id: true, firstName: true, lastName: true, role: true, venueId: true, departmentId: true },
      orderBy: [{ firstName: 'asc' }],
    }),
    prisma.task.findMany({
      where: { deletedAt: null, venueId: { in: venueIds } },
      select: { id: true, title: true, venueId: true, departmentId: true, sectionId: true, assignedToStaffId: true, scheduleType: true, isActive: true },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.trainingModule.findMany({
      where: { deletedAt: null, venueId: { in: venueIds } },
      select: { id: true, title: true, venueId: true, departmentId: true, isOnboarding: true, requiresSignOff: true, linkedTaskId: true },
      orderBy: { title: 'asc' },
    }),
  ])

  const [sections, staffSections, floorPlanElements, deptLinks, storedItems] = await Promise.all([
    prisma.section.findMany({
      where: { deletedAt: null, venueId: { in: venueIds } },
      select: { id: true, name: true, colour: true, departmentId: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
    prisma.staffSection.findMany({ select: { staffId: true, sectionId: true } }),
    prisma.floorPlanElement.findMany({
      where: { deletedAt: null, sectionId: { not: null }, floorPlan: { deletedAt: null } },
      select: { id: true, type: true, sectionId: true, label: true, _count: { select: { inventoryItems: true } } },
    }),
    prisma.departmentLink.findMany({
      where: { fromDepartment: { venueId: { in: venueIds } } },
      select: { fromDepartmentId: true, toDepartment: { select: { id: true, name: true, colour: true } } },
    }),
    prisma.inventoryItem.findMany({
      where: { deletedAt: null, venueId: { in: venueIds }, storageSectionId: { not: null } },
      select: { id: true, name: true, unit: true, storageSectionId: true, storageNotes: true, totalQty: true, imageUrl: true },
      orderBy: { name: 'asc' },
    }),
  ])

  // Build map of departmentId → linked department info
  const deptLinksByDept = new Map<string, { id: string; name: string; colour: string | null }[]>()
  for (const dl of deptLinks) {
    const arr = deptLinksByDept.get(dl.fromDepartmentId) ?? []
    arr.push(dl.toDepartment)
    deptLinksByDept.set(dl.fromDepartmentId, arr)
  }
  // Workflow links per task (mirrors the MAP edges): which checklists list a
  // task (list-task), which training is its how-to guide (how-to), and which
  // training it requires (requires). Rendered as coloured tags on each task.
  const [linkChecklists, linkTraining] = await Promise.all([
    prisma.checklist.findMany({
      where: { deletedAt: null, venueId: { in: venueIds } },
      select: { id: true, name: true, appearFromTime: true, tasks: { select: { taskId: true } } },
    }),
    prisma.trainingModule.findMany({
      where: { deletedAt: null, venueId: { in: venueIds } },
      select: {
        id: true, title: true, kind: true, linkedTaskId: true,
        steps: { select: { linkedTaskId: true } },
        moduleTasks: { select: { taskId: true } },
        requiredByTasks: { select: { taskId: true } },
        _count: { select: { steps: true } },
      },
    }),
  ])
  type TaskLink = { label: string; colour: string; kind: string; targetId: string; targetType: string; targetSub: string }
  const linksByTask = new Map<string, TaskLink[]>()
  const pushLink = (taskId: string, link: TaskLink) => {
    const arr = linksByTask.get(taskId) ?? []
    if (!arr.some((l) => l.kind === link.kind && l.targetId === link.targetId)) arr.push(link)
    linksByTask.set(taskId, arr)
  }
  for (const c of linkChecklists) {
    const sub = `${c.tasks.length} TASK${c.tasks.length !== 1 ? 'S' : ''}${c.appearFromTime ? ` · FROM ${c.appearFromTime}` : ''}`
    for (const ct of c.tasks) pushLink(ct.taskId, { label: c.name, colour: '#4ADE80', kind: 'list', targetId: c.id, targetType: 'CHECKLIST', targetSub: sub })
  }
  for (const m of linkTraining) {
    const sub = `${m.kind} · ${m._count.steps} STEP${m._count.steps !== 1 ? 'S' : ''}`
    const tType = m.kind === 'TRAINING' ? 'TRAINING MODULE' : m.kind
    if (m.linkedTaskId) pushLink(m.linkedTaskId, { label: m.title, colour: '#F97316', kind: 'how-to', targetId: m.id, targetType: tType, targetSub: sub })
    for (const mt of m.moduleTasks) pushLink(mt.taskId, { label: m.title, colour: '#F97316', kind: 'how-to', targetId: m.id, targetType: tType, targetSub: sub })
    for (const st of m.steps) if (st.linkedTaskId) pushLink(st.linkedTaskId, { label: m.title, colour: '#F97316', kind: 'how-to', targetId: m.id, targetType: tType, targetSub: sub })
    for (const rt of m.requiredByTasks) pushLink(rt.taskId, { label: m.title, colour: '#F87171', kind: 'requires', targetId: m.id, targetType: tType, targetSub: sub })
  }
  const staffIdsBySection = new Map<string, string[]>()
  for (const ss of staffSections) {
    const arr = staffIdsBySection.get(ss.sectionId) ?? []
    arr.push(ss.staffId)
    staffIdsBySection.set(ss.sectionId, arr)
  }
  const fpBySection = new Map<string, { tables: number; chairs: number; equip: number }>()
  for (const fp of floorPlanElements) {
    const key = fp.sectionId!
    const cur = fpBySection.get(key) ?? { tables: 0, chairs: 0, equip: 0 }
    if (fp.type === 'TABLE') cur.tables++
    else if (fp.type === 'CHAIR') cur.chairs++
    cur.equip += fp._count.inventoryItems
    fpBySection.set(key, cur)
  }

  const storedBySection = new Map<string, { id: string; name: string; unit: string; storageNotes: string | null; totalQty: number; imageUrl: string | null }[]>()
  for (const inv of storedItems) {
    const arr = storedBySection.get(inv.storageSectionId!) ?? []
    arr.push({ id: inv.id, name: inv.name, unit: inv.unit, storageNotes: inv.storageNotes, totalQty: inv.totalQty, imageUrl: inv.imageUrl })
    storedBySection.set(inv.storageSectionId!, arr)
  }

  const staffName = new Map(staff.map((s) => [s.id, `${s.firstName} ${s.lastName}`]))

  const fmtStaff = (s: (typeof staff)[number]) => ({ id: s.id, name: `${s.firstName} ${s.lastName}`, role: s.role })
  const fmtTask = (t: (typeof tasks)[number]) => ({
    id: t.id,
    title: t.title,
    schedule: t.scheduleType,
    active: t.isActive,
    scope: t.assignedToStaffId ? 'PERSON' : t.sectionId ? 'SECTION' : t.departmentId ? 'DEPARTMENT' : 'VENUE',
    assignee: t.assignedToStaffId ? staffName.get(t.assignedToStaffId) ?? null : null,
    links: linksByTask.get(t.id) ?? [],
  })
  const fmtTraining = (t: (typeof training)[number]) => ({
    id: t.id,
    title: t.title,
    kind: t.isOnboarding ? 'ONBOARDING' : 'MODULE',
    signOff: t.requiresSignOff,
    linkedToTask: !!t.linkedTaskId,
  })

  const tree = venues.map((v) => {
    const vStaff = staff.filter((s) => s.venueId === v.id)
    const vTasks = tasks.filter((t) => t.venueId === v.id)
    const vTraining = training.filter((t) => t.venueId === v.id)

    const departments = v.departments.map((d) => {
      const deptSections = sections.filter((s) => s.departmentId === d.id)
      return {
        id: d.id,
        name: d.name,
        colour: d.colour,
        linkedDepartments: deptLinksByDept.get(d.id) ?? [],
        // Department-level lists exclude items pushed down into a section.
        staff: vStaff.filter((s) => s.departmentId === d.id).map(fmtStaff),
        tasks: vTasks.filter((t) => t.departmentId === d.id && !t.sectionId).map(fmtTask),
        training: vTraining.filter((t) => t.departmentId === d.id).map(fmtTraining),
          sections: deptSections.map((sec) => {
            const memberIds = new Set(staffIdsBySection.get(sec.id) ?? [])
            const fp = fpBySection.get(sec.id) ?? { tables: 0, chairs: 0, equip: 0 }
            return {
              id: sec.id,
              name: sec.name,
              colour: sec.colour,
              staff: vStaff.filter((s) => memberIds.has(s.id)).map(fmtStaff),
              tasks: vTasks.filter((t) => t.sectionId === sec.id).map(fmtTask),
              floorPlan: fp,
              inventoryItems: storedBySection.get(sec.id) ?? [],
            }
          }),
      }
    })

    return {
      id: v.id,
      name: v.name,
      totals: {
        departments: departments.length,
        staff: vStaff.length,
        tasks: vTasks.length,
        training: vTraining.length,
      },
      departments,
      venueWide: {
        staff: vStaff.filter((s) => !s.departmentId).map(fmtStaff),
        tasks: vTasks.filter((t) => !t.departmentId).map(fmtTask),
        training: vTraining.filter((t) => !t.departmentId).map(fmtTraining),
      },
    }
  })

  return NextResponse.json({ venues: tree })
}
