import { prisma } from '@hospo-ops/db'

/**
 * Mirror the latest live comment body onto `StaffAvailability.notes` so the
 * availability grid, roster overlay and worker month cells keep their cheap
 * read. Only an existing row is updated — a comment never creates availability.
 */
export async function mirrorAvailabilityCommentNotes(staffId: string, dateKey: string): Promise<void> {
  const date = new Date(`${dateKey}T00:00:00.000Z`)
  const latest = await prisma.availabilityComment.findFirst({
    where: { staffId, date, deletedAt: null },
    orderBy: [{ createdAt: 'desc' }, { updatedAt: 'desc' }],
    select: { body: true },
  })
  await prisma.staffAvailability.updateMany({
    where: { staffId, date, deletedAt: null },
    data: { notes: latest?.body ?? null },
  })
}
