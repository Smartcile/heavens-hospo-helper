import { NextRequest, NextResponse } from 'next/server'
import { getWorkerSession } from '@/lib/worker-session'
import { resolveStaffGuides } from '@/lib/guides'
import { prisma } from '@hospo-ops/db'

export async function GET(req: NextRequest) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Manager/admin editing tasks — return all published guides for the venue.
  if (req.nextUrl.searchParams.get('edit') === '1') {
    if (session.role !== 'ADMIN' && session.role !== 'MANAGER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const guides = await prisma.guide.findMany({
      where: { venueId: session.venueId, deletedAt: null },
      select: { id: true, title: true, venueId: true, isTracked: true, description: true },
      orderBy: { title: 'asc' },
    })
    return NextResponse.json(guides)
  }

  const resolved = await resolveStaffGuides(session.staffId, { includeSteps: true })
  if (!resolved) return NextResponse.json({ error: 'Staff not found' }, { status: 404 })

  const items = resolved.items.map((g) => ({
    id: g.id,
    title: g.title,
    description: g.description,
    category: g.category,
    requiresSignOff: g.requiresSignOff,
    isOnboarding: g.isOnboarding,
    source: g.source,
    completed: g.completed,
    department: g.department,
    steps: g.steps,
  }))

  return NextResponse.json({ firstName: session.firstName, items })
}
