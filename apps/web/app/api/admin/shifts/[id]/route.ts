import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { isValidTime } from '@/lib/calendar'

interface Params {
  params: { id: string }
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const existing = await prisma.shift.findUnique({ where: { id: params.id } })
  if (!existing || existing.deletedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.user.role === 'MANAGER' && existing.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const updates: Record<string, unknown> = {}
  if (body.startTime !== undefined) {
    if (!isValidTime(body.startTime)) return NextResponse.json({ error: 'startTime must be HH:mm' }, { status: 400 })
    updates.startTime = body.startTime
  }
  if (body.endTime !== undefined) {
    if (!isValidTime(body.endTime)) return NextResponse.json({ error: 'endTime must be HH:mm' }, { status: 400 })
    updates.endTime = body.endTime
  }
  if (body.date !== undefined) updates.date = new Date(body.date)
  if (body.departmentId !== undefined) updates.departmentId = body.departmentId || null
  if (body.note !== undefined) updates.note = body.note?.trim() || null

  const shift = await prisma.shift.update({ where: { id: params.id }, data: updates })
  return NextResponse.json(shift)
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await prisma.shift.update({ where: { id: params.id }, data: { deletedAt: new Date() } })
  return NextResponse.json({ success: true })
}
