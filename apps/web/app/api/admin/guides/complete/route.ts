import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { guideId, staffId } = body as { guideId: string; staffId: string }
  if (!guideId || !staffId) {
    return NextResponse.json({ error: 'guideId and staffId required' }, { status: 400 })
  }

  const staff = await prisma.staff.findUnique({
    where: { id: staffId },
    select: { venueId: true },
  })
  if (!staff) return NextResponse.json({ error: 'Staff not found' }, { status: 404 })
  if (session.user.role === 'MANAGER' && staff.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const completion = await prisma.guideCompletion.upsert({
    where: { guideId_staffId: { guideId, staffId } },
    update: { selfCompleted: false, signedOffById: session.user.id, completedAt: new Date() },
    create: {
      guideId,
      staffId,
      selfCompleted: false,
      signedOffById: session.user.id,
    },
  })

  return NextResponse.json(completion, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const guideId = searchParams.get('guideId')
  const staffId = searchParams.get('staffId')
  if (!guideId || !staffId) {
    return NextResponse.json({ error: 'guideId and staffId required' }, { status: 400 })
  }

  const staff = await prisma.staff.findUnique({
    where: { id: staffId },
    select: { venueId: true },
  })
  if (!staff) return NextResponse.json({ error: 'Staff not found' }, { status: 404 })
  if (session.user.role === 'MANAGER' && staff.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.guideCompletion.deleteMany({
    where: { guideId, staffId },
  })

  return NextResponse.json({ success: true })
}
