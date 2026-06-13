import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

// Individually assign a module to a person (upskill / area to work on).
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { moduleId, staffId, reason } = body as {
    moduleId: string
    staffId: string
    reason?: string
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

  const assignment = await prisma.trainingAssignment.upsert({
    where: { moduleId_staffId: { moduleId, staffId } },
    update: { reason: reason?.trim() || null, deletedAt: null, assignedById: session.user.id },
    create: {
      moduleId,
      staffId,
      reason: reason?.trim() || null,
      assignedById: session.user.id,
    },
  })

  return NextResponse.json(assignment, { status: 201 })
}

// Remove an individual assignment.
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const moduleId = searchParams.get('moduleId')
  const staffId = searchParams.get('staffId')
  if (!moduleId || !staffId) {
    return NextResponse.json({ error: 'moduleId and staffId are required' }, { status: 400 })
  }

  await prisma.trainingAssignment.deleteMany({ where: { moduleId, staffId } })
  return NextResponse.json({ success: true })
}
