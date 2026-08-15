import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { STEP_LINK_KINDS, type StepLinkKind } from '@/lib/guide-links'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'

interface IncomingLink {
  kind: StepLinkKind
  targetId: string
  qty?: number | null
  note?: string | null
}

interface IncomingStep {
  heading?: string | null
  content: string
  imageUrl?: string | null
  videoUrl?: string | null
  links?: IncomingLink[]
}

interface IncomingTaskGuide {
  taskId: string
  isRequiredForCompetency: boolean
}

interface IncomingAudience {
  kind: 'DEPARTMENT' | 'SECTION' | 'POSITION'
  targetId: string
}

/** Drop malformed rows and duplicates — the unique key would reject them anyway. */
function cleanLinks(links: IncomingLink[] | undefined) {
  const seen = new Set<string>()
  return (links ?? [])
    .filter((l) => {
      if (!l?.targetId || !STEP_LINK_KINDS.includes(l.kind)) return false
      const key = `${l.kind}:${l.targetId}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .map((l, order) => ({
      kind: l.kind,
      targetId: l.targetId,
      qty: typeof l.qty === 'number' ? l.qty : null,
      note: l.note?.trim() || null,
      order,
    }))
}

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
    departmentId?: string | null
    isTracked?: boolean
    isOnboarding?: boolean
    requiresSignOff?: boolean
    venueId?: string
    steps: IncomingStep[]
    taskGuides?: IncomingTaskGuide[]
    audiences?: IncomingAudience[]
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
          links: { create: cleanLinks(s.links) },
        })),
      },
      taskGuides: taskGuides?.length
        ? { create: taskGuides.map((tg) => ({ taskId: tg.taskId, isRequiredForCompetency: tg.isRequiredForCompetency })) }
        : undefined,
      audiences: audiences?.length
        ? {
            create: [
              ...new Map(
                audiences
                  .filter((a) => a?.targetId && ['DEPARTMENT', 'SECTION', 'POSITION'].includes(a.kind))
                  .map((a) => [`${a.kind}:${a.targetId}`, { kind: a.kind, targetId: a.targetId }]),
              ).values(),
            ],
          }
        : undefined,
    },
    include: { steps: { orderBy: { order: 'asc' }, include: { links: true } }, taskGuides: true, audiences: true },
  })

  return NextResponse.json(guide, { status: 201 })
}
