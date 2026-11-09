// Task importer adapter (PR 3 of #89). Pure — no Prisma imports.
//
// Imported tasks are always created as DRAFT by the route, so nothing reaches
// the floor unreviewed. Department / section / checklist are referenced BY NAME;
// an unknown name is a row ERROR ("MAP OR SKIP"), never invented.

import { extractJsonBlock, normaliseMenuName } from '@/lib/menu-import'
import { markdownToHtml } from './markdown'
import { findSimilar, normaliseImportKey } from './similarity'
import type { ImportExisting, ImportIssue, ImportParseResult, ImportRow } from './types'

export type TaskImportScheduleType = 'DAILY' | 'WEEKLY' | 'MONTHLY'
export type TaskImportCompletionType = 'TICK' | 'TICK_NOTE' | 'TICK_PHOTO'

export interface TaskImportValues {
  title: string
  descriptionHtml: string
  departmentName: string | null
  sectionName: string | null
  checklistName: string | null
  completionType: TaskImportCompletionType
  scheduleType: TaskImportScheduleType
  scheduleDays: number[]
  monthlyOption: string | null
  monthlyDay: number | null
}

export interface TaskImportRefs {
  departments: { id: string; name: string }[]
  sections: { id: string; name: string; departmentName?: string | null }[]
  checklists: { id: string; name: string }[]
}

const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const MONTHLY_OPTIONS = new Set([
  'FIRST_DAY', 'LAST_DAY', 'FIFTEENTH', 'FIRST_WEEKDAY', 'LAST_WEEKDAY',
  'FIRST_MONDAY', 'LAST_FRIDAY', 'SPECIFIC_DAY',
])
const COMPLETION_TYPES: TaskImportCompletionType[] = ['TICK', 'TICK_NOTE', 'TICK_PHOTO']

export function buildTaskImportPrompt({ venueName }: { venueName?: string } = {}): string {
  const venue = venueName?.trim() ? ` for ${venueName.trim()}` : ''
  return [
    `I'm importing operational tasks${venue} into a hospitality system.`,
    `Read the attached document (PDF, photo or text) and return STRICT JSON in one fenced \`\`\`json block.`,
    `Do not add commentary outside the block.`,
    ``,
    `JSON shape:`,
    `{`,
    `  "tasks": [`,
    `    {`,
    `      "title": "WIPE DOWN BENCHES",`,
    `      "description": "Spray, wipe and dry every surface.",`,
    `      "department": "KITCHEN",`,
    `      "section": "PREP",`,
    `      "checklist": "OPENING",`,
    `      "completionType": "TICK",`,
    `      "scheduleType": "DAILY",`,
    `      "scheduleDays": [],`,
    `      "monthlyOption": null,`,
    `      "monthlyDay": null`,
    `    }`,
    `  ]`,
    `}`,
    ``,
    `Rules:`,
    `- Keep title, department, section and checklist names UPPERCASE and exactly as the venue uses them.`,
    `- section is optional; department is optional (a task can be venue-wide).`,
    `- checklist is optional: the name of an existing list to add the task to.`,
    `- completionType is TICK, TICK_NOTE or TICK_PHOTO.`,
    `- scheduleType is DAILY, WEEKLY or MONTHLY.`,
    `- For WEEKLY, scheduleDays is a list of SUN..SAT (or 0-6).`,
    `- For MONTHLY, monthlyOption is FIRST_DAY, LAST_DAY, FIFTEENTH, FIRST_WEEKDAY, LAST_WEEKDAY, FIRST_MONDAY, LAST_FRIDAY or SPECIFIC_DAY (with monthlyDay 1-31).`,
    `- description is plain text or simple Markdown. Never invent names or schedules.`,
  ].join('\n')
}

function toStringOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const cleaned = value.replace(/[^0-9.\-]/g, '')
  const n = Number(cleaned)
  return cleaned && Number.isFinite(n) ? n : null
}

function parseScheduleDays(raw: unknown): { days: number[]; invalid: string[] } {
  const values = Array.isArray(raw) ? raw : []
  const days = new Set<number>()
  const invalid: string[] = []
  for (const value of values) {
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 6) {
      days.add(value)
      continue
    }
    if (typeof value === 'string') {
      const text = value.trim().toUpperCase()
      const index = DAY_NAMES.indexOf(text)
      if (index >= 0) { days.add(index); continue }
      const n = Number(text)
      if (Number.isInteger(n) && n >= 0 && n <= 6) { days.add(n); continue }
      invalid.push(text)
    } else {
      invalid.push(String(value))
    }
  }
  return { days: [...days].sort((a, b) => a - b), invalid }
}

