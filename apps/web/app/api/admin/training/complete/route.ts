import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

// Manager marks a person as trained on a module (sign-off).
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { moduleId, staffId, note } = body as {
    moduleId: string
    staffId: string
    note?: string
  }
  if (!moduleId || !staffId) {
    return NextResponse.json({ error: 'moduleId and staffId are required' }, { status: 400 })
  }

  if (session.user.role === 'MANAGER') {
    const staff = await prisma.staff.findUnique({ where: { id: staffId }, select: { venueId: true } })
    if (staff?.venueId !== session.user.venueId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const completion = await prisma.trainingCompletion.upsert({
    where: { moduleId_staffId: { moduleId, staffId } },
    update: {
      selfCompleted: false,
      signedOffById: session.user.id,
      note: note?.trim() || null,
      completedAt: new Date(),
    },
    create: {
      moduleId,
      staffId,
      selfCompleted: false,
      signedOffById: session.user.id,
      note: note?.trim() || null,
    },
  })

  return NextResponse.json(completion, { status: 201 })
}

// Revoke a completion (e.g. needs re-training).
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const moduleId = searchParams.get('moduleId')
  const staffId = searchParams.get('staffId')
  if (!moduleId || !staffId) {
    return NextResponse.json({ error: 'moduleId and staffId are required' }, { status: 400 })
  }

  await prisma.trainingCompletion.deleteMany({ where: { moduleId, staffId } })
  return NextResponse.json({ success: true })
}
