import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'ADMIN' && session.user.role !== 'MANAGER')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const existing = await prisma.timeClock.findUnique({ where: { id: params.id } })
  if (!existing || existing.deletedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const { clockIn, clockOut, note } = body

  const update: Record<string, unknown> = {}
  if (clockIn !== undefined) update.clockIn = new Date(clockIn)
  if (clockOut !== undefined) {
    update.clockOut = clockOut ? new Date(clockOut) : null
    update.isActive = !clockOut
  }
  if (note !== undefined) update.note = note?.trim() || null

  const tc = await prisma.timeClock.update({
    where: { id: params.id },
    data: update,
    include: { staff: { select: { firstName: true, lastName: true, department: { select: { name: true } } } } },
  })

  return NextResponse.json(tc)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'ADMIN' && session.user.role !== 'MANAGER')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const existing = await prisma.timeClock.findUnique({ where: { id: params.id } })
  if (!existing || existing.deletedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.timeClock.update({ where: { id: params.id }, data: { deletedAt: new Date() } })
  return NextResponse.json({ success: true })
}
