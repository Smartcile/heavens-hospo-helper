import { NextResponse } from 'next/server'
import { getWorkerSession } from '@/lib/worker-session'
import { resolvePathwayForStaff } from '@/lib/pathway-for-staff'
import { prisma } from '@hospo-ops/db'

// The staff member's own progression tree. Picks the most specific published
// pathway that targets them: position → section → department → venue-wide.
export async function GET() {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const staff = await prisma.staff.findUnique({
    where: { id: session.staffId },
    select: {
      venueId: true,
      departmentId: true,
      sections: { select: { sectionId: true } },
      positions: { select: { positionId: true } },
    },
  })
  if (!staff) return NextResponse.json({ error: 'Staff not found' }, { status: 404 })

  const sectionIds = staff.sections.map((s) => s.sectionId)
  const positionIds = staff.positions.map((p) => p.positionId)

  const candidates = await prisma.pathway.findMany({
    where: {
      venueId: staff.venueId,
      status: 'PUBLISHED',
      deletedAt: null,
      OR: [
        ...(positionIds.length ? [{ positionId: { in: positionIds } }] : []),
        ...(sectionIds.length ? [{ sectionId: { in: sectionIds } }] : []),
        ...(staff.departmentId ? [{ departmentId: staff.departmentId }] : []),
        { departmentId: null, sectionId: null, positionId: null },
      ],
    },
    select: { id: true, positionId: true, sectionId: true, departmentId: true },
  })

  if (candidates.length === 0) return NextResponse.json({ pathway: null })

  // Most specific wins — a bartender's own pathway beats the venue-wide default.
  const rank = (p: (typeof candidates)[number]) =>
    p.positionId ? 3 : p.sectionId ? 2 : p.departmentId ? 1 : 0
  const best = candidates.reduce((a, b) => (rank(b) > rank(a) ? b : a))

  const view = await resolvePathwayForStaff(best.id, session.staffId)
  return NextResponse.json({ pathway: view, firstName: session.firstName })
}