export function parseTaskImportAnswer(raw: string): ImportParseResult<TaskImportValues> | { error: string } {
  const json = extractJsonBlock(raw)
  if (!json) return { error: 'NO JSON FOUND IN THE ANSWER' }

  let root: Record<string, unknown>
  try {
    root = JSON.parse(json) as Record<string, unknown>
  } catch {
    return { error: 'THE ANSWER IS NOT VALID JSON' }
  }

  const list = Array.isArray(root.tasks) ? root.tasks : null
  if (!list) return { error: 'NO TASKS FOUND IN THE ANSWER' }

  const rows: ImportRow<TaskImportValues>[] = []
  const issues: ImportIssue[] = []
  const seen = new Map<string, string>()

  list.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') return
    const source = entry as Record<string, unknown>
    const title = normaliseMenuName(source.title ?? source.name)
    if (!title) {
      issues.push({ code: 'TASK_TITLE_MISSING', severity: 'ERROR', message: `TASK #${index + 1} HAS NO TITLE - SKIPPED` })
      return
    }

    const id = `t${index}`
    const rowIssues: ImportIssue[] = []
    const key = normaliseImportKey(title)
    const duplicateOf = seen.get(key)
    if (!duplicateOf) seen.set(key, id)

    const rawCompletion = String(source.completionType ?? source.completion ?? 'TICK').trim().toUpperCase()
    const completionType = COMPLETION_TYPES.includes(rawCompletion as TaskImportCompletionType)
      ? (rawCompletion as TaskImportCompletionType)
      : 'TICK'
    if (completionType !== rawCompletion) {
      rowIssues.push({ code: 'COMPLETION_TYPE_INVALID', severity: 'WARNING', rowId: id, message: `"${title}" COMPLETION "${rawCompletion}" UNKNOWN - ASSUMED TICK` })
    }

    const rawSchedule = String(source.scheduleType ?? source.schedule ?? 'DAILY').trim().toUpperCase()
    const scheduleType: TaskImportScheduleType =
      rawSchedule === 'WEEKLY' || rawSchedule === 'MONTHLY' ? rawSchedule : 'DAILY'
    if (scheduleType !== rawSchedule) {
      rowIssues.push({ code: 'SCHEDULE_TYPE_INVALID', severity: 'WARNING', rowId: id, message: `"${title}" SCHEDULE "${rawSchedule}" UNKNOWN - ASSUMED DAILY` })
    }

    const parsedDays = parseScheduleDays(source.scheduleDays ?? source.days)
    if (parsedDays.invalid.length > 0) {
      rowIssues.push({ code: 'SCHEDULE_DAY_INVALID', severity: 'WARNING', rowId: id, message: `"${title}" IGNORED UNKNOWN DAY(S): ${parsedDays.invalid.join(', ')}` })
    }
    if (scheduleType === 'WEEKLY' && parsedDays.days.length === 0) {
      rowIssues.push({ code: 'WEEKLY_DAYS_MISSING', severity: 'ERROR', rowId: id, message: `"${title}" IS WEEKLY BUT HAS NO VALID DAYS` })
    }

    const rawMonthly = toStringOrNull(source.monthlyOption)
    const monthlyOption = rawMonthly ? rawMonthly.toUpperCase() : null
    if (scheduleType === 'MONTHLY') {
      if (!monthlyOption || !MONTHLY_OPTIONS.has(monthlyOption)) {
        rowIssues.push({ code: 'MONTHLY_OPTION_INVALID', severity: 'ERROR', rowId: id, message: `"${title}" HAS AN INVALID MONTHLY OPTION` })
      }
    }
    const monthlyDay = monthlyOption === 'SPECIFIC_DAY' ? toNumber(source.monthlyDay) : null

    const description = toStringOrNull(source.description)

    if (duplicateOf) {
      rowIssues.push({ code: 'DUPLICATE_IN_FILE', severity: 'WARNING', rowId: id, message: `DUPLICATE "${title}" - ONLY THE FIRST IS KEPT` })
    }

    rows.push({
      id,
      values: {
        title,
        descriptionHtml: description ? markdownToHtml(description) : '',
        departmentName: toStringOrNull(source.department ?? source.departmentName)?.toUpperCase() ?? null,
        sectionName: toStringOrNull(source.section ?? source.sectionName)?.toUpperCase() ?? null,
        checklistName: toStringOrNull(source.checklist ?? source.checklistName)?.toUpperCase() ?? null,
        completionType,
        scheduleType,
        scheduleDays: parsedDays.days,
        monthlyOption: scheduleType === 'MONTHLY' ? monthlyOption : null,
        monthlyDay: monthlyDay != null ? Math.min(31, Math.max(1, Math.trunc(monthlyDay))) : null,
      },
      include: !duplicateOf,
      action: duplicateOf ? 'SKIP' : 'CREATE',
      match: duplicateOf ? { status: 'DUPLICATE_IN_FILE', label: duplicateOf } : { status: 'NEW' },
      issues: rowIssues,
    })
  })

  if (rows.length === 0) return { error: 'NO TASKS FOUND IN THE ANSWER' }
  return { rows, issues }
}

