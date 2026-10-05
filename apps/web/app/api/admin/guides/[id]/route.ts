import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { postRetrainNotice } from '@/lib/retrain'
import { resolveStepLinks } from '@/lib/guide-links.server'
import { loadMenuItemIndex } from '@/lib/reference-table.server'
import type { ReferenceColumn } from '@/lib/reference-table'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import {
  cleanAudiences,
  cleanBodyHtml,
  cleanGuideSteps,
  cleanTableColumns,
  cleanTableRows,
  cleanTaskGuides,
  guideStepsWrite,
  guideTypeValue,
  scopedFolderId,
  stepsManageLinks,
  syncStepLinks,
  tableRowsWrite,
  type GuideStepInput,
} from '@/lib/guides.server'

interface Params {
  params: { id: string }
}

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, _req, 'training.playbook.view')
  if (denied) return denied

  const guide = await prisma.guide.findUnique({
    where: { id: params.id },
    include: {
      steps: { orderBy: { order: 'asc' }, include: { links: true } },
      tableRows: { orderBy: { sortOrder: 'asc' } },
      taskGuides: { select: { id: true, taskId: true, isRequiredForCompetency: true } },
      audiences: { select: { kind: true, targetId: true } },
      department: { select: { id: true, name: true } },
    },
  })
  if (!guide || guide.deletedAt) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // One batched resolve for the whole guide rather than per step.
  const allLinks = guide.steps.flatMap((s) => s.links)
  const [resolved, menuIndex] = await Promise.all([
    resolveStepLinks(allLinks),
    loadMenuItemIndex(guide.tableRows.map((r) => r.menuItemId)),
  ])
  const byId = new Map(resolved.map((l) => [l.id, l]))

  return NextResponse.json({
    ...guide,
    steps: guide.steps.map((s) => ({
      ...s,
      links: s.links.map((l) => byId.get(l.id)).filter(Boolean),
    })),
    tableRows: guide.tableRows.map((r) => ({
      ...r,
      menuItem: r.menuItemId ? menuIndex.get(r.menuItemId) ?? null : null,
    })),
  })
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'training.playbook.edit')
  if (denied) return denied

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
  if (body.guideType !== undefined) updates.guideType = guideTypeValue(body.guideType)
  if (body.bodyHtml !== undefined) updates.bodyHtml = cleanBodyHtml(body.bodyHtml)
  if (body.departmentId !== undefined) updates.departmentId = body.departmentId || null
  if (body.folderId !== undefined) updates.folderId = await scopedFolderId(body.folderId, existing.venueId)
  if (body.isTracked !== undefined) updates.isTracked = !!body.isTracked
  if (body.isOnboarding !== undefined) updates.isOnboarding = !!body.isOnboarding
  if (body.requiresSignOff !== undefined) updates.requiresSignOff = !!body.requiresSignOff

  // Steps are diffed by id rather than deleted and recreated, so step ids stay
  // stable across saves. Anything hanging off a step (links, completions) would
  // otherwise be orphaned by an unrelated edit.
  let cleanSteps: GuideStepInput[] | null = null
  if (body.steps !== undefined) {
    cleanSteps = cleanGuideSteps(body.steps)
    const existingIds = (
      await prisma.guideStep.findMany({ where: { guideId: params.id }, select: { id: true } })
    ).map((s) => s.id)
    updates.steps = guideStepsWrite(cleanSteps, existingIds)
  }

  if (body.taskGuides !== undefined) {
    updates.taskGuides = {
      deleteMany: {},
      create: cleanTaskGuides(body.taskGuides),
    }
  }

  // Audiences carry no children, so replacing them wholesale is safe (unlike
  // steps, which own links).
  if (body.audiences !== undefined) {
    updates.audiences = {
      deleteMany: {},
      create: cleanAudiences(body.audiences),
    }
  }

  // Product-reference table: columns are stored on the guide, rows are diffed by
  // id (like steps). An empty column list clears the table.
  let columnsForRows: ReferenceColumn[] | null = null
  if (body.tableColumns !== undefined) {
    columnsForRows = cleanTableColumns(body.tableColumns)
    updates.tableColumns = columnsForRows.length ? columnsForRows : null
  }
  if (body.rows !== undefined) {
    const cols = columnsForRows ?? cleanTableColumns(existing.tableColumns)
    const cleanRows = cleanTableRows(body.rows, cols)
    const existingRowIds = (
      await prisma.guideTableRow.findMany({
        where: { guideId: params.id, deletedAt: null },
        select: { id: true },
      })
    ).map((r) => r.id)
    updates.tableRows = tableRowsWrite(cleanRows, existingRowIds)
  }

  // "Significant change" → bump version + post a re-train notice to the group.
  const requireRetrain = !!body.requireRetrain
  if (requireRetrain) updates.version = { increment: 1 }

  const guide = await prisma.guide.update({
    where: { id: params.id },
    data: updates,
    include: { steps: { orderBy: { order: 'asc' } }, tableRows: { orderBy: { sortOrder: 'asc' } }, taskGuides: true },
  })

  // Links are synced after the step diff, because a newly created step has no id
  // until it exists. Steps come back ordered 0..n-1 matching cleanSteps, so index
  // is a safe join. Links themselves are replaced wholesale — nothing hangs off
  // a link, so there is no id to preserve.
  if (cleanSteps && stepsManageLinks(cleanSteps)) {
    await syncStepLinks(guide.steps, cleanSteps)
  }

  if (requireRetrain) {
    try {
      await postRetrainNotice({
        venueId: guide.venueId,
        departmentId: guide.departmentId,
        title: guide.title,
        summary: body.changeSummary ?? null,
        createdById: session.user.id,
      })
    } catch { /* never block the save */ }
  }

  return NextResponse.json(guide)
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, _req, 'training.playbook.delete')
  if (denied) return denied

  const existing = await prisma.guide.findUnique({
    where: { id: params.id },
    select: { venueId: true, deletedAt: true },
  })
  if (!existing || existing.deletedAt) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (session.user.role === 'MANAGER' && existing.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.guide.update({
    where: { id: params.id },
    data: { deletedAt: new Date() },
  })

  return NextResponse.json({ success: true })
}
