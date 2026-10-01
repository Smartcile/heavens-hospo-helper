import { NextRequest, NextResponse } from 'next/server'
import { getWorkerSession } from '@/lib/worker-session'
import { resolveStaffGuides } from '@/lib/guides'
import { workerGuideAccess } from '@/lib/worker-guide-access'
import { prisma } from '@hospo-ops/db'
import {
  cleanBodyHtml,
  cleanGuideSteps,
  cleanTaskGuides,
  guideStepsCreate,
  guideTypeValue,
  type GuideStepInput,
  type GuideTaskLinkInput,
} from '@/lib/guides.server'

export async function GET(req: NextRequest) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Manager/admin editing tasks — return all guides for the venue (lite form).
  if (req.nextUrl.searchParams.get('edit') === '1') {
    if (session.role !== 'ADMIN' && session.role !== 'MANAGER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const guides = await prisma.guide.findMany({
      where: { venueId: session.venueId, deletedAt: null },
      select: { id: true, title: true, venueId: true, isTracked: true, description: true, guideType: true },
      orderBy: { title: 'asc' },
    })
    return NextResponse.json(guides)
  }

  const [resolved, access] = await Promise.all([
    resolveStaffGuides(session.staffId, { includeSteps: true }),
    workerGuideAccess(session),
  ])
  if (!resolved) return NextResponse.json({ error: 'Staff not found' }, { status: 404 })

  const shape = (g: (typeof resolved.items)[number]) => ({
    id: g.id,
    title: g.title,
    description: g.description,
    category: g.category,
    guideType: g.guideType,
    bodyHtml: g.bodyHtml,
    requiresSignOff: g.requiresSignOff,
    isOnboarding: g.isOnboarding,
    isTracked: true,
    source: g.source,
    completed: g.completed,
    department: g.department,
    steps: g.steps,
  })

  return NextResponse.json({
    firstName: session.firstName,
    canEdit: access.canEdit,
    canPublish: access.canPublish,
    items: resolved.items.map(shape),
    // Untracked published guides — read-only reference documents in the BIBLE.
    reference: resolved.reference.map((g) => ({
      ...shape(g),
      isTracked: false,
      completed: false,
    })),
  })
}

// Create a guide from the worker app (managers / granted staff only).
export async function POST(req: NextRequest) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const access = await workerGuideAccess(session)
  if (!access.canEdit) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { title, description, category, guideType, bodyHtml, departmentId, isTracked, isOnboarding, requiresSignOff, steps, taskGuides } = body as {
    title?: string
    description?: string | null
    category?: string | null
    guideType?: string | null
    bodyHtml?: string | null
    departmentId?: string | null
    isTracked?: boolean
    isOnboarding?: boolean
    requiresSignOff?: boolean
    steps?: GuideStepInput[]
    taskGuides?: GuideTaskLinkInput[]
  }

  if (!title?.trim()) return NextResponse.json({ error: 'TITLE IS REQUIRED' }, { status: 400 })

  const cleanSteps = cleanGuideSteps(steps)
  const tgs = cleanTaskGuides(taskGuides)

  const guide = await prisma.guide.create({
    data: {
      title: String(title).toUpperCase().trim(),
      description: description?.trim() || null,
      category: category ? String(category).toUpperCase().trim() : null,
      guideType: guideTypeValue(guideType),
      bodyHtml: cleanBodyHtml(bodyHtml),
      venueId: session.venueId,
      departmentId: departmentId || null,
      status: 'DRAFT',
      isTracked: !!isTracked,
      isOnboarding: !!isOnboarding,
      requiresSignOff: !!requiresSignOff,
      steps: cleanSteps.length ? { create: guideStepsCreate(cleanSteps) } : undefined,
      taskGuides: tgs.length ? { create: tgs } : undefined,
    },
    include: { steps: { orderBy: { order: 'asc' } }, taskGuides: true },
  })

  return NextResponse.json(guide, { status: 201 })
}
