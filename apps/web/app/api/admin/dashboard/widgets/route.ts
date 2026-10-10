import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { getTodayDate } from '@/lib/utils'
import { trainingStatusForVenue } from '@/lib/training-status.server'

// Data for the draggable dashboard modules that the core /api/admin/dashboard
// payload doesn't carry: today's bookings/orders, upcoming events, open
// food-safety alerts, who is clocked in, and the training traffic lights.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const venueId =
    session.user.role === 'MANAGER'
      ? session.user.venueId
      : new URL(req.url).searchParams.get('venueId') || session.user.venueId

  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: { timezone: true },
  })
  if (!venue) return NextResponse.json({ error: 'Venue not found' }, { status: 404 })
  const today = getTodayDate(venue.timezone ?? 'Pacific/Auckland')

  const [bookings, bookingCount, orders, orderAgg, events, hsAlerts, clockedIn, training] = await Promise.all([
    prisma.booking.findMany({
      where: { venueId, deletedAt: null, date: today, status: { notIn: ['CANCELLED', 'NO_SHOW'] } },
      orderBy: { startTime: 'asc' },
      take: 5,
      select: { id: true, startTime: true, partySize: true, contactName: true, status: true },
    }),
    prisma.booking.count({
      where: { venueId, deletedAt: null, date: today, status: { notIn: ['CANCELLED', 'NO_SHOW'] } },
    }),
    prisma.wooOrder.findMany({
      where: { venueId, deletedAt: null, serviceDate: today },
      orderBy: { serviceTime: 'asc' },
      take: 5,
      select: { id: true, orderNumber: true, serviceTime: true, totalAmount: true, opStatus: true, customerName: true },
    }),
    prisma.wooOrder.aggregate({
      where: { venueId, deletedAt: null, serviceDate: today },
      _count: { _all: true },
      _sum: { totalAmount: true },
    }),
    prisma.event.findMany({
      where: {
        venueId,
        deletedAt: null,
        eventDate: { gte: today },
        status: { in: ['ENQUIRY', 'DRAFT', 'TENTATIVE', 'CONFIRMED', 'IN_PROGRESS'] },
      },
      orderBy: { eventDate: 'asc' },
      take: 5,
      select: { id: true, name: true, eventDate: true, guestCount: true, status: true },
    }),
    prisma.hsAlert.count({ where: { venueId, deletedAt: null, status: 'OPEN' } }),
    prisma.timeClock.count({ where: { venueId, deletedAt: null, clockOut: null } }),
    trainingStatusForVenue(venueId),
  ])

  return NextResponse.json({
    date: today.toISOString().slice(0, 10),
    bookings: { count: bookingCount, next: bookings },
    orders: { count: orderAgg._count._all, total: orderAgg._sum.totalAmount ?? 0, next: orders },
    events,
    hsAlertsOpen: hsAlerts,
    clockedIn,
    training: training ? { summary: training.summary, onShiftActionNeeded: training.staff.filter((s) => s.onShift && s.level !== 'GREEN').length } : null,
  })
}
