import { NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'

/**
 * Picker options for the worker quick-task form. Quick tasks are deliberately
 * grant-free (floor staff can always raise one), so this read cannot reuse the
 * authoring-gated `/api/worker/{departments,sections,tasks/assignees}` routes.
 * It only exposes its own venue's active staff + departments/sections.
 */
export async function GET() {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [departments, sections, staff] = await Promise.all([
    prisma.department.findMany({
      where: { venueId: session.venueId, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.section.findMany({
      where: { venueId: session.venueId, deletedAt: null },
      select: { id: true, name: true, departmentId: true },
      orderBy: { name: 'asc' },
    }),
    prisma.staff.findMany({
      where: { venueId: session.venueId, deletedAt: null, isActive: true },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    }),
  ])

  return NextResponse.json({
    departments,
    sections,
    assignees: staff.map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}`.trim() })),
  })
}
