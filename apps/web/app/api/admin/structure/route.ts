import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'

// GET /api/admin/structure
// Returns the LIVE entity tree (venue → department → staff / tasks / training,
// plus venue-wide items) so the admin Structure page can render how everything
// is currently linked. Manager sees their own venue; admin sees all.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'execution.tasks.view')
  if (denied) return denied

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
    prisma.guide.findMany({
      where: { deletedAt: null, venueId: { in: venueIds } },
      select: {
        id: true, title: true, venueId: true, departmentId: true,
        isOnboarding: true, requiresSignOff: true, status: true,
        audiences: { select: { kind: true, targetId: true } },
      },
      orderBy: { title: 'asc' },
    }),
  ])

  const [sections, staffSections, floorPlanElements, deptLinks, storedItems] = await Promise.all([
    prisma.section.findMany({
      where: { deletedAt: null, venueId: { in: venueIds } },
      select: { id: true, name: true, colour: true, departmentId: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
    // Both of these previously had no venue scoping and scanned every row in the
    // database — staffSection had no `where` at all.
    prisma.staffSection.findMany({
      where: { staff: { venueId: { in: venueIds } } },
      select: { staffId: true, sectionId: true },
    }),
    prisma.floorPlanElement.findMany({
      where: {
        deletedAt: null,
        sectionId: { not: null },
        floorPlan: { deletedAt: null, venueId: { in: venueIds } },
      },
      select: { id: true, type: true, sectionId: true, label: true, _count: { select: { inventoryItems: true } } },
    }),
    prisma.departmentLink.findMany({
      where: { fromDepartment: { venueId: { in: venueIds } } },
      select: { fromDepartmentId: true, toDepartment: { select: { id: true, name: true, colour: true } } },
    }),
    prisma.inventoryItem.findMany({
      where: { deletedAt: null, venueId: { in: venueIds }, storageSectionId: { not: null } },
      select: { id: true, name: true, unit: true, storageSectionId: true, storageNotes: true, totalQty: true, imageUrls: true },
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
    prisma.guide.findMany({
      where: { deletedAt: null, venueId: { in: venueIds } },
      select: {
        id: true, title: true, status: true, isTracked: true,
        taskGuides: { select: { taskId: true, isRequiredForCompetency: true } },
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
  for (const g of linkTraining) {
    const sub = `${g.status} · ${g._count.steps} STEP${g._count.steps !== 1 ? 'S' : ''}`
    const tType = g.isTracked ? 'GUIDE' : 'REFERENCE'
    for (const tg of g.taskGuides) {
      pushLink(tg.taskId, tg.isRequiredForCompetency
        ? { label: g.title, colour: '#F87171', kind: 'requires', targetId: g.id, targetType: tType, targetSub: sub }
        : { label: g.title, colour: '#F97316', kind: 'how-to', targetId: g.id, targetType: tType, targetSub: sub })
    }
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

  const storedBySection = new Map<string, { id: string; name: string; unit: string; storageNotes: string | null; totalQty: number; imageUrls: string[] | null }[]>()
  for (const inv of storedItems) {
    const arr = storedBySection.get(inv.storageSectionId!) ?? []
    arr.push({ id: inv.id, name: inv.name, unit: inv.unit, storageNotes: inv.storageNotes, totalQty: inv.totalQty, imageUrls: inv.imageUrls as string[] | null })
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
  const guideTaskCount = new Map(linkTraining.map((g) => [g.id, g.taskGuides.length]))
  const fmtTraining = (t: (typeof training)[number]) => ({
    id: t.id,
    title: t.title,
    kind: t.isOnboarding ? 'ONBOARDING' : t.status,
    signOff: t.requiresSignOff,
    linkedToTask: (guideTaskCount.get(t.id) ?? 0) > 0,
  })

  // Pre-group by venue once. These were previously re-filtered inside the
  // per-department and per-section callbacks, making the whole assembly
  // O(venues × departments × tasks).
  const groupBy = <T,>(rows: T[], key: (row: T) => string) => {
    const map = new Map<string, T[]>()
    for (const row of rows) {
      const k = key(row)
      const arr = map.get(k)
      if (arr) arr.push(row)
      else map.set(k, [row])
    }
    return map
  }
  const staffByVenue = groupBy(staff, (s) => s.venueId)
  const tasksByVenue = groupBy(tasks, (t) => t.venueId)
  const guidesByVenue = groupBy(training, (t) => t.venueId)
  const sectionsByDept = groupBy(sections, (s) => s.departmentId)

  // A guide reaches a department or section through the legacy column or any
  // matching audience row.
  const guideInDept = (g: (typeof training)[number], deptId: string) =>
    g.departmentId === deptId ||
    g.audiences.some((a) => a.kind === 'DEPARTMENT' && a.targetId === deptId)
  const guideInSection = (g: (typeof training)[number], sectionId: string) =>
    g.audiences.some((a) => a.kind === 'SECTION' && a.targetId === sectionId)

  const tree = venues.map((v) => {
    const vStaff = staffByVenue.get(v.id) ?? []
    const vTasks = tasksByVenue.get(v.id) ?? []
    const vTraining = guidesByVenue.get(v.id) ?? []

    const staffByDept = groupBy(vStaff, (s) => s.departmentId ?? '')
    const tasksByDept = groupBy(vTasks, (t) => t.departmentId ?? '')
    const tasksBySection = groupBy(vTasks, (t) => t.sectionId ?? '')

    const departments = v.departments.map((d) => {
      const deptSections = sectionsByDept.get(d.id) ?? []
      return {
        id: d.id,
        name: d.name,
        colour: d.colour,
        linkedDepartments: deptLinksByDept.get(d.id) ?? [],
        // Department-level lists exclude items pushed down into a section.
        staff: (staffByDept.get(d.id) ?? []).map(fmtStaff),
        tasks: (tasksByDept.get(d.id) ?? []).filter((t) => !t.sectionId).map(fmtTask),
        training: vTraining.filter((t) => guideInDept(t, d.id)).map(fmtTraining),
          sections: deptSections.map((sec) => {
            const memberIds = new Set(staffIdsBySection.get(sec.id) ?? [])
            const fp = fpBySection.get(sec.id) ?? { tables: 0, chairs: 0, equip: 0 }
            return {
              id: sec.id,
              name: sec.name,
              colour: sec.colour,
              staff: vStaff.filter((s) => memberIds.has(s.id)).map(fmtStaff),
              tasks: (tasksBySection.get(sec.id) ?? []).map(fmtTask),
              training: vTraining.filter((t) => guideInSection(t, sec.id)).map(fmtTraining),
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
        staff: (staffByDept.get('') ?? []).map(fmtStaff),
        tasks: (tasksByDept.get('') ?? []).map(fmtTask),
        training: vTraining
          .filter((t) => !t.departmentId && t.audiences.length === 0)
          .map(fmtTraining),
      },
    }
  })

  return NextResponse.json({ venues: tree })
}
