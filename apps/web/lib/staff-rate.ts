// Resolve a staff member's pay rate for a role. Pure and Prisma-free so the
// staff form, roster and payroll all agree on the precedence:
//
//   StaffPosition.hourlyRate (per-person override for the role)
//     → Position.hourlyRate (role default)
//       → Staff.hourlyRate (base rate)
//
// Any layer can be null; the first non-null wins.

export interface RateLayers {
  /** StaffPosition.hourlyRate — this person's rate for this role. */
  staffPositionRate?: number | null
  /** Position.hourlyRate — the role's default rate. */
  positionRate?: number | null
  /** Staff.hourlyRate — the person's base rate. */
  staffRate?: number | null
}

function usable(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** The effective hourly rate, or null when no layer has one. */
export function resolveStaffRate({ staffPositionRate, positionRate, staffRate }: RateLayers): number | null {
  return usable(staffPositionRate) ?? usable(positionRate) ?? usable(staffRate)
}
