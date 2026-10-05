import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { requiredGuideIds } from '@/lib/position-requirements'
import { loadPositionRequirements, sectionGuidesFor } from '@/lib/position-requirements.server'

interface Params {
  params: { id: string }
}

// Assign every missing required guide to each holder of the role, so the gap
// shows up in their "My Guides" instead of only on a readiness report.
export async function POST(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, _req, 'training.playbook.edit')
  if (denied) return denied

  const position = await prisma.position.findUnique({
    where: { id: params.id },
    select: { venueId: true, deletedAt: true },
  })
  if (!position || position.deletedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.user.role === 'MANAGER' && position.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const reqs = await loadPositionRequirements(params.id)
  const sectionGuides = await sectionGuidesFor(position.venueId, reqs.sectionIds)
  const required = requiredGuideIds({
    explicitGuideIds: reqs.guideIds,
    requiredSectionIds: reqs.sectionIds,
    sectionGuides,
  })
  if (required.length === 0) return NextResponse.json({ assigned: 0, staff: 0 })

  const holders = await prisma.staffPosition.findMany({
    where: { positionId: params.id, staff: { deletedAt: null } },
    select: { staffId: true },
  })
  const staffIds = holders.map((h) => h.staffId)
  const completions = staffIds.length
    ? await prisma.guideCompletion.findMany({
        where: { staffId: { in: staffIds }, guideId: { in: required } },
        select: { staffId: true, guideId: true },
      })
    : []
  const doneByStaff = new Map<string, Set<string>>()
  for (const c of completions) {
    if (!doneByStaff.has(c.staffId)) doneByStaff.set(c.staffId, new Set())
    doneByStaff.get(c.staffId)!.add(c.guideId)
  }

  let assigned = 0
  for (const staffId of staffIds) {
    const done = doneByStaff.get(staffId) ?? new Set<string>()
    for (const guideId of required) {
      if (done.has(guideId)) continue
      await prisma.guideAssignment.upsert({
        where: { guideId_staffId: { guideId, staffId } },
        update: { deletedAt: null, reason: 'ROLE REQUIREMENT', assignedById: session.user.id },
        create: { guideId, staffId, reason: 'ROLE REQUIREMENT', assignedById: session.user.id },
      })
      assigned++
    }
  }

  return NextResponse.json({ assigned, staff: staffIds.length })
}
