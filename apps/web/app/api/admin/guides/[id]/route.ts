import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

interface Params {
  params: { id: string }
}

interface IncomingStep {
  heading?: string | null
  content: string
  imageUrl?: string | null
  videoUrl?: string | null
}

interface IncomingTaskGuide {
  taskId: string
  isRequiredForCompetency: boolean
}

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const guide = await prisma.guide.findUnique({
    where: { id: params.id },
    include: {
      steps: { orderBy: { order: 'asc' } },
      taskGuides: { select: { id: true, taskId: true, isRequiredForCompetency: true } },
      department: { select: { id: true, name: true } },
    },
  })
  if (!guide || guide.deletedAt) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json(guide)
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const existing = await prisma.guide.findUnique({ where: { id: params.id } })
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
  if (body.isTracked !== undefined) updates.isTracked = !!body.isTracked
  if (body.isOnboarding !== undefined) updates.isOnboarding = !!body.isOnboarding
  if (body.requiresSignOff !== undefined) updates.requiresSignOff = !!body.requiresSignOff

  if (body.steps !== undefined) {
    const cleanSteps = (body.steps as IncomingStep[]).filter((s) => s.content?.trim() || s.heading?.trim())
    updates.steps = {
      deleteMany: {},
      create: cleanSteps.map((s, i) => ({
        order: i,
        heading: s.heading?.trim() || null,
        content: s.content?.trim() ?? '',
        imageUrl: s.imageUrl || null,
        videoUrl: s.videoUrl?.trim() || null,
      })),
    }
  }

  if (body.taskGuides !== undefined) {
    const tgs: IncomingTaskGuide[] = Array.isArray(body.taskGuides) ? body.taskGuides : []
    updates.taskGuides = {
      deleteMany: {},
      create: tgs.map((tg) => ({ taskId: tg.taskId, isRequiredForCompetency: tg.isRequiredForCompetency })),
    }
  }

  const guide = await prisma.guide.update({
    where: { id: params.id },
    data: updates,
    include: { steps: { orderBy: { order: 'asc' } }, taskGuides: true },
  })

  return NextResponse.json(guide)
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await prisma.guide.update({
    where: { id: params.id },
    data: { deletedAt: new Date() },
  })

  return NextResponse.json({ success: true })
}
