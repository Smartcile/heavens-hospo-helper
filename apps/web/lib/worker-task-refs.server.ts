import { prisma } from '@hospo-ops/db'

/**
 * Venue check for the reference ids a worker task/list write can carry.
 *
 * Worker authoring broadened task/list writes to granted floor STAFF, so the
 * route must not accept a department, section or Guide id from another venue.
 * `taskIds` already have their own check in the checklist routes; this covers
 * the scalar refs plus the `TaskGuide` competency links.
 *
 * Returns a 400 message on mismatch, or null when every provided ref belongs to
 * the venue. Omitted/null ids are not checked.
 */
export async function validateWorkerTaskRefs(input: {
  venueId: string
  departmentId?: string | null
  sectionId?: string | null
  guideIds?: readonly string[]
}): Promise<string | null> {
  const departmentId = input.departmentId || null
  const sectionId = input.sectionId || null
  const guideIds = [...new Set(input.guideIds ?? [])]

  const [departmentOk, sectionOk, guideCount] = await Promise.all([
    departmentId
      ? prisma.department
          .count({ where: { id: departmentId, venueId: input.venueId, deletedAt: null } })
          .then((count) => count === 1)
      : Promise.resolve(true),
    sectionId
      ? prisma.section
          .count({ where: { id: sectionId, venueId: input.venueId, deletedAt: null } })
          .then((count) => count === 1)
      : Promise.resolve(true),
    guideIds.length
      ? prisma.guide.count({
          where: { id: { in: guideIds }, venueId: input.venueId, deletedAt: null },
        })
      : Promise.resolve(0),
  ])

  if (!departmentOk) return 'DEPARTMENT IS NOT IN THIS VENUE'
  if (!sectionOk) return 'SECTION IS NOT IN THIS VENUE'
  if (guideCount !== guideIds.length) return 'ONE OR MORE GUIDES ARE NOT IN THIS VENUE'
  return null
}
