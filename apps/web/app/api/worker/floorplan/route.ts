import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'

export async function GET(req: NextRequest) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const viewSlug = searchParams.get('view')

  const where: Record<string, unknown> = {
    venueId: session.venueId,
    deletedAt: null,
    isActive: true,
  }

  // If no explicit view requested, check for today's events with a linked floor plan
  let eventBanner: { eventName: string; planName: string } | null = null
  if (!viewSlug) {
    const venue = await prisma.venue.findUnique({
      where: { id: session.venueId },
      select: { timezone: true },
    })
    const tz = venue?.timezone ?? 'Pacific/Auckland'
    const now = new Date()
    const todayStart = new Date(now.toLocaleString('en-US', { timeZone: tz }))
    todayStart.setHours(0, 0, 0, 0)
    const todayEnd = new Date(todayStart)
    todayEnd.setHours(23, 59, 59, 999)

    const eventPlan = await prisma.calendarEvent.findFirst({
      where: {
        venueId: session.venueId,
        deletedAt: null,
        floorPlanSlug: { not: null },
        startsAt: { lte: todayEnd },
        endsAt: { gte: todayStart },
      },
      select: { floorPlanSlug: true, floorPlanName: true, title: true },
      orderBy: { startsAt: 'desc' },
    })

    if (eventPlan?.floorPlanSlug) {
      where.slug = eventPlan.floorPlanSlug
      eventBanner = {
        eventName: eventPlan.title,
        planName: eventPlan.floorPlanName ?? eventPlan.floorPlanSlug,
      }
    } else {
      where.isDefault = true
    }
  } else {
    where.slug = viewSlug
  }

  const plan = await prisma.floorPlan.findFirst({
    where,
    include: {
      elements: {
        where: { deletedAt: null, isActive: true },
        orderBy: [{ zIndex: 'asc' }, { sortOrder: 'asc' }],
        include: {
          section: { select: { id: true, name: true, colour: true } },
        },
      },
    },
  })

  if (!plan) return NextResponse.json({ plan: null, elements: [] })

  const result: Record<string, unknown> = { ...plan }
  if (eventBanner) result.eventBanner = eventBanner

  return NextResponse.json(result)
}
