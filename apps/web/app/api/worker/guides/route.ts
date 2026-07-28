import { NextRequest, NextResponse } from 'next/server'
import { getWorkerSession } from '@/lib/worker-session'
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

  const staff = await prisma.staff.findUnique({
    where: { id: session.staffId },
    select: { departmentId: true, venueId: true },
  })
  if (!staff) return NextResponse.json({ error: 'Staff not found' }, { status: 404 })

  const guides = await prisma.guide.findMany({
    where: {
      venueId: staff.venueId,
      status: 'PUBLISHED',
      isTracked: true,
      deletedAt: null,
      OR: [
        { isOnboarding: true },
        ...(staff.departmentId ? [{ departmentId: staff.departmentId }] : []),
      ],
    },
    include: {
      steps: { orderBy: { order: 'asc' } },
      department: { select: { id: true, name: true } },
    },
    orderBy: [{ isOnboarding: 'desc' }, { title: 'asc' }],
  })

  // Check completion status per guide
  const guideIds = guides.map((g) => g.id)
  const completions = guideIds.length > 0
    ? await prisma.guideCompletion.findMany({
        where: { guideId: { in: guideIds }, staffId: session.staffId },
        select: { guideId: true },
      })
    : []

  const completedSet = new Set(completions.map((c) => c.guideId))

  const items = guides.map((g) => ({
    id: g.id,
    title: g.title,
    description: g.description,
    category: g.category,
    requiresSignOff: g.requiresSignOff,
    isOnboarding: g.isOnboarding,
    source: g.isOnboarding ? 'ONBOARDING' : 'DEPARTMENT',
    completed: completedSet.has(g.id),
    department: g.department,
    steps: g.steps.map((s) => ({
      id: s.id,
      order: s.order,
      heading: s.heading,
      content: s.content,
      imageUrl: s.imageUrl,
      videoUrl: s.videoUrl,
    })),
  }))

  return NextResponse.json({ firstName: session.firstName, items })
}