export function matchTaskRows(
  rows: ImportRow<TaskImportValues>[],
  existing: ImportExisting[],
): ImportRow<TaskImportValues>[] {
  const byKey = new Map<string, ImportExisting[]>()
  for (const row of existing) {
    const key = normaliseImportKey(row.name)
    const list = byKey.get(key) ?? []
    list.push(row)
    byKey.set(key, list)
  }

  return rows.map((row) => {
    if (row.match?.status === 'DUPLICATE_IN_FILE') return row
    const key = normaliseImportKey(row.values.title)
    const exact = byKey.get(key) ?? []
    if (exact.length === 1) {
      const target = exact[0]
      return {
        ...row,
        action: 'SKIP',
        include: false,
        match: { status: 'MATCH', targetId: target.id, label: target.name, deleted: !!target.deletedAt },
      }
    }
    if (exact.length > 1) {
      return {
        ...row,
        action: 'SKIP',
        include: false,
        match: { status: 'AMBIGUOUS', label: `${exact.length} EXISTING TASKS` },
        issues: [...row.issues, { code: 'AMBIGUOUS_NAME', severity: 'ERROR', message: `"${row.values.title}" MATCHES ${exact.length} TASKS - RENAME OR SKIP` }],
      }
    }
    const similar = findSimilar(row.values.title, existing)
    if (similar) {
      return {
        ...row,
        action: 'SKIP',
        include: false,
        match: { status: 'SIMILAR', targetId: similar.target.id, label: similar.target.name, score: similar.score, deleted: !!similar.target.deletedAt },
      }
    }
    return row
  })
}

function findExact<T extends { name: string }>(name: string, list: T[]): T | 'AMBIGUOUS' | null {
  const key = normaliseImportKey(name)
  const matches = list.filter((row) => normaliseImportKey(row.name) === key)
  if (matches.length === 1) return matches[0]
  if (matches.length > 1) return 'AMBIGUOUS'
  return null
}

/** Resolve department / section / checklist names; unknown = row ERROR + SKIP. */
export function resolveTaskImportRefs(
  rows: ImportRow<TaskImportValues>[],
  refs: TaskImportRefs,
): ImportRow<TaskImportValues>[] {
  return rows.map((row) => {
    const issues: ImportIssue[] = [...row.issues]

    if (row.values.departmentName) {
      const found = findExact(row.values.departmentName, refs.departments)
      if (!found) issues.push({ code: 'DEPARTMENT_NOT_FOUND', severity: 'ERROR', rowId: row.id, field: 'departmentName', message: `DEPARTMENT "${row.values.departmentName}" NOT FOUND - MAP OR SKIP` })
      else if (found === 'AMBIGUOUS') issues.push({ code: 'DEPARTMENT_AMBIGUOUS', severity: 'ERROR', rowId: row.id, field: 'departmentName', message: `DEPARTMENT "${row.values.departmentName}" MATCHES MULTIPLE - MAP OR SKIP` })
    }
    if (row.values.sectionName) {
      const found = findExact(row.values.sectionName, refs.sections)
      if (!found) issues.push({ code: 'SECTION_NOT_FOUND', severity: 'ERROR', rowId: row.id, field: 'sectionName', message: `SECTION "${row.values.sectionName}" NOT FOUND - MAP OR SKIP` })
      else if (found === 'AMBIGUOUS') issues.push({ code: 'SECTION_AMBIGUOUS', severity: 'ERROR', rowId: row.id, field: 'sectionName', message: `SECTION "${row.values.sectionName}" MATCHES MULTIPLE - MAP OR SKIP` })
    }
    if (row.values.checklistName) {
      const found = findExact(row.values.checklistName, refs.checklists)
      if (!found) issues.push({ code: 'CHECKLIST_NOT_FOUND', severity: 'ERROR', rowId: row.id, field: 'checklistName', message: `CHECKLIST "${row.values.checklistName}" NOT FOUND - MAP OR SKIP` })
      else if (found === 'AMBIGUOUS') issues.push({ code: 'CHECKLIST_AMBIGUOUS', severity: 'ERROR', rowId: row.id, field: 'checklistName', message: `CHECKLIST "${row.values.checklistName}" MATCHES MULTIPLE - MAP OR SKIP` })
    }

    if (!issues.some((issue) => issue.severity === 'ERROR')) return { ...row, issues }
    return { ...row, issues, action: 'SKIP', include: false }
  })
}
