import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

interface Params {
  params: { id: string }
}

interface IncomingStep {
  title?: string | null
  content: string
  imageUrl?: string | null
  videoUrl?: string | null
  linkedTaskId?: string | null
}

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const trainingModule = await prisma.trainingModule.findUnique({
    where: { id: params.id },
    include: {
      steps: { orderBy: { order: 'asc' } },
      department: { select: { id: true, name: true } },
      linkedTask: { select: { id: true, title: true } },
    },
  })
  if (!trainingModule || trainingModule.deletedAt) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json(trainingModule)
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const existing = await prisma.trainingModule.findUnique({ where: { id: params.id } })
  if (!existing || existing.deletedAt) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (session.user.role === 'MANAGER' && existing.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const updates: Record<string, unknown> = {}
  if (body.title !== undefined) updates.title = String(body.title).toUpperCase().trim()
  if (body.description !== undefined) updates.description = body.description?.trim() || null
  if (body.category !== undefined)
    updates.category = body.category ? String(body.category).toUpperCase().trim() : null
  if (body.departmentId !== undefined) updates.departmentId = body.departmentId || null
  if (body.linkedTaskId !== undefined) updates.linkedTaskId = body.linkedTaskId || null
  if (body.requiresSignOff !== undefined) updates.requiresSignOff = !!body.requiresSignOff
  if (body.isOnboarding !== undefined) updates.isOnboarding = !!body.isOnboarding
  if (body.onboardingOrder !== undefined) updates.onboardingOrder = body.onboardingOrder
  if (body.isActive !== undefined) updates.isActive = !!body.isActive

  if (body.steps !== undefined) {
    const cleanSteps = (body.steps as IncomingStep[]).filter((s) => s.content?.trim())
    updates.steps = {
      deleteMany: {},
      create: cleanSteps.map((s, i) => ({
        order: i,
        title: s.title?.trim() || null,
        content: s.content.trim(),
        imageUrl: s.imageUrl || null,
        videoUrl: s.videoUrl?.trim() || null,
        linkedTaskId: s.linkedTaskId || null,
      })),
    }
  }

  const trainingModule = await prisma.trainingModule.update({
    where: { id: params.id },
    data: updates,
    include: { steps: { orderBy: { order: 'asc' } } },
  })

  return NextResponse.json(trainingModule)
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await prisma.trainingModule.update({
    where: { id: params.id },
    data: { deletedAt: new Date(), isActive: false },
  })

  return NextResponse.json({ success: true })
}
