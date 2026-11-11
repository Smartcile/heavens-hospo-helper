// Staff-event email importer — pure copy-paste-LLM prompt + tolerant parser.
// The admin pastes an email into an external LLM, then pastes the JSON answer
// back. Rows are previewed/edited before the route creates DRAFT events.

import { extractJsonBlock, normaliseMenuName } from '@/lib/menu-import'
import { normaliseImportKey } from './similarity'
import type { ImportExisting, ImportIssue, ImportParseResult, ImportRow } from './types'

export interface StaffEventImportValues {
  title: string
  date: string // YYYY-MM-DD
  startTime: string // HH:mm ("" for all-day)
  endTime: string // HH:mm ("" for all-day)
  allDay: boolean
  location: string
  description: string
  attendanceRequired: boolean
  allowMaybe: boolean
  requireDeclineReason: boolean
  audienceKind: 'DEPARTMENT' | 'SECTION' | 'POSITION' | null
  audienceName: string | null
}

export function buildStaffEventImportPrompt({ venueName }: { venueName?: string } = {}): string {
  const venue = venueName?.trim() ? ` for ${venueName.trim()}` : ''
  return [
    `I'm importing a staff attendance event${venue} into a hospitality system.`,
    `Read the email or document and return STRICT JSON in one fenced \`\`\`json block.`,
    `Do not add commentary outside the block.`,
    ``,
    `JSON shape:`,
    `{`,
    `  "event": {`,
    `    "title": "TEAM BRIEFING",`,
    `    "date": "2026-11-12",`,
    `    "startTime": "18:00",`,
    `    "endTime": "20:00",`,
    `    "allDay": false,`,
    `    "location": "FUNCTION ROOM",`,
    `    "description": "Monthly all-staff briefing.",`,
    `    "attendanceRequired": true,`,
    `    "allowMaybe": true,`,
    `    "requireDeclineReason": false,`,
    `    "audience": "KITCHEN"`,
    `  }`,
    `}`,
    ``,
    `Rules:`,
    `- title and audience names are UPPERCASE, exactly as the venue uses them.`,
    `- date is YYYY-MM-DD. Times are 24-hour HH:mm.`,
    `- allDay replaces the times; leave startTime and endTime out for an all-day event.`,
    `- audience is optional. Prefix it with "DEPARTMENT:", "SECTION:" or "POSITION:" when the kind is not obvious, e.g. "POSITION: DUTY MANAGER".`,
    `- attendanceRequired, allowMaybe and requireDeclineReason are true or false.`,
    `- description is plain text. Never invent a date, time, place or audience that is not in the email.`,
    `- If the email contains several events, return only the first and say so in the description.`,
  ].join('\n')
}

function toStringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function toBool(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') return ['TRUE', 'YES', '1'].includes(value.trim().toUpperCase())
  return false
}

function datePart(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return match ? `${match[1]}-${match[2]}-${match[3]}` : ''
}

function timePart(value: string): string {
  if (!value) return ''
  const iso = value.match(/T(\d{2}):(\d{2})/)
  if (iso) return `${iso[1]}:${iso[2]}`
  const plain = value.match(/^(\d{1,2}):(\d{2})/)
  if (plain) return `${plain[1].padStart(2, '0')}:${plain[2]}`
  return ''
}

function parseAudience(source: Record<string, unknown>): { kind: StaffEventImportValues['audienceKind']; name: string | null } {
  const raw = toStringValue(source.audience ?? source.audienceName)
  if (raw) {
    const prefixed = raw.match(/^(DEPARTMENT|SECTION|POSITION)\s*:\s*(.+)$/i)
    if (prefixed) {
      return { kind: prefixed[1].toUpperCase() as StaffEventImportValues['audienceKind'], name: prefixed[2].trim().toUpperCase() }
    }
    return { kind: null, name: raw.toUpperCase() }
  }
  const department = toStringValue(source.department)
  if (department) return { kind: 'DEPARTMENT', name: department.toUpperCase() }
  const section = toStringValue(source.section)
  if (section) return { kind: 'SECTION', name: section.toUpperCase() }
  const position = toStringValue(source.position)
  if (position) return { kind: 'POSITION', name: position.toUpperCase() }
  return { kind: null, name: null }
}

