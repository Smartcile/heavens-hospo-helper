import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { allPermissionKeys, completeGrantSet } from '@/lib/permissions/registry'
import { loadPositionRequirements, sectionGuidesFor } from '@/lib/position-requirements.server'

interface Params {
  params: { id: string }
}

async function loadScoped(id: string, role: string, sessionVenueId: string) {
  const position = await prisma.position.findUnique({
    where: { id },
    select: { id: true, venueId: true, deletedAt: true },
  })
  if (!position || position.deletedAt) return { error: 'Not found', status: 404 as const }
  if (role === 'MANAGER' && position.venueId !== sessionVenueId) {
    return { error: 'Forbidden', status: 403 as const }
  }
  return { position }
}

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, _req, 'training.playbook.view')
  if (denied) return denied

  const scoped = await loadScoped(params.id, session.user.role, session.user.venueId)
  if ('error' in scoped) return NextResponse.json({ error: scoped.error }, { status: scoped.status })

  const reqs = await loadPositionRequirements(params.id)
  const sectionGuides = await sectionGuidesFor(scoped.position.venueId, reqs.sectionIds)
  const guideIds = [...new Set([...reqs.guideIds, ...sectionGuides.map((s) => s.guideId)])]
  const guides = guideIds.length
    ? await prisma.guide.findMany({
        where: { id: { in: guideIds } },
        select: { id: true, title: true },
      })
    : []
  const titleById = new Map(guides.map((g) => [g.id, g.title]))

  return NextResponse.json({
    ...reqs,
    // Guides the required sections already carry — shown so it's obvious what a
    // role demands before adding extras.
    derived: sectionGuides.map((s) => ({ ...s, title: titleById.get(s.guideId) ?? 'GUIDE REMOVED' })),
    explicit: reqs.guideIds.map((id) => ({ id, title: titleById.get(id) ?? 'GUIDE REMOVED' })),
  })
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'training.playbook.edit')
  if (denied) return denied

  const scoped = await loadScoped(params.id, session.user.role, session.user.venueId)
  if ('error' in scoped) return NextResponse.json({ error: scoped.error }, { status: scoped.status })
  const { venueId } = scoped.position

  const body = (await req.json()) as {
    sectionIds?: string[]
    guideIds?: string[]
    permissionKeys?: string[]
  }
  const sectionIds = Array.isArray(body.sectionIds) ? [...new Set(body.sectionIds)] : []
  const guideIds = Array.isArray(body.guideIds) ? [...new Set(body.guideIds)] : []
  const validKeys = new Set(allPermissionKeys())
  const permissionKeys = Array.isArray(body.permissionKeys)
    ? completeGrantSet([...new Set(body.permissionKeys)].filter((k) => validKeys.has(k)))
    : []

  // Keep only targets that belong to this venue.
  const [sections, guides] = await Promise.all([
    sectionIds.length
      ? prisma.section.findMany({ where: { id: { in: sectionIds }, venueId, deletedAt: null }, select: { id: true } })
      : Promise.resolve([]),
    guideIds.length
      ? prisma.guide.findMany({ where: { id: { in: guideIds }, venueId, deletedAt: null }, select: { id: true } })
      : Promise.resolve([]),
  ])
  const allowedSections = sections.map((s) => s.id)
  const allowedGuides = guides.map((g) => g.id)

  await prisma.$transaction([
    prisma.positionSection.deleteMany({ where: { positionId: params.id } }),
    prisma.positionGuideRequirement.deleteMany({ where: { positionId: params.id } }),
    prisma.positionPermission.deleteMany({ where: { positionId: params.id } }),
    ...(allowedSections.length
      ? [prisma.positionSection.createMany({ data: allowedSections.map((sectionId) => ({ positionId: params.id, sectionId })) })]
      : []),
    ...(allowedGuides.length
      ? [prisma.positionGuideRequirement.createMany({ data: allowedGuides.map((guideId) => ({ positionId: params.id, guideId })) })]
      : []),
    ...(permissionKeys.length
      ? [prisma.positionPermission.createMany({ data: permissionKeys.map((permissionKey) => ({ positionId: params.id, venueId, permissionKey })) })]
      : []),
  ])

  return NextResponse.json({ sectionIds: allowedSections, guideIds: allowedGuides, permissionKeys })
}
