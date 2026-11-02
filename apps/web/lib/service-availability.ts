import { prisma } from '@hospo-ops/db'
import { computeCoverTotals, slotsForDate, type ServiceScheduleInput } from './service-schedule'

/**
 * Server half of the availability math: loads the venue's active services,
 * the day's orders and bookings, and resolves cover totals per service.
 * Pure date→slot/cover logic lives in `service-schedule.ts`.
 */
export async function availabilityForDate(venueId: string, dateKey: string, partySize: number) {
  const services = await prisma.service.findMany({
    where: { venueId, isActive: true, deletedAt: null },
    include: { slots: true, exceptions: true },
    orderBy: { sortOrder: 'asc' },
  })

  const date = new Date(dateKey + 'T00:00:00.000Z')
  const [orders, bookings] = await Promise.all([
    prisma.wooOrder.findMany({
      where: {
        venueId,
        serviceDate: date,
        serviceId: { not: null },
        serviceTime: { not: null },
        deletedAt: null,
        status: { not: 'CANCELLED' },
      },
      select: { serviceId: true, serviceTime: true, partySize: true },
    }),
    prisma.booking.findMany({
      where: {
        venueId,
        date,
        deletedAt: null,
        status: { notIn: ['CANCELLED', 'NO_SHOW'] },
      },
      select: { startTime: true, partySize: true },
    }),
  ])

  return services.map((svc) => {
    const input: ServiceScheduleInput = {
      slots: svc.slots.map((s) => ({
        dayOfWeek: s.dayOfWeek,
        startTime: s.startTime,
        endTime: s.endTime,
        maxCovers: s.maxCovers,
      })),
      exceptions: svc.exceptions.map((e) => ({
        date: e.date.toISOString().slice(0, 10),
        closed: e.closed,
        startTime: e.startTime,
        endTime: e.endTime,
        maxCovers: e.maxCovers,
      })),
    }
    const resolved = slotsForDate(input, dateKey)
    const totals = computeCoverTotals(
      resolved.slots,
      partySize,
      orders
        .filter((o) => o.serviceId === svc.id)
        .map((o) => ({ serviceTime: o.serviceTime as string, partySize: o.partySize ?? 1 })),
      bookings.map((b) => ({ startTime: b.startTime, partySize: b.partySize })),
    )
    return { service: svc, resolved, totals }
  })
}
