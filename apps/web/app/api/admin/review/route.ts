import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

// End-of-day review summary: for a venue + date, each staff member's completed
// task work that day plus any manager notes.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const dateStr = searchParams.get('date')
  const venueId = searchParams.get('venueId')
  if (!dateStr) return NextResponse.json({ error: 'date is required' }, { status: 400 })
  const date = new Date(dateStr)

  const staffVenueFilter =
    session.user.role === 'MANAGER' ? session.user.venueId : venueId || undefined

  const staff = await prisma.staff.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      ...(staffVenueFilter ? { venueId: staffVenueFilter } : {}),
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      role: true,
      department: { select: { name: true } },
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  })
  const staffIds = staff.map((s) => s.id)

  const [completions, notes] = await Promise.all([
    prisma.taskCompletion.findMany({
      where: { staffId: { in: staffIds }, scheduledDate: date },
      select: {
        staffId: true,
        completedAt: true,
        note: true,
        task: { select: { title: true } },
      },
      orderBy: { completedAt: 'asc' },
    }),
    prisma.shiftNote.findMany({
      where: {
        staffId: { in: staffIds },
        shiftDate: date,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  // Resolve author names + linked module titles for notes.
  const authorIds = [...new Set(notes.map((n) => n.authorId).filter(Boolean))] as string[]
  const moduleIds = [...new Set(notes.map((n) => n.linkedModuleId).filter(Boolean))] as string[]
  const [authors, modules] = await Promise.all([
    authorIds.length
      ? prisma.staff.findMany({ where: { id: { in: authorIds } }, select: { id: true, firstName: true, lastName: true } })
      : Promise.resolve([]),
    moduleIds.length
      ? prisma.trainingModule.findMany({ where: { id: { in: moduleIds } }, select: { id: true, title: true } })
      : Promise.resolve([]),
  ])
  const authorName = new Map(authors.map((a) => [a.id, `${a.firstName} ${a.lastName}`]))
  const moduleTitle = new Map(modules.map((m) => [m.id, m.title]))

  const byStaff = staff.map((s) => ({
    id: s.id,
    name: `${s.firstName} ${s.lastName}`,
    role: s.role,
    departmentName: s.department?.name ?? null,
    completed: completions
      .filter((c) => c.staffId === s.id)
      .map((c) => ({ taskTitle: c.task.title, completedAt: c.completedAt, note: c.note })),
    notes: notes
      .filter((n) => n.staffId === s.id)
      .map((n) => ({
        id: n.id,
        category: n.category,
        content: n.content,
        resolved: !!n.resolvedAt,
        authorName: n.authorId ? authorName.get(n.authorId) ?? null : null,
        linkedModuleTitle: n.linkedModuleId ? moduleTitle.get(n.linkedModuleId) ?? null : null,
        createdAt: n.createdAt,
      })),
  }))

  return NextResponse.json({ date: dateStr, staff: byStaff })
}
