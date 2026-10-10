import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma, Prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { loadMenuItemIndex } from '@/lib/reference-table.server'
import {
  cleanAudiences,
  cleanBodyHtml,
  cleanGuideSteps,
  cleanTableColumns,
  cleanTableRows,
  cleanTaskGuides,
  guideStepsCreate,
  guideTypeValue,
  scopedFolderId,
  scopedMenuId,
  tableRowsCreate,
  type GuideStepInput,
  type GuideTableRowInput,
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
      tableRows: { orderBy: { sortOrder: 'asc' } },
      taskGuides: { select: { id: true, taskId: true, isRequiredForCompetency: true } },
      audiences: { select: { kind: true, targetId: true } },
      department: { select: { id: true, name: true } },
      folder: { select: { id: true, name: true } },
      _count: { select: { tableRows: true } },
    },
    orderBy: [{ isOnboarding: 'desc' }, { category: 'asc' }, { title: 'asc' }],
  })

  // Resolve linked products once for every reference table in the list.
  const menuIndex = await loadMenuItemIndex(
    guides.flatMap((g) => g.tableRows.map((r) => r.menuItemId)),
  )

  return NextResponse.json(
    guides.map((g) => ({
      ...g,
      tableRows: g.tableRows.map((r) => ({
        ...r,
        menuItem: r.menuItemId ? menuIndex.get(r.menuItemId) ?? null : null,
      })),
    })),
  )
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
    pdfPath,
    pdfUrl,
    departmentId,
    folderId,
    sourceMenuId,
    isTracked,
    isOnboarding,
    requiresSignOff,
    venueId,
    steps,
    taskGuides,
    audiences,
    tableColumns,
    rows,
  } = body as {
    title: string
    description?: string
    category?: string
    guideType?: string | null
    bodyHtml?: string | null
    pdfPath?: string | null
    pdfUrl?: string | null
    departmentId?: string | null
    folderId?: string | null
    sourceMenuId?: string | null
    isTracked?: boolean
    isOnboarding?: boolean
    requiresSignOff?: boolean
    venueId?: string
    steps: GuideStepInput[]
    taskGuides?: GuideTaskLinkInput[]
    audiences?: GuideAudienceInput[]
    tableColumns?: unknown
    rows?: GuideTableRowInput[]
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
  const cleanColumns = cleanTableColumns(tableColumns)
  const cleanRows = cleanTableRows(rows, cleanColumns)

  const guide = await prisma.guide.create({
    data: {
      title: String(title).toUpperCase().trim(),
      description: description?.trim() || null,
      category: category ? String(category).toUpperCase().trim() : null,
      guideType: guideTypeValue(guideType),
      bodyHtml: cleanBodyHtml(bodyHtml),
      pdfPath: pdfPath ? String(pdfPath).trim() : null,
      pdfUrl: pdfUrl ? String(pdfUrl).trim() : null,
      venueId: scopedVenueId,
      departmentId: departmentId || null,
      folderId: await scopedFolderId(folderId, scopedVenueId),
      sourceMenuId: await scopedMenuId(sourceMenuId, scopedVenueId),
      status: 'DRAFT',
      isTracked: !!isTracked,
      isOnboarding: !!isOnboarding,
      requiresSignOff: !!requiresSignOff,
      tableColumns: cleanColumns.length
        ? (cleanColumns as unknown as Prisma.InputJsonValue)
        : undefined,
      steps: cleanSteps.length ? { create: guideStepsCreate(cleanSteps) } : undefined,
      tableRows: cleanRows.length ? { create: tableRowsCreate(cleanRows) } : undefined,
      taskGuides: tgs.length ? { create: tgs } : undefined,
      audiences: auds.length ? { create: auds } : undefined,
    },
    include: {
      steps: { orderBy: { order: 'asc' }, include: { links: true } },
      tableRows: { orderBy: { sortOrder: 'asc' } },
      taskGuides: true,
      audiences: true,
    },
  })

  return NextResponse.json(guide, { status: 201 })
}
