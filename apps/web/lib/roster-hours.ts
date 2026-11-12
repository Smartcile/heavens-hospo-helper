// Pure roster hour-target helpers. Roster planning visibility only — these
// values never feed payroll.
//
// A person can carry three weekly hour targets:
//   min    — contractual minimum hours (a hard floor; under it is RED)
//   wanted — casual staff's requested hours (a soft goal)
//   target — the manager's aim for them (a soft goal)
//
// The headline level is:
//   under-min  → below the contractual minimum
//   under-goal → at/above min (or no min) but below any configured goal
//   met        → exactly at the highest configured goal
//   over       → above the highest configured goal
//   none       → no targets configured

export type HourGoalKind = 'min' | 'wanted' | 'target'

export interface HourTargets {
  minHoursPerWeek?: number | null
  wantedHoursPerWeek?: number | null
  targetHoursPerWeek?: number | null
}

export interface HourGoal {
  kind: HourGoalKind
  hours: number
}

export type HourTargetLevel = 'none' | 'under-min' | 'under-goal' | 'met' | 'over'

export interface HourTargetStatus {
  hours: number
  level: HourTargetLevel
  goals: HourGoal[]
  /** The highest configured goal — the headline bar. */
  goal: HourGoal | null
  /** Every configured goal still unmet, in min → wanted → target order. */
  unmet: HourGoal[]
  label: string
}

const GOAL_ORDER: HourGoalKind[] = ['min', 'wanted', 'target']

const FIELD: Record<HourGoalKind, keyof HourTargets> = {
  min: 'minHoursPerWeek',
  wanted: 'wantedHoursPerWeek',
  target: 'targetHoursPerWeek',
}

function usable(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/** Configured goals, min → wanted → target. Non-positive/null targets ignored. */
export function hourGoals(targets: HourTargets): HourGoal[] {
  const goals: HourGoal[] = []
  for (const kind of GOAL_ORDER) {
    const hours = usable(targets[FIELD[kind]])
    if (hours != null) goals.push({ kind, hours })
  }
  return goals
}

/** "MIN 20 · WANTED 32 · TARGET 38" (or an empty string when none are set). */
export function describeHourTargets(targets: HourTargets): string {
  return hourGoals(targets)
    .map((g) => `${g.kind.toUpperCase()} ${formatHours(g.hours)}`)
    .join(' · ')
}

export function formatHours(hours: number): string {
  const value = round2(hours)
  return `${Number.isInteger(value) ? value : value.toFixed(2).replace(/0$/, '')}H`
}

/**
 * Resolve a person's scheduled paid hours against their configured targets.
 * `scheduledHours` is the sum of `shiftPaidHours` for the week.
 */
export function hourTargetStatus(scheduledHours: number, targets: HourTargets): HourTargetStatus {
  const hours = round2(Number.isFinite(scheduledHours) ? scheduledHours : 0)
  const goals = hourGoals(targets)
  const unmet = goals.filter((g) => hours < g.hours)

  if (goals.length === 0) {
    return { hours, level: 'none', goals, goal: null, unmet, label: `${formatHours(hours)} SCHEDULED` }
  }

  const goal = goals.reduce((best, g) => (g.hours > best.hours ? g : best))
  const min = goals.find((g) => g.kind === 'min')
  const level: HourTargetLevel =
    min && hours < min.hours
      ? 'under-min'
      : unmet.length > 0
        ? 'under-goal'
        : hours > goal.hours
          ? 'over'
          : 'met'

  return { hours, level, goals, goal, unmet, label: hourStatusLabel(hours, level, unmet, goal) }
}

function hourStatusLabel(hours: number, level: HourTargetLevel, unmet: HourGoal[], goal: HourGoal): string {
  if (level === 'under-min') {
    const min = unmet.find((g) => g.kind === 'min')!
    return `${formatHours(hours)} · ${formatHours(min.hours - hours)} UNDER MIN`
  }
  if (level === 'under-goal') {
    const next = unmet[0]
    return `${formatHours(hours)} · ${formatHours(next.hours - hours)} UNDER ${next.kind.toUpperCase()}`
  }
  if (level === 'over') {
    return `${formatHours(hours)} · ${formatHours(hours - goal.hours)} OVER ${goal.kind.toUpperCase()}`
  }
  return `${formatHours(hours)} · ${goal.kind.toUpperCase()} MET`
}

/**
 * Parse a weekly hour target from an API payload. Accepts a finite,
 * non-negative number (or a numeric string). Blank/null/undefined means "not
 * set". Anything else is rejected so a negative target can never be stored.
 */
export function parseHourTarget(value: unknown): { ok: boolean; value: number | null } {
  if (value === null || value === undefined || value === '') return { ok: true, value: null }
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n < 0) return { ok: false, value: null }
  return { ok: true, value: Math.round(n * 100) / 100 }
}

/** Tailwind classes for the roster hour-status chip. */
export function hourStatusTone(level: HourTargetLevel): string {
  switch (level) {
    case 'under-min':
      return 'border-danger text-danger'
    case 'under-goal':
      return 'border-warning text-warning'
    case 'met':
    case 'over':
      return 'border-success text-success'
    default:
      return 'border-grey-mid text-grey-light'
  }
}
