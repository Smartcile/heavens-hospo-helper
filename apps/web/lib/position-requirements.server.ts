// DB half of role (Position) training requirements. Prisma-backed — server only.

import { prisma } from '@hospo-ops/db'
import {
  requiredGuideIds,
  resolveReadiness,
  type PositionReadiness,
  type SectionGuide,
} from '@/lib/position-requirements'

export interface PositionRequirementData {
  positionId: string
  sectionIds: string[]
  guideIds: string[]
  permissionKeys: string[]
}

export async function loadPositionRequirements(positionId: string): Promise<PositionRequirementData> {
  const [sections, guides, permissions] = await Promise.all([
    prisma.positionSection.findMany({ where: { positionId }, select: { sectionId: true } }),
    prisma.positionGuideRequirement.findMany({ where: { positionId }, select: { guideId: true } }),
    prisma.positionPermission.findMany({ where: { positionId }, select: { permissionKey: true } }),
  ])
  return {
    positionId,
    sectionIds: sections.map((s) => s.sectionId),
    guideIds: guides.map((g) => g.guideId),
    permissionKeys: permissions.map((p) => p.permissionKey),
  }
}

/** Every published guide targeting one of these sections. */
export async function sectionGuidesFor(venueId: string, sectionIds: string[]): Promise<SectionGuide[]> {
  if (sectionIds.length === 0) return []
  const rows = await prisma.guideAudience.findMany({
    where: {
      kind: 'SECTION',
      targetId: { in: sectionIds },
      guide: { status: 'PUBLISHED', deletedAt: null, venueId },
    },
    select: { guideId: true, targetId: true },
  })
  return rows.map((r) => ({ guideId: r.guideId, sectionId: r.targetId }))
}

export interface StaffReadinessRow {
  staffId: string
  name: string
  readiness: PositionReadiness
}

/** Per-staff readiness for everyone holding this role. */
export async function readinessForPosition(positionId: string): Promise<StaffReadinessRow[]> {
  const position = await prisma.position.findUnique({
    where: { id: positionId },
    select: { venueId: true },
  })
  if (!position) return []

  const [reqs, staffPositions] = await Promise.all([
    loadPositionRequirements(positionId),
    prisma.staffPosition.findMany({
      where: { positionId, staff: { deletedAt: null } },
      select: { staffId: true, staff: { select: { firstName: true, lastName: true } } },
    }),
  ])
  const sectionGuides = await sectionGuidesFor(position.venueId, reqs.sectionIds)
  const required = requiredGuideIds({
    explicitGuideIds: reqs.guideIds,
    requiredSectionIds: reqs.sectionIds,
    sectionGuides,
  })
  const staffIds = staffPositions.map((s) => s.staffId)
  const completions =
    required.length && staffIds.length
      ? await prisma.guideCompletion.findMany({
          where: { staffId: { in: staffIds }, guideId: { in: required } },
          select: { staffId: true, guideId: true },
        })
      : []
  const byStaff = new Map<string, string[]>()
  for (const c of completions) {
    const list = byStaff.get(c.staffId) ?? []
    list.push(c.guideId)
    byStaff.set(c.staffId, list)
  }

  return staffPositions.map((sp) => ({
    staffId: sp.staffId,
    name: `${sp.staff.firstName} ${sp.staff.lastName}`.trim(),
    readiness: resolveReadiness({
      explicitGuideIds: reqs.guideIds,
      requiredSectionIds: reqs.sectionIds,
      sectionGuides,
      completedGuideIds: byStaff.get(sp.staffId) ?? [],
    }),
  }))
}

/** { positionId: { total, ready } } for a venue — the roles-list badges. */
export async function readinessSummaries(venueId: string): Promise<Record<string, { total: number; ready: number }>> {
  const positions = await prisma.position.findMany({
    where: { venueId, deletedAt: null, isActive: true },
    select: { id: true },
  })
  const out: Record<string, { total: number; ready: number }> = {}
  for (const p of positions) {
    const rows = await readinessForPosition(p.id)
    out[p.id] = { total: rows.length, ready: rows.filter((r) => r.readiness.ready).length }
  }
  return out
}
