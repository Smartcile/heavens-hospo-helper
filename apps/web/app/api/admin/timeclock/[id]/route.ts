import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'

async function requireManager(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return null
  const denied = await guardAccess(session, req, 'team.clocks.manual')
  if (denied) return null
  return session
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireManager(req)
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const existing = await prisma.timeClock.findUnique({ where: { id: params.id } })
  if (!existing || existing.deletedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const { clockIn, clockOut, note, breaksMinutes } = body

  const update: Record<string, unknown> = {}
  const edits: { field: string; oldValue: string; newValue: string }[] = []

  if (clockIn !== undefined) {
    const next = new Date(clockIn)
    if (next.getTime() !== existing.clockIn.getTime()) {
      edits.push({ field: 'clockIn', oldValue: existing.clockIn.toISOString(), newValue: next.toISOString() })
      update.clockIn = next
    }
  }
  if (clockOut !== undefined) {
    const next = clockOut ? new Date(clockOut) : null
    const prev = existing.clockOut ? existing.clockOut.toISOString() : ''
    const nextVal = next ? next.toISOString() : ''
    if (nextVal !== prev) {
      edits.push({ field: 'clockOut', oldValue: prev, newValue: nextVal })
      update.clockOut = next
      update.isActive = !clockOut
    }
  }
  if (breaksMinutes !== undefined) {
    const next = Math.max(0, Math.round(Number(breaksMinutes) || 0))
    if (next !== existing.breaksMinutes) {
      edits.push({ field: 'breaksMinutes', oldValue: String(existing.breaksMinutes), newValue: String(next) })
      update.breaksMinutes = next
    }
  }
  if (note !== undefined) {
    const next = note?.trim() || null
    if (next !== existing.note) {
      edits.push({ field: 'note', oldValue: existing.note ?? '', newValue: next ?? '' })
      update.note = next
    }
  }

  await prisma.$transaction([
    prisma.timeClock.update({ where: { id: params.id }, data: update }),
    ...edits.map((e) =>
      prisma.timeClockEdit.create({
        data: { timeClockId: params.id, editedById: session.user.id, ...e },
      })
    ),
  ])

  const tc = await prisma.timeClock.findUnique({
    where: { id: params.id },
    include: {
      staff: {
        select: {
          firstName: true,
          lastName: true,
          department: { select: { name: true } },
          positions: { select: { position: { select: { name: true, colour: true } } } },
        },
      },
    },
  })

  return NextResponse.json(tc)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireManager(_req)
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const existing = await prisma.timeClock.findUnique({ where: { id: params.id } })
  if (!existing || existing.deletedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.timeClock.update({ where: { id: params.id }, data: { deletedAt: new Date() } })
  return NextResponse.json({ success: true })
}
