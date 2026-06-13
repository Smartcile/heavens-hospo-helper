import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

interface IncomingStep {
  title?: string | null
  content: string
  imageUrl?: string | null
  videoUrl?: string | null
  linkedTaskId?: string | null
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

  const modules = await prisma.trainingModule.findMany({
    where,
    include: {
      steps: { orderBy: { order: 'asc' } },
      department: { select: { id: true, name: true } },
      linkedTask: { select: { id: true, title: true } },
      _count: { select: { completions: true } },
    },
    orderBy: [{ isOnboarding: 'desc' }, { onboardingOrder: 'asc' }, { category: 'asc' }, { title: 'asc' }],
  })

  return NextResponse.json(modules)
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
    linkedTaskId,
    requiresSignOff,
    isOnboarding,
    onboardingOrder,
    venueId,
    steps,
  } = body as {
    title: string
    description?: string
    category?: string
    departmentId?: string | null
    linkedTaskId?: string | null
    requiresSignOff?: boolean
    isOnboarding?: boolean
    onboardingOrder?: number
    venueId?: string
    steps: IncomingStep[]
  }

  if (!title?.trim()) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  }

  const scopedVenueId = session.user.role === 'MANAGER' ? session.user.venueId : venueId
  if (!scopedVenueId) {
    return NextResponse.json({ error: 'Venue is required' }, { status: 400 })
  }

  const cleanSteps = (steps ?? []).filter((s) => s.content?.trim())

  const trainingModule = await prisma.trainingModule.create({
    data: {
      title: String(title).toUpperCase().trim(),
      description: description?.trim() || null,
      category: category ? String(category).toUpperCase().trim() : null,
      venueId: scopedVenueId,
      departmentId: departmentId || null,
      linkedTaskId: linkedTaskId || null,
      requiresSignOff: !!requiresSignOff,
      isOnboarding: !!isOnboarding,
      onboardingOrder: onboardingOrder ?? 0,
      steps: {
        create: cleanSteps.map((s, i) => ({
          order: i,
          title: s.title?.trim() || null,
          content: s.content.trim(),
          imageUrl: s.imageUrl || null,
          videoUrl: s.videoUrl?.trim() || null,
          linkedTaskId: s.linkedTaskId || null,
        })),
      },
    },
    include: { steps: { orderBy: { order: 'asc' } } },
  })

  return NextResponse.json(trainingModule, { status: 201 })
}
