// Food Health & Safety — pure, Prisma-free helpers. Single brain behind the
// Compliance hub: reading verdicts (GFMP thresholds), the TASKS health widget,
// and delivery temperature rules. Kept Prisma-free so the same code runs in
// the browser (live PASS/FAIL as a worker types) and on the server (the
// authoritative write path).

export type Verdict = 'PASS' | 'FAIL' | 'NA'
export type HsCategoryId = 'FOOD' | 'EQUIPMENT' | 'TEAM' | 'FACILITY'
export type StorageTypeId = 'AMBIENT' | 'CHILLED' | 'FROZEN'

export interface ReadingTaskLike {
  readingMin?: number | null
  readingMax?: number | null
  criticalMin?: number | null
  criticalMax?: number | null
}

export interface CompletionLike {
  valueStatus?: Verdict | null
  value?: number | null
  completedAt?: Date | string | null
}

export interface AlertLike {
  id: string
  status: 'OPEN' | 'RESOLVED'
  taskId?: string | null
}

export interface TaskLike {
  id: string
  completionType?: string | null
  status?: string | null
  readingMin?: number | null
  readingMax?: number | null
  criticalMin?: number | null
  criticalMax?: number | null
}

// ─── Reading verdicts ────────────────────────────────────────────────────────

/** PASS when value is inside [readingMin, readingMax]; NA when the task has no
 *  pass bounds configured (a plain TICK-like check). */
export function readingVerdict(value: number, task: ReadingTaskLike): Verdict {
  if (task.readingMin == null && task.readingMax == null) return 'NA'
  const minOk = task.readingMin == null || value >= task.readingMin
  const maxOk = task.readingMax == null || value <= task.readingMax
  return minOk && maxOk ? 'PASS' : 'FAIL'
}

/** True when the value leaves the task's critical danger band — the trigger
 *  for a CRITICAL alert + auto Notice. Only configured bounds apply. */
export function criticalVerdict(value: number, task: ReadingTaskLike): boolean {
  if (task.criticalMin != null && value < task.criticalMin) return true
  if (task.criticalMax != null && value > task.criticalMax) return true
  return false
}

// ─── Delivery temperature rules (NZ GFMP) ───────────────────────────────────

/** Max accepted arrival temperature per storage type. AMBIENT has no rule. */
export function storageTypeTempMax(storageType: StorageTypeId | string | null | undefined): number | null {
  if (storageType === 'CHILLED') return 5
  if (storageType === 'FROZEN') return -18
  return null
}

/** Per-line verdict: temp ≤ the product's storage-type max. NA for AMBIENT or
 *  a missing reading. */
export function deliveryLineVerdict(temp: number | null | undefined, storageType: StorageTypeId | string | null | undefined): Verdict {
  const max = storageTypeTempMax(storageType)
  if (temp == null || max == null) return 'NA'
  return temp <= max ? 'PASS' : 'FAIL'
}

/** Vehicle verdict against the strictest rule among the line items (a frozen
 *  load travels at -18°C even if most of it is chilled). */
export function vehicleVerdict(vehicleTemp: number | null | undefined, itemStorageTypes: (StorageTypeId | string | null | undefined)[]): Verdict {
  if (vehicleTemp == null) return 'NA'
  const rules = itemStorageTypes.map(storageTypeTempMax).filter((m): m is number => m != null)
  if (rules.length === 0) return 'NA'
  const strictest = Math.min(...rules)
  return vehicleTemp <= strictest ? 'PASS' : 'FAIL'
}

/** Severity of a failed delivery line — ordinary over-temp is a WARNING, but a
 *  thawed frozen load (temp > 0°C) or a badly hot chilled load (temp > 10°C)
 *  is CRITICAL (goods likely lost). */
export function deliveryAlertSeverity(temp: number | null | undefined, storageType: StorageTypeId | string | null | undefined): 'WARNING' | 'CRITICAL' {
  if (temp == null) return 'WARNING'
  if (storageType === 'FROZEN' && temp > 0) return 'CRITICAL'
  if (storageType === 'CHILLED' && temp > 10) return 'CRITICAL'
  return 'WARNING'
}

// ─── Health widget (Chomp-style "TASKS PROVED" / "TASKS WITH ALERTS") ───────

