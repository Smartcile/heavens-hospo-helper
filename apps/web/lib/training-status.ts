// Training-status board maths — the traffic-light rule used by the admin
// STATUS tab. Pure and Prisma-free so it is unit-tested in isolation.

export type TrainingLevel = 'GREEN' | 'YELLOW' | 'RED'

export interface TrainingStatusInput {
  requiredCount: number
  missingCount: number
  /** Required guides completed before the guide was last updated. */
  staleCount: number
  /** Open UNTRAINED / MISSED / INCORRECT follow-ups for this person. */
  openFollowUps: number
}

/**
 * RED = retraining or overdue (stale completion, or an open follow-up).
 * YELLOW = bits to work on (required guides still missing).
 * GREEN = nothing required, or all required guides complete and current.
 */
export function trainingLevel(input: TrainingStatusInput): TrainingLevel {
  if (input.staleCount > 0 || input.openFollowUps > 0) return 'RED'
  if (input.missingCount > 0) return 'YELLOW'
  return 'GREEN'
}

const RANK: Record<TrainingLevel, number> = { RED: 0, YELLOW: 1, GREEN: 2 }

export interface TrainingStatusRowLike {
  onShift: boolean
  level: TrainingLevel
  name: string
}

/**
 * On shift today first, then most urgent colour first, then name. Pure so the
 * board and any export render the same order.
 */
export function sortTrainingRows<T extends TrainingStatusRowLike>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.onShift !== b.onShift) return a.onShift ? -1 : 1
    if (a.level !== b.level) return RANK[a.level] - RANK[b.level]
    return a.name.localeCompare(b.name)
  })
}
