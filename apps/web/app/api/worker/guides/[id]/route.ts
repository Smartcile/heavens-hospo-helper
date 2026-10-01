import { NextRequest, NextResponse } from 'next/server'
import { getWorkerSession } from '@/lib/worker-session'
import { workerGuideAccess } from '@/lib/worker-guide-access'
import { prisma } from '@hospo-ops/db'
import {
  cleanBodyHtml,
  cleanGuideSteps,
  cleanTaskGuides,
  guideStepsWrite,
  guideTypeValue,
  stepsManageLinks,
  syncStepLinks,
  type GuideStepInput,
} from '@/lib/guides.server'

interface Params {
  params: { id: string }
}

const FULL_INCLUDE = {
  steps: { orderBy: { order: 'asc' as const } },
  taskGuides: { select: { taskId: true, isRequiredForCompetency: true } },
  audiences: { select: { kind: true, targetId: true } },
  department: { select: { id: true, name: true } },
}

// Full guide for the worker editor (managers / granted staff).
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const access = await workerGuideAccess(session)
  if (!access.canEdit) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const guide = await prisma.guide.findUnique({ where: { id: params.id }, include: FULL_INCLUDE })
  if (!guide || guide.deletedAt || guide.venueId !== session.venueId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json(guide)
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const access = await workerGuideAccess(session)
  if (!access.canEdit) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const existing = await prisma.guide.findUnique({ where: { id: params.id } })
  if (!existing || existing.deletedAt || existing.venueId !== session.venueId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await req.json()
  const updates: Record<string, unknown> = {}

  if (body.title !== undefined) updates.title = String(body.title).toUpperCase().trim()
  if (body.description !== undefined) updates.description = body.description?.trim() || null
  if (body.category !== undefined) updates.category = body.category ? String(body.category).toUpperCase().trim() : null
  if (body.guideType !== undefined) updates.guideType = guideTypeValue(body.guideType)
  if (body.bodyHtml !== undefined) updates.bodyHtml = cleanBodyHtml(body.bodyHtml)
  if (body.departmentId !== undefined) updates.departmentId = body.departmentId || null
  if (body.isTracked !== undefined) updates.isTracked = !!body.isTracked
  if (body.isOnboarding !== undefined) updates.isOnboarding = !!body.isOnboarding
  if (body.requiresSignOff !== undefined) updates.requiresSignOff = !!body.requiresSignOff

  // Steps are diffed by id so ids (and any admin-authored step links) survive.
  let cleanSteps: GuideStepInput[] | null = null
  if (body.steps !== undefined) {
    cleanSteps = cleanGuideSteps(body.steps)
    const existingIds = (
      await prisma.guideStep.findMany({ where: { guideId: params.id }, select: { id: true } })
    ).map((s) => s.id)
    updates.steps = guideStepsWrite(cleanSteps, existingIds)
  }

  // The worker editor omits audiences entirely — they are left untouched.
  if (body.taskGuides !== undefined) {
    updates.taskGuides = { deleteMany: {}, create: cleanTaskGuides(body.taskGuides) }
  }

  const guide = await prisma.guide.update({
    where: { id: params.id },
    data: updates,
    include: { steps: { orderBy: { order: 'asc' } }, taskGuides: true },
  })

  // Only touched when the caller manages links (the worker editor does not).
  if (cleanSteps && stepsManageLinks(cleanSteps)) {
    await syncStepLinks(guide.steps, cleanSteps)
  }

  return NextResponse.json(guide)
}
