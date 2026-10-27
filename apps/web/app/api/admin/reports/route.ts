import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { canAccess } from '@/lib/permissions'
import { completionReportWheres } from '@/lib/report-filters'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const ok =
    (await canAccess(session, req, 'performance.reports.view')) ||
    (await canAccess(session, req, 'performance.reports.export'))
  if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const venueId = searchParams.get('venueId')
  const departmentId = searchParams.get('departmentId')
  const staffId = searchParams.get('staffId')
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const page = Number(searchParams.get('page') ?? 1)
  const limit = Number(searchParams.get('limit') ?? 50)
  const exportCsv = searchParams.get('export') === 'csv'

  const { all: where, done: doneWhere } = completionReportWheres({
    venueId,
    departmentId,
    staffId,
    from,
    to,
    managerVenueId: session.user.role === 'MANAGER' ? session.user.venueId : null,
  })

  if (exportCsv) {
    const all = await prisma.taskCompletion.findMany({
      where,
      include: {
        task: {
          include: {
            venue: { select: { name: true } },
            department: { select: { name: true } },
          },
        },
        staff: { select: { firstName: true, lastName: true } },
      },
      orderBy: { completedAt: 'desc' },
    })

    const rows = [
      ['Date', 'Staff', 'Task', 'Venue', 'Department', 'Completed At', 'Outcome', 'Note'].join(','),
      ...all.map((c) =>
        [
          c.scheduledDate.toISOString().slice(0, 10),
          `"${c.staff.firstName} ${c.staff.lastName}"`,
          `"${c.task.title}"`,
          `"${c.task.venue.name}"`,
          `"${c.task.department?.name ?? ''}"`,
          c.completedAt.toISOString(),
          c.outcome,
          `"${c.note?.replace(/"/g, '""') ?? ''}"`,
        ].join(',')
      ),
    ].join('\n')

    return new NextResponse(rows, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="hospo-ops-audit-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    })
  }

  // `total` is the DONE-only completion metric (matching the dashboard); the
  // record list/pagination still shows every outcome for audit.
  const [total, recordsTotal, completions] = await Promise.all([
    prisma.taskCompletion.count({ where: doneWhere }),
    prisma.taskCompletion.count({ where }),
    prisma.taskCompletion.findMany({
      where,
      include: {
        task: {
          include: {
            venue: { select: { id: true, name: true } },
            department: { select: { id: true, name: true, colour: true } },
          },
        },
        staff: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { completedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ])

  return NextResponse.json({
    total,
    recordsTotal,
    page,
    limit,
    pages: Math.ceil(recordsTotal / limit),
    completions,
  })
}
