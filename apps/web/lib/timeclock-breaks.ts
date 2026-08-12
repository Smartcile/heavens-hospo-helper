import { prisma } from '@hospo-ops/db'

/**
 * Recompute a session's cached breaksMinutes from its CLOSED break rows.
 * Called on break end and clock-out; admin edits set the value directly.
 */
export async function recalcBreaksMinutes(timeClockId: string): Promise<number> {
  const breaks = await prisma.timeClockBreak.findMany({
    where: { timeClockId, deletedAt: null, endAt: { not: null } },
    select: { startAt: true, endAt: true },
  })
  const minutes = breaks.reduce(
    (sum, b) => sum + Math.max(0, (b.endAt!.getTime() - b.startAt.getTime()) / 60000),
    0
  )
  const rounded = Math.round(minutes)
  await prisma.timeClock.update({ where: { id: timeClockId }, data: { breaksMinutes: rounded } })
  return rounded
}