function parseEvent(source: Record<string, unknown>, index: number): { row?: ImportRow<StaffEventImportValues>; issues: ImportIssue[] } {
  const issues: ImportIssue[] = []
  const id = `e${index}`
  const title = normaliseMenuName(source.title ?? source.name)
  if (!title) {
    return { issues: [{ code: 'STAFF_EVENT_TITLE_MISSING', severity: 'ERROR', rowId: id, message: 'THE EVENT HAS NO TITLE - SKIPPED' }] }
  }

  const allDay = toBool(source.allDay)
  const date = datePart(toStringValue(source.date ?? source.start ?? source.startsAt))
  if (!date) {
    issues.push({ code: 'STAFF_EVENT_DATE_INVALID', severity: 'ERROR', rowId: id, field: 'date', message: `"${title}" HAS NO VALID DATE` })
  }

  const startTime = allDay ? '' : timePart(toStringValue(source.startTime ?? source.start ?? source.startsAt))
  const endTime = allDay ? '' : timePart(toStringValue(source.endTime ?? source.end ?? source.endsAt))
  if (!allDay && !startTime) {
    issues.push({ code: 'STAFF_EVENT_START_INVALID', severity: 'ERROR', rowId: id, field: 'startTime', message: `"${title}" HAS NO VALID START TIME` })
  }
  if (!allDay && !endTime) {
    issues.push({ code: 'STAFF_EVENT_END_INVALID', severity: 'ERROR', rowId: id, field: 'endTime', message: `"${title}" HAS NO VALID END TIME` })
  }

  const audience = parseAudience(source)
  const hasError = issues.some((issue) => issue.severity === 'ERROR')

  return {
    row: {
      id,
      values: {
        title,
        date,
        startTime,
        endTime,
        allDay,
        location: toStringValue(source.location),
        description: toStringValue(source.description),
        attendanceRequired: toBool(source.attendanceRequired),
        allowMaybe: toBool(source.allowMaybe),
        requireDeclineReason: toBool(source.requireDeclineReason),
        audienceKind: audience.kind,
        audienceName: audience.name,
      },
      include: !hasError,
      action: hasError ? 'SKIP' : 'CREATE',
      match: { status: 'NEW' },
      issues,
    },
    issues,
  }
}

export function parseStaffEventImportAnswer(raw: string): ImportParseResult<StaffEventImportValues> | { error: string } {
  const json = extractJsonBlock(raw)
  if (!json) return { error: 'NO JSON FOUND IN THE ANSWER' }

  let root: unknown
  try {
    root = JSON.parse(json)
  } catch {
    return { error: 'THE ANSWER IS NOT VALID JSON' }
  }

  const container = Array.isArray(root) ? root : [root]
  const first = container[0]
  if (!first || typeof first !== 'object') return { error: 'NO EVENT FOUND IN THE ANSWER' }

  const object = first as Record<string, unknown>
  const events = Array.isArray(object.events) ? object.events : null
  const source = object.event && typeof object.event === 'object'
    ? (object.event as Record<string, unknown>)
    : events && events[0] && typeof events[0] === 'object'
      ? (events[0] as Record<string, unknown>)
      : object

  if (!source.title && !source.name) return { error: 'NO EVENT FOUND IN THE ANSWER' }

  const parsed = parseEvent(source, 0)
  if (!parsed.row) return { error: parsed.issues[0]?.message ?? 'NO EVENT FOUND IN THE ANSWER' }
  return { rows: [parsed.row], issues: parsed.issues }
}

/** Match a re-import of the same title + date to the existing event. */
export function matchStaffEventRows(
  rows: ImportRow<StaffEventImportValues>[],
  existing: ImportExisting[],
): ImportRow<StaffEventImportValues>[] {
  const byKey = new Map<string, ImportExisting>()
  for (const item of existing) byKey.set(normaliseImportKey(item.name), item)

  return rows.map((row) => {
    const key = normaliseImportKey(`${row.values.title}|${row.values.date}`)
    const match = byKey.get(key)
    if (!match) return row
    return {
      ...row,
      action: 'SKIP',
      include: false,
      match: { status: 'MATCH', targetId: match.id, label: match.name, deleted: !!match.deletedAt },
    }
  })
}
