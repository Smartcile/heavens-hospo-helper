import { NextRequest, NextResponse } from 'next/server'
import { getWorkerSession } from '@/lib/worker-session'
import { workerGuideAccess } from '@/lib/worker-guide-access'
import { postRetrainNotice } from '@/lib/retrain'
import { prisma } from '@hospo-ops/db'
import {
  cleanAudiences,
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
  steps: {
    orderBy: { order: 'asc' as const },
    include: { links: { orderBy: { order: 'asc' as const } } },
  },
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

  // Filing a guide into a folder (the worker folder drag-and-drop) — the
  // target must be one of THIS venue's live folders.
  if (body.folderId !== undefined) {
    if (body.folderId) {
      const folder = await prisma.guideFolder.findFirst({
        where: { id: String(body.folderId), venueId: session.venueId, deletedAt: null },
        select: { id: true },
      })
      if (!folder) return NextResponse.json({ error: 'Folder not found' }, { status: 400 })
      updates.folderId = folder.id
    } else {
      updates.folderId = null
    }
  }

  // Steps are diffed by id so ids (and any admin-authored step links) survive.
  let cleanSteps: GuideStepInput[] | null = null
  if (body.steps !== undefined) {
    cleanSteps = cleanGuideSteps(body.steps)
    const existingIds = (
      await prisma.guideStep.findMany({ where: { guideId: params.id }, select: { id: true } })
    ).map((s) => s.id)
    updates.steps = guideStepsWrite(cleanSteps, existingIds)
  }

  // The worker editor sends `links` per step now, so a save replaces links for
  // the saved steps exactly like the admin editor. An older client that omits
  // `links` still leaves them untouched (stepsManageLinks gate).
  if (body.taskGuides !== undefined) {
    updates.taskGuides = { deleteMany: {}, create: cleanTaskGuides(body.taskGuides) }
  }

  // Audiences carry no children, so replacing them wholesale is safe. Only when
  // supplied, so an older client cannot wipe them.
  if (body.audiences !== undefined) {
    updates.audiences = { deleteMany: {}, create: cleanAudiences(body.audiences) }
  }

  // Only ADMIN/MANAGER may trigger a re-train notice; a granted floor editor can
  // still save, but the flag is ignored so they cannot post a venue-wide notice.
  const canNotify = session.role === 'ADMIN' || session.role === 'MANAGER'
  const requireRetrain = canNotify && !!body.requireRetrain
  if (requireRetrain) updates.version = { increment: 1 }

  const guide = await prisma.guide.update({
    where: { id: params.id },
    data: updates,
    include: {
      steps: {
        orderBy: { order: 'asc' },
        include: { links: { orderBy: { order: 'asc' } } },
      },
      taskGuides: true,
      audiences: true,
    },
  })

  // Only touched when the caller manages links (the editor sends `links`).
  if (cleanSteps && stepsManageLinks(cleanSteps)) {
    await syncStepLinks(guide.steps, cleanSteps)
  }

  // Target the audiences JUST SAVED, not the pre-save ones. A draft or an
  // untargeted guide still bumps the version but posts no notice.
  const hasAudienceTarget =
    (guide.audiences?.length ?? 0) > 0 || guide.departmentId != null || guide.isOnboarding
  if (requireRetrain && guide.status === 'PUBLISHED' && hasAudienceTarget) {
    try {
      await postRetrainNotice({
        venueId: guide.venueId,
        departmentId: guide.departmentId,
        title: guide.title,
        summary: body.changeSummary ?? null,
        audiences: guide.audiences,
        createdById: session.staffId,
      })
    } catch { /* never block the save */ }
  }

  return NextResponse.json(guide)
}
