// Pure rules for staff number plates. Prisma-free so the worker card and the
// admin panel share exactly the same validation.

import { isValidPlate, normalisePlate } from './parking'

export const PLATE_REASON_MAX = 500

export type StaffParkingPlateStatus = 'ACTIVE' | 'RETIRED'
export type StaffParkingRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export interface ExistingPlate {
  id: string
  plate: string
  status: string
}

export interface PlateOwner {
  staffId: string
  plate: string
}

/** The first plate needs no explanation; an extra or a change does. */
export function requiresChangeReason(activePlateCount: number): boolean {
  return activePlateCount > 0
}

export function plateSubmissionError(input: {
  plate: string
  reason?: string | null
  activePlates: ExistingPlate[]
  pendingPlates?: string[]
  otherOwners?: PlateOwner[]
  staffId: string
}): string | null {
  const plate = normalisePlate(input.plate)
  if (!isValidPlate(plate)) return 'NUMBER PLATE MUST BE 1–6 LETTERS OR DIGITS'

  if (input.activePlates.some((row) => normalisePlate(row.plate) === plate)) {
    return 'THAT PLATE IS ALREADY ON YOUR LIST'
  }

  const pending = (input.pendingPlates ?? []).map((value) => normalisePlate(value))
  if (pending.includes(plate)) return 'THIS PLATE IS ALREADY WAITING FOR APPROVAL'

  const owned = (input.otherOwners ?? []).some(
    (row) => row.staffId !== input.staffId && normalisePlate(row.plate) === plate,
  )
  if (owned) return 'THAT PLATE IS ALREADY REGISTERED TO ANOTHER STAFF MEMBER'

  const reason = (input.reason ?? '').trim()
  if (requiresChangeReason(input.activePlates.length) && !reason) {
    return 'ADD A NOTE TO EXPLAIN THIS CHANGE'
  }
  if (reason.length > PLATE_REASON_MAX) {
    return `NOTE MUST BE ${PLATE_REASON_MAX} CHARACTERS OR LESS`
  }

  return null
}

export function validateReviewAction(value: unknown): 'APPROVE' | 'REJECT' | null {
  const action = String(value ?? '').toUpperCase()
  return action === 'APPROVE' || action === 'REJECT' ? action : null
}

export function reviewTransitionError(status: string): string | null {
  return status === 'PENDING' ? null : 'THIS REQUEST HAS ALREADY BEEN REVIEWED'
}

export function requestKind(previousPlate: string | null | undefined): 'ADD' | 'CHANGE' {
  return previousPlate ? 'CHANGE' : 'ADD'
}

export function describeRequestStatus(status: string): string {
  if (status === 'APPROVED') return 'APPROVED'
  if (status === 'REJECTED') return 'REJECTED'
  return 'WAITING FOR APPROVAL'
}

export function describePlateStatus(status: string): string {
  return status === 'RETIRED' ? 'RETIRED' : 'ACTIVE'
}

/** Pending first, then newest first. */
export function sortStaffPlateRequests<
  T extends { status: string; createdAt: string | Date },
>(rows: T[]): T[] {
  const rank = (status: string) => (status === 'PENDING' ? 0 : 1)
  return [...rows].sort((a, b) => {
    const byStatus = rank(a.status) - rank(b.status)
    if (byStatus !== 0) return byStatus
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })
}

export function nextPlateFromApproval(input: {
  existing: ExistingPlate[]
  plate: string
  previousPlate?: string | null
}): { retireIds: string[]; plate: string } {
  const plate = normalisePlate(input.plate)
  const previous = input.previousPlate ? normalisePlate(input.previousPlate) : null
  const retireIds = previous
    ? input.existing
        .filter(
          (row) => row.status === 'ACTIVE' && normalisePlate(row.plate) === previous,
        )
        .map((row) => row.id)
    : []
  return { retireIds, plate }
}
