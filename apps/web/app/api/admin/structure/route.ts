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

  const [sections, staffSections, floorPlanElements] = await Promise.all([
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
  ])
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

  const staffName = new Map(staff.map((s) => [s.id, `${s.firstName} ${s.lastName}`]))

  const fmtStaff = (s: (typeof staff)[number]) => ({ id: s.id, name: `${s.firstName} ${s.lastName}`, role: s.role })
  const fmtTask = (t: (typeof tasks)[number]) => ({
    id: t.id,
    title: t.title,
    schedule: t.scheduleType,
    active: t.isActive,
    scope: t.assignedToStaffId ? 'PERSON' : t.sectionId ? 'SECTION' : t.departmentId ? 'DEPARTMENT' : 'VENUE',
    assignee: t.assignedToStaffId ? staffName.get(t.assignedToStaffId) ?? null : null,
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