export interface HealthMetrics {
  provedX: number // active READING tasks with ≥1 PASS completion in the window
  provedY: number // active READING tasks in scope
  alertX: number // active tasks with ≥1 OPEN alert
  alertY: number // active tasks in scope
}

/** Counts are computed over the supplied windows — the caller fetches
 *  completions for the last `days` days (per venue-local day) and open alerts.
 *  Only ACTIVE tasks count; DRAFT/ARCHIVED are staged or history. */
export function healthWidgetMetrics(
  tasks: TaskLike[],
  completionsByTask: Record<string, CompletionLike[]>,
  openAlerts: AlertLike[],
): HealthMetrics {
  const active = tasks.filter((t) => t.status === 'ACTIVE' || t.status == null)
  const readingTasks = active.filter((t) => t.completionType === 'READING')
  const alertsByTask = new Map<string, number>()
  for (const a of openAlerts) {
    if (!a.taskId) continue
    alertsByTask.set(a.taskId, (alertsByTask.get(a.taskId) ?? 0) + 1)
  }
  return {
    provedX: readingTasks.filter((t) => (completionsByTask[t.id] ?? []).some((c) => c.valueStatus === 'PASS')).length,
    provedY: readingTasks.length,
    alertX: active.filter((t) => (alertsByTask.get(t.id) ?? 0) > 0).length,
    alertY: active.length,
  }
}

// ─── GFMP defaults (NZ Food Act 2014 / GFMP) ────────────────────────────────

/** Safe-range defaults per common check. Pass bounds seed `readingMin/Max`,
 *  critical bounds the wider danger band. All editable per task. */
export const GFMP_DEFAULTS: Record<string, { unit: string; readingMin?: number; readingMax?: number; criticalMin?: number; criticalMax?: number }> = {
  FRIDGE: { unit: '°C', readingMin: 0, readingMax: 5, criticalMax: 10 },
  FREEZER: { unit: '°C', readingMin: -25, readingMax: -18, criticalMin: -30, criticalMax: -12 },
  COOK: { unit: '°C', readingMin: 75, criticalMin: 60 },
  REHEAT: { unit: '°C', readingMin: 75, criticalMin: 60 },
  HOT_HOLD: { unit: '°C', readingMin: 60 },
  COOL: { unit: '°C', readingMax: 20 },
  PROBE_CAL: { unit: '°C', readingMin: -1, readingMax: 1, criticalMin: -2, criticalMax: 2 },
}

/** Which GFMP default a new EQUIPMENT reading task should start from, derived
 *  from the linked inventory item's storage type (a fridge → FRIDGE rules,
 *  a freezer → FREEZER rules). Falls back to a sensible generic band. */
export function gfmpDefaultFor(storageType: StorageTypeId | string | null | undefined): (typeof GFMP_DEFAULTS)[keyof typeof GFMP_DEFAULTS] {
  if (storageType === 'FROZEN') return GFMP_DEFAULTS.FREEZER
  if (storageType === 'CHILLED') return GFMP_DEFAULTS.FRIDGE
  return GFMP_DEFAULTS.PROBE_CAL
}

/** Human label for the verdict — "PASS: 3/3" style tail counts come from the
 *  caller's completions; this renders the badge text itself. */
export function verdictLabel(verdict: Verdict): string {
  if (verdict === 'PASS') return 'PASS'
  if (verdict === 'FAIL') return 'FAIL'
  return '—'
}

/** "0–5°C" / "≥ 60°C" / "≤ 20°C" — the human band label for a reading task. */
export function describeBand(task: ReadingTaskLike, unit?: string | null): string {
  const u = unit ?? ''
  const hasMin = task.readingMin != null
  const hasMax = task.readingMax != null
  if (hasMin && hasMax) return `${task.readingMin}–${task.readingMax}${u}`
  if (hasMin) return `≥ ${task.readingMin}${u}`
  if (hasMax) return `≤ ${task.readingMax}${u}`
  return '—'
}

/** Alert message for an out-of-range reading. */
export function readingAlertMessage(title: string, value: number, task: ReadingTaskLike, unit?: string | null): string {
  return `${title} recorded ${value}${unit ?? ''} — expected ${describeBand(task, unit)}`
}
