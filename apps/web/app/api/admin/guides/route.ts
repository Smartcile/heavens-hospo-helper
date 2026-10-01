import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import {
  cleanAudiences,
  cleanBodyHtml,
  cleanGuideSteps,
  cleanTaskGuides,
  guideStepsCreate,
  guideTypeValue,
  type GuideStepInput,
  type GuideTaskLinkInput,
  type GuideAudienceInput,
} from '@/lib/guides.server'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'training.playbook.view')
  if (denied) return denied

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
      steps: { orderBy: { order: 'asc' }, include: { links: true } },
      taskGuides: { select: { id: true, taskId: true, isRequiredForCompetency: true } },
      audiences: { select: { kind: true, targetId: true } },
      department: { select: { id: true, name: true } },
    },
    orderBy: [{ isOnboarding: 'desc' }, { category: 'asc' }, { title: 'asc' }],
  })

  return NextResponse.json(guides)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'training.playbook.create')
  if (denied) return denied

  const body = await req.json()
  const {
    title,
    description,
    category,
    guideType,
    bodyHtml,
    departmentId,
    isTracked,
    isOnboarding,
    requiresSignOff,
    venueId,
    steps,
    taskGuides,
    audiences,
  } = body as {
    title: string
    description?: string
    category?: string
    guideType?: string | null
    bodyHtml?: string | null
    departmentId?: string | null
    isTracked?: boolean
    isOnboarding?: boolean
    requiresSignOff?: boolean
    venueId?: string
    steps: GuideStepInput[]
    taskGuides?: GuideTaskLinkInput[]
    audiences?: GuideAudienceInput[]
  }

  if (!title?.trim()) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  }

  const scopedVenueId = session.user.role === 'MANAGER' ? session.user.venueId : venueId
  if (!scopedVenueId) {
    return NextResponse.json({ error: 'Venue is required' }, { status: 400 })
  }

  const cleanSteps = cleanGuideSteps(steps)
  const tgs = cleanTaskGuides(taskGuides)
  const auds = cleanAudiences(audiences)

  const guide = await prisma.guide.create({
    data: {
      title: String(title).toUpperCase().trim(),
      description: description?.trim() || null,
      category: category ? String(category).toUpperCase().trim() : null,
      guideType: guideTypeValue(guideType),
      bodyHtml: cleanBodyHtml(bodyHtml),
      venueId: scopedVenueId,
      departmentId: departmentId || null,
      status: 'DRAFT',
      isTracked: !!isTracked,
      isOnboarding: !!isOnboarding,
      requiresSignOff: !!requiresSignOff,
      steps: cleanSteps.length ? { create: guideStepsCreate(cleanSteps) } : undefined,
      taskGuides: tgs.length ? { create: tgs } : undefined,
      audiences: auds.length ? { create: auds } : undefined,
    },
    include: { steps: { orderBy: { order: 'asc' }, include: { links: true } }, taskGuides: true, audiences: true },
  })

  return NextResponse.json(guide, { status: 201 })
}
