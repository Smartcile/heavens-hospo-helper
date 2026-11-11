import { NextRequest, NextResponse } from 'next/server'
import { getWorkerSession } from '@/lib/worker-session'
import { resolveStaffGuides } from '@/lib/guides'
import { guideTrainingState } from '@/lib/guide-warnings'
import { workerGuideAccess, workerMayAssignTraining } from '@/lib/worker-guide-access'
import { workerTaskAccess } from '@/lib/worker-task-access.server'
import { prisma } from '@hospo-ops/db'
import {
  cleanAudiences,
  cleanBodyHtml,
  cleanGuideSteps,
  cleanTaskGuides,
  guideStepsCreate,
  guideTypeValue,
  type GuideAudienceInput,
  type GuideStepInput,
  type GuideTaskLinkInput,
} from '@/lib/guides.server'

export async function GET(req: NextRequest) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Task authoring (or guide authoring) — return all guides for the venue
  // (lite form) so competency links can be picked on the phone.
  if (req.nextUrl.searchParams.get('edit') === '1') {
    const taskAccess = await workerTaskAccess(session)
    if (!taskAccess.canAuthor) {
      const guideAccess = await workerGuideAccess(session)
      if (!guideAccess.canEdit) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }
    const guides = await prisma.guide.findMany({
      where: { venueId: session.venueId, deletedAt: null },
      select: { id: true, title: true, venueId: true, isTracked: true, description: true, guideType: true },
      orderBy: { title: 'asc' },
    })
    return NextResponse.json(guides)
  }

  const [resolved, access, canAssign, folders, requests] = await Promise.all([
    resolveStaffGuides(session.staffId, { includeSteps: true }),
    workerGuideAccess(session),
    workerMayAssignTraining(session),
    prisma.guideFolder.findMany({
      where: { venueId: session.venueId, deletedAt: null },
      select: { id: true, name: true, sortOrder: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
    prisma.guideRetrainRequest.findMany({
      where: { venueId: session.venueId, staffId: session.staffId, status: 'PENDING', deletedAt: null },
      select: { id: true, guideId: true, reason: true, createdAt: true },
    }),
  ])
  if (!resolved) return NextResponse.json({ error: 'Staff not found' }, { status: 404 })
  const requestByGuide = new Map(requests.map((r) => [r.guideId, r]))

  const shape = (g: (typeof resolved.items)[number]) => {
    const request = requestByGuide.get(g.id) ?? null
    const state = guideTrainingState({
      updatedAt: g.updatedAt.toISOString(),
      requiresSignOff: g.requiresSignOff,
      completion: g.completion ? { completedAt: g.completion.completedAt.toISOString() } : null,
      request: request
        ? {
            id: request.id,
            guideId: request.guideId,
            reason: request.reason,
            requestedAt: request.createdAt.toISOString(),
          }
        : null,
    })
    return {
      id: g.id,
      title: g.title,
      description: g.description,
      category: g.category,
      guideType: g.guideType,
      bodyHtml: g.bodyHtml,
      pdfPath: g.pdfPath,
      pdfUrl: g.pdfUrl,
      requiresSignOff: g.requiresSignOff,
      isOnboarding: g.isOnboarding,
      isTracked: true,
      source: g.source,
      folderId: g.folderId,
      folderName: g.folder?.name ?? null,
      updatedAt: g.updatedAt.toISOString(),
      stale: state.stale,
      needsAction: state.needsAction,
      severity: state.severity,
      reasonText: state.reasonText,
      retrainRequestId: state.requestId,
      completed: g.completed,
      department: g.department,
      tableColumns: g.tableColumns,
      tableRows: g.tableRows,
      steps: g.steps,
    }
  }

  return NextResponse.json({
    staffId: session.staffId,
    firstName: session.firstName,
    canEdit: access.canEdit,
    canPublish: access.canPublish,
    canAssign,
    folders,
    items: resolved.items.map(shape),
    // Untracked published guides — read-only reference documents in the BIBLE.
    reference: resolved.reference.map((g) => ({
      ...shape(g),
      isTracked: false,
      completed: false,
      needsAction: false,
      stale: false,
      severity: null,
      reasonText: null,
      retrainRequestId: null,
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
  const { title, description, category, guideType, bodyHtml, departmentId, isTracked, isOnboarding, requiresSignOff, steps, taskGuides, audiences } = body as {
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
    audiences?: GuideAudienceInput[]
  }

  if (!title?.trim()) return NextResponse.json({ error: 'TITLE IS REQUIRED' }, { status: 400 })

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
      venueId: session.venueId,
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
