import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

interface Params {
  params: { id: string }
}

// Approve or decline a time-off request.
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const existing = await prisma.timeOffRequest.findUnique({ where: { id: params.id } })
  if (!existing || existing.deletedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.user.role === 'MANAGER' && existing.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { status, reviewNote } = body as { status: 'APPROVED' | 'DECLINED' | 'PENDING'; reviewNote?: string }
  if (!status || !['APPROVED', 'DECLINED', 'PENDING'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const request = await prisma.timeOffRequest.update({
    where: { id: params.id },
    data: {
      status,
      reviewNote: reviewNote?.trim() || null,
      reviewedById: session.user.id,
      reviewedAt: new Date(),
    },
  })

  return NextResponse.json(request)
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await prisma.timeOffRequest.update({ where: { id: params.id }, data: { deletedAt: new Date() } })
  return NextResponse.json({ success: true })
}
