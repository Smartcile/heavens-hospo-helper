import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

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

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const venueId = searchParams.get('venueId')

  const where = {
    deletedAt: null,
    ...(venueId ? { venueId } : {}),
    ...(session.user.role === 'MANAGER' ? { venueId: session.user.venueId } : {}),
  }

  const guides = await prisma.guide.findMany({
    where,
    include: {
      steps: { orderBy: { order: 'asc' } },
      taskGuides: { select: { id: true, taskId: true, isRequiredForCompetency: true } },
      department: { select: { id: true, name: true } },
    },
    orderBy: [{ isOnboarding: 'desc' }, { category: 'asc' }, { title: 'asc' }],
  })

  return NextResponse.json(guides)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const {
    title,
    description,
    category,
    departmentId,
    isTracked,
    isOnboarding,
    requiresSignOff,
    venueId,
    steps,
    taskGuides,
  } = body as {
    title: string
    description?: string
    category?: string
    departmentId?: string | null
    isTracked?: boolean
    isOnboarding?: boolean
    requiresSignOff?: boolean
    venueId?: string
    steps: IncomingStep[]
    taskGuides?: IncomingTaskGuide[]
  }

  if (!title?.trim()) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  }

  const scopedVenueId = session.user.role === 'MANAGER' ? session.user.venueId : venueId
  if (!scopedVenueId) {
    return NextResponse.json({ error: 'Venue is required' }, { status: 400 })
  }

  const cleanSteps = (steps ?? []).filter((s) => s.content?.trim() || s.heading?.trim())

  const guide = await prisma.guide.create({
    data: {
      title: String(title).toUpperCase().trim(),
      description: description?.trim() || null,
      category: category ? String(category).toUpperCase().trim() : null,
      venueId: scopedVenueId,
      departmentId: departmentId || null,
      status: 'DRAFT',
      isTracked: !!isTracked,
      isOnboarding: !!isOnboarding,
      requiresSignOff: !!requiresSignOff,
      steps: {
        create: cleanSteps.map((s, i) => ({
          order: i,
          heading: s.heading?.trim() || null,
          content: s.content?.trim() ?? '',
          imageUrl: s.imageUrl || null,
          videoUrl: s.videoUrl?.trim() || null,
        })),
      },
      taskGuides: taskGuides?.length
        ? { create: taskGuides.map((tg) => ({ taskId: tg.taskId, isRequiredForCompetency: tg.isRequiredForCompetency })) }
        : undefined,
    },
    include: { steps: { orderBy: { order: 'asc' } }, taskGuides: true },
  })

  return NextResponse.json(guide, { status: 201 })
}
