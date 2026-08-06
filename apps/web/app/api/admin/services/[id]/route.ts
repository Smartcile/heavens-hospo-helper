import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

interface Params { params: { id: string } }

/** Shared guard: the service must exist, be live, and be in the caller's venue. */
async function loadScoped(id: string, role: string, sessionVenueId: string) {
  const service = await prisma.service.findUnique({
    where: { id },
    select: { id: true, venueId: true, deletedAt: true },
  })
  if (!service || service.deletedAt) return { error: 'Not found', status: 404 as const }
  if (role === 'MANAGER' && service.venueId !== sessionVenueId) {
    return { error: 'Forbidden', status: 403 as const }
  }
  return { service }
}

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const scoped = await loadScoped(params.id, session.user.role, session.user.venueId)
  if ('error' in scoped) return NextResponse.json({ error: scoped.error }, { status: scoped.status })

  const service = await prisma.service.findUnique({
    where: { id: params.id },
    include: {
      slots: { orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] },
      exceptions: { orderBy: { date: 'asc' } },
      _count: { select: { orders: true } },
    },
  })

  return NextResponse.json(service)
}

interface SlotInput { dayOfWeek: number; startTime: string; endTime: string; maxCovers: number }
interface ExceptionInput { date: string; closed: boolean; startTime: string | null; endTime: string | null; maxCovers: number | null }

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

function isValidSlots(slots: SlotInput[]): string | null {
  if (slots.some((s) => !HHMM.test(s.startTime) || !HHMM.test(s.endTime))) {
    return 'Slot times must be HH:mm'
  }
  if (slots.some((s) => s.startTime >= s.endTime)) {
    return 'Slot start must be before its end'
  }
  if (slots.some((s) => s.dayOfWeek < 0 || s.dayOfWeek > 6 || s.maxCovers < 1)) {
    return 'Slot day or max covers is invalid'
  }
  const seen = new Set(slots.map((s) => `${s.dayOfWeek}|${s.startTime}`))
  if (seen.size !== slots.length) return 'Duplicate slot times on the same day'
  return null
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const scoped = await loadScoped(params.id, session.user.role, session.user.venueId)
  if ('error' in scoped) return NextResponse.json({ error: scoped.error }, { status: scoped.status })

  const body = await req.json()

  const name = body.name !== undefined ? String(body.name).trim() : undefined
  if (name === '') return NextResponse.json({ error: 'Service name is required' }, { status: 400 })

  const slots: SlotInput[] = Array.isArray(body.slots) ? body.slots : []
  const slotError = isValidSlots(slots)
  if (slotError) return NextResponse.json({ error: slotError }, { status: 400 })

  const exceptions: ExceptionInput[] = Array.isArray(body.exceptions) ? body.exceptions : []
  const exDates = exceptions.map((e) => e.date)
  if (new Set(exDates).size !== exDates.length) {
    return NextResponse.json({ error: 'Duplicate exception dates' }, { status: 400 })
  }

  // Slots and exceptions are replaced wholesale — nothing hangs off them.
  const service = await prisma.$transaction(async (tx) => {
    const updated = await tx.service.update({
      where: { id: params.id },
      data: {
        name: name ?? undefined,
        description: body.description !== undefined ? body.description || null : undefined,
        wooCategoryId: body.wooCategoryId !== undefined ? body.wooCategoryId || null : undefined,
        wooCategoryName: body.wooCategoryName !== undefined ? body.wooCategoryName || null : undefined,
        requiresBooking: body.requiresBooking !== undefined ? !!body.requiresBooking : undefined,
        isActive: body.isActive !== undefined ? !!body.isActive : undefined,
        sortOrder: body.sortOrder !== undefined ? Number(body.sortOrder) || 0 : undefined,
      },
    })

    await tx.serviceSlot.deleteMany({ where: { serviceId: params.id } })
    if (slots.length > 0) {
      await tx.serviceSlot.createMany({
        data: slots.map((s) => ({ serviceId: params.id, ...s })),
      })
    }

    await tx.serviceException.deleteMany({ where: { serviceId: params.id } })
    if (exceptions.length > 0) {
      await tx.serviceException.createMany({
        data: exceptions.map((e) => ({
          serviceId: params.id,
          date: new Date(e.date + 'T00:00:00.000Z'),
          closed: e.closed,
          startTime: e.closed ? null : e.startTime,
          endTime: e.closed ? null : e.endTime,
          maxCovers: e.closed ? null : e.maxCovers,
        })),
      })
    }

    return updated
  })

  return NextResponse.json(service)
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const scoped = await loadScoped(params.id, session.user.role, session.user.venueId)
  if ('error' in scoped) return NextResponse.json({ error: scoped.error }, { status: scoped.status })

  await prisma.$transaction([
    prisma.serviceSlot.deleteMany({ where: { serviceId: params.id } }),
    prisma.serviceException.deleteMany({ where: { serviceId: params.id } }),
    prisma.service.update({
      where: { id: params.id },
      data: { deletedAt: new Date(), isActive: false },
    }),
  ])

  return NextResponse.json({ success: true })
}
