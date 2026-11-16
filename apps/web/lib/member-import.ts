// Pure HubSpot-member CSV parsing, cleaning, family collapse, AI-clean prompt
// and SwiftPOS export. No Prisma and no Node, so the import preview can run on
// the client and the commit route can reuse exactly the same rules.

import { parseCsv, toCsv } from './csv'
import {
  buildFamilyLastName,
  dedupeSurnameFromFirstName,
  isInactiveStatus,
  nameMatchKey,
  normaliseMembershipNumber,
  normaliseSpaces,
  parseFamilyLastName,
  titleCaseName,
} from './member-name'

export type MemberIssueSeverity = 'ERROR' | 'WARNING' | 'INFO'

export interface MemberIssue {
  code: string
  severity: MemberIssueSeverity
  rowId?: string
  message: string
}

export interface MemberColumnMap {
  firstName: string
  lastName: string
  membershipNumber: string
  memberType?: string
  email?: string
  phone?: string
  status?: string
  interests?: string
  company?: string
  externalId?: string
}

export interface ExistingMember {
  firstName: string
  lastName: string
  isActive: boolean
  isPrimary: boolean
  familySurnames: string | null
}

export interface MemberImportRow {
  id: string
  sourceRow: number
  membershipNumber: string
  baseNumber: string
  suffix: string
  firstName: string
  lastName: string
  displayName: string
  memberType: string
  email: string
  phone: string
  memberInterests: string
  company: string
  externalId: string
  isFamily: boolean
  isPrimary: boolean
  familySurnames: string
  isActive: boolean
  activeSource: 'STATUS' | 'DEFAULT' | 'MANUAL'
  include: boolean
  needsAi: boolean
  existing?: ExistingMember
  action: 'NEW' | 'UPDATE' | 'UNCHANGED'
  issues: MemberIssue[]
  rawSurnames: string[]
}

export interface FamilyPreview {
  key: string
  membershipNumber: string
  surnames: string
  primaryRowId: string
  rowIds: string[]
}

export interface MemberImportSummary {
  rows: number
  included: number
  memberships: number
  new: number
  updated: number
  unchanged: number
  inactive: number
  errors: number
  families: number
}

export interface MemberImportPreview {
  headers: string[]
  detected: Partial<MemberColumnMap>
  used: Partial<MemberColumnMap>
  missing: string[]
  rows: MemberImportRow[]
  families: FamilyPreview[]
  issues: MemberIssue[]
  summary: MemberImportSummary
}

export interface BuildMemberPreviewOptions {
  columnMap?: Partial<MemberColumnMap>
  existing?: Record<string, ExistingMember>
  /** base number -> the primary member's given name (keeps a family primary stable) */
  previousPrimaryName?: Record<string, string>
}

export interface CommitMemberRow {
  membershipNumber: string
  baseNumber: string
  firstName: string
  lastName: string
  memberType: string
  email: string
  phone: string
  memberInterests: string
  company: string
  externalId: string
  isFamily: boolean
  isPrimary: boolean
  familySurnames: string
  isActive: boolean
  sourceRowId?: string
}

function headerKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

const FIELD_CANDIDATES: Record<keyof MemberColumnMap, string[]> = {
  firstName: ['firstname', 'givenname', 'first'],
  lastName: ['lastname', 'surname', 'familyname', 'last'],
  membershipNumber: [
    'membershipnumber',
    'membernumber',
    'raycmembernumber',
    'raycmembershipnumber',
    'number',
    'memberno',
  ],
  memberType: ['membertype', 'membershiptype', 'category', 'membershipcategory'],
  email: ['email', 'emailaddress'],
  phone: ['phonenumber', 'phone', 'mobile', 'mobilenumber', 'homephone'],
  status: ['memberstatus', 'membershipstatus', 'status', 'retired', 'activestatus'],
  interests: ['memberinterests', 'interests'],
  company: ['associatedcompany', 'company', 'organisation', 'organization'],
  externalId: ['recordid', 'id', 'contactid'],
}

export function detectMemberColumns(headers: string[]): Partial<MemberColumnMap> {
  const byKey = new Map<string, string>()
  for (const header of headers) byKey.set(headerKey(header), header)

  const result: Partial<MemberColumnMap> = {}
  for (const field of Object.keys(FIELD_CANDIDATES) as (keyof MemberColumnMap)[]) {
    const candidates = FIELD_CANDIDATES[field]
    let found = candidates.map((c) => byKey.get(c)).find(Boolean)
    if (!found) {
      // Tolerant fallback for decorated headers ("RAYC Membership Number").
      for (const candidate of candidates) {
        found = headers.find((h) => headerKey(h).includes(candidate))
        if (found) break
      }
    }
    if (found) result[field] = found
  }
  return result
}

function cell(row: Record<string, string>, column: string | undefined): string {
  return column ? normaliseSpaces(row[column] ?? '') : ''
}

function resolveColumnMap(
  headers: string[],
  detected: Partial<MemberColumnMap>,
  override?: Partial<MemberColumnMap>,
): Partial<MemberColumnMap> {
  const headerSet = new Set(headers)
  const used: Partial<MemberColumnMap> = { ...detected }
  if (override) {
    for (const field of Object.keys(FIELD_CANDIDATES) as (keyof MemberColumnMap)[]) {
      const value = override[field]
      if (typeof value === 'string' && headerSet.has(value)) used[field] = value
    }
  }
  return used
}

function needsAiReview(rawFirst: string, rawLast: string, isFamily: boolean): boolean {
  if (isFamily) return true
  const words = `${rawFirst} ${rawLast}`.split(/\s+/).filter(Boolean)
  if (words.some((w) => w.length > 1 && w === w.toUpperCase())) return true
  if (words.some((w) => w.length > 2 && w === w.toLowerCase())) return true
  return false
}

function buildAction(row: MemberImportRow): 'NEW' | 'UPDATE' | 'UNCHANGED' {
  const existing = row.existing
  if (!existing) return 'NEW'
  const sameLast = normaliseSpaces(existing.familySurnames || existing.lastName).toLowerCase()
  const rowLast = normaliseSpaces(row.isFamily ? row.familySurnames : row.lastName).toLowerCase()
  if (
    existing.firstName.toLowerCase() === row.firstName.toLowerCase() &&
    sameLast === rowLast &&
    existing.isActive === row.isActive &&
    existing.isPrimary === row.isPrimary
  ) {
    return 'UNCHANGED'
  }
  return 'UPDATE'
}

function chooseFamilyPrimary(
  rows: MemberImportRow[],
  base: string,
  existing: ExistingMember | undefined,
  previousPrimaryName: Record<string, string> | undefined,
): MemberImportRow {
  const preferredName = previousPrimaryName?.[base] || existing?.firstName
  if (preferredName) {
    const key = nameMatchKey(preferredName)
    const match = rows.find((r) => nameMatchKey(r.firstName) === key)
    if (match) return match
  }
  return rows[0]
}

export function buildMemberPreview(
  text: string,
  options: BuildMemberPreviewOptions = {},
): MemberImportPreview {
  const { headers, rows: rawRows } = parseCsv(text)
  const detected = detectMemberColumns(headers)
  const used = resolveColumnMap(headers, detected, options.columnMap)
  const missing: string[] = []
  if (!used.membershipNumber) missing.push('MEMBERSHIP NUMBER')
  if (!used.firstName) missing.push('FIRST NAME')
  if (!used.lastName) missing.push('LAST NAME')

  const issues: MemberIssue[] = []
  const rows: MemberImportRow[] = []

  if (missing.length > 0) {
    issues.push({
      code: 'MISSING_COLUMNS',
      severity: 'ERROR',
      message: `COULD NOT FIND ${missing.join(', ')} IN THE CSV HEADER. MAP THE COLUMNS BEFORE IMPORTING.`,
    })
  }

  rawRows.forEach((raw, index) => {
    const sourceRow = index + 2
    const id = `r${sourceRow}`
    const number = normaliseMembershipNumber(cell(raw, used.membershipNumber))
    const rawFirst = cell(raw, used.firstName)
    const rawLast = cell(raw, used.lastName)
    const familyLast = parseFamilyLastName(rawLast)
    const dedupe = dedupeSurnameFromFirstName(rawFirst, rawLast)
    const statusValue = cell(raw, used.status)
    const rowIssues: MemberIssue[] = []

    const isFamily = Boolean(number?.isFamily) || familyLast.isFamily
    const firstName = dedupe.firstName || titleCaseName(rawFirst)
    const lastName =
      familyLast.surnames[0] ?? titleCaseName(rawLast, { surname: true })

    if (!number) {
      rowIssues.push({
        code: 'INVALID_MEMBERSHIP_NUMBER',
        severity: 'ERROR',
        rowId: id,
        message: cell(raw, used.membershipNumber)
          ? `MEMBERSHIP NUMBER "${cell(raw, used.membershipNumber)}" IS NOT NUMERIC`
          : 'MEMBERSHIP NUMBER IS MISSING',
      })
    }
    if (!firstName && !lastName) {
      rowIssues.push({
        code: 'MISSING_NAME',
        severity: 'WARNING',
        rowId: id,
        message: 'NO FIRST OR LAST NAME',
      })
    }
    if (dedupe.removed.length > 0) {
      rowIssues.push({
        code: 'DUPLICATE_SURNAME',
        severity: 'INFO',
        rowId: id,
        message: `REMOVED REPEATED SURNAME TOKEN: ${dedupe.removed.join(' ')}`,
      })
    }

    const baseNumber = number?.base ?? ''
    const existing = baseNumber ? options.existing?.[baseNumber] : undefined
    const isActive = statusValue ? !isInactiveStatus(statusValue) : true
    const row: MemberImportRow = {
      id,
      sourceRow,
      membershipNumber: baseNumber || cell(raw, used.membershipNumber),
      baseNumber,
      suffix: number?.suffix ?? '',
      firstName,
      lastName,
      displayName: titleCaseName(`${firstName} ${lastName}`),
      memberType: cell(raw, used.memberType),
      email: cell(raw, used.email),
      phone: cell(raw, used.phone),
      memberInterests: cell(raw, used.interests),
      company: cell(raw, used.company),
      externalId: cell(raw, used.externalId),
      isFamily,
      isPrimary: true,
      familySurnames: '',
      isActive,
      activeSource: statusValue ? 'STATUS' : 'DEFAULT',
      include: Boolean(number),
      needsAi: needsAiReview(rawFirst, rawLast, isFamily),
      existing,
      action: 'NEW',
      issues: rowIssues,
      rawSurnames: familyLast.surnames.length > 0 ? familyLast.surnames : [lastName].filter(Boolean),
    }
    rows.push(row)
  })

  // Collapse families by base number. A family can be indicated by a dot
  // suffix, a `(Family)` marker, or simply more than one row with the same
  // base number.
  const byBase = new Map<string, MemberImportRow[]>()
  for (const row of rows) {
    if (!row.baseNumber) continue
    const list = byBase.get(row.baseNumber) ?? []
    list.push(row)
    byBase.set(row.baseNumber, list)
  }

  const families: FamilyPreview[] = []
  for (const [base, group] of Array.from(byBase.entries())) {
    if (group.length < 2 && !group.some((r) => r.isFamily)) continue
    const existing = options.existing?.[base]
    const primary = chooseFamilyPrimary(group, base, existing, options.previousPrimaryName)
    const surnames: string[] = []
    const seen = new Set<string>()
    for (const row of group) {
      for (const surname of row.rawSurnames) {
        const key = nameMatchKey(surname)
        if (!key || seen.has(key)) continue
        seen.add(key)
        surnames.push(surname)
      }
    }
    const familySurnames = buildFamilyLastName(surnames.length > 0 ? surnames : [primary.lastName])
    for (const row of group) {
      row.isFamily = true
      row.isPrimary = row.id === primary.id
      row.familySurnames = familySurnames
      if (!row.isPrimary) {
        row.issues.push({
          code: 'FAMILY_MEMBER',
          severity: 'INFO',
          rowId: row.id,
          message: `FOLDED INTO FAMILY ${base} — PRIMARY: ${primary.firstName}`,
        })
      }
    }
    families.push({
      key: base,
      membershipNumber: base,
      surnames: familySurnames,
      primaryRowId: primary.id,
      rowIds: group.map((r) => r.id),
    })
  }

  for (const row of rows) row.action = buildAction(row)

  const effective = effectiveMemberRows(rows)
  const summary: MemberImportSummary = {
    rows: rows.length,
    included: rows.filter((r) => r.include).length,
    memberships: effective.length,
    new: effective.filter((r) => r.action === 'NEW').length,
    updated: effective.filter((r) => r.action === 'UPDATE').length,
    unchanged: effective.filter((r) => r.action === 'UNCHANGED').length,
    inactive: effective.filter((r) => !r.isActive).length,
    errors: rows.reduce((n, r) => n + r.issues.filter((i) => i.severity === 'ERROR').length, 0),
    families: families.length,
  }

  return {
    headers,
    detected,
    used,
    missing,
    rows,
    families,
    issues,
    summary,
  }
}

/** One row per membership number: the family primary (or the first included row). */
/** The person identity used for the linked Customer (family marker stripped). */
export function memberCustomerName(input: {
  firstName: string
  lastName: string
  isFamily?: boolean
  familySurnames?: string | null
}): string {
  if (!input.isFamily) return `${input.firstName} ${input.lastName}`.trim()
  const firstSurname = (input.familySurnames || input.lastName)
    .replace(/\(family\)/gi, '')
    .split('/')[0]
    .trim()
  return `${input.firstName} ${firstSurname}`.trim()
}

export function effectiveMemberRows(rows: MemberImportRow[]): MemberImportRow[] {
  const byBase = new Map<string, MemberImportRow[]>()
  const withoutNumber: MemberImportRow[] = []
  for (const row of rows) {
    if (!row.include) continue
    if (!row.baseNumber) {
      withoutNumber.push(row)
      continue
    }
    const list = byBase.get(row.baseNumber) ?? []
    list.push(row)
    byBase.set(row.baseNumber, list)
  }

  const out: MemberImportRow[] = []
  for (const group of Array.from(byBase.values())) {
    const primary = group.find((r) => r.isPrimary) ?? group[0]
    out.push(primary)
  }
  out.push(...withoutNumber)
  return out
}

export function setFamilyPrimary(rows: MemberImportRow[], familyKey: string, primaryRowId: string): MemberImportRow[] {
  return rows.map((row) => {
    if (row.baseNumber !== familyKey) return row
    return { ...row, isPrimary: row.id === primaryRowId }
  })
}

export function setFamilySurnames(rows: MemberImportRow[], familyKey: string, surnames: string): MemberImportRow[] {
  return rows.map((row) => {
    if (row.baseNumber !== familyKey) return row
    return { ...row, familySurnames: surnames }
  })
}

export function setRowActive(rows: MemberImportRow[], rowId: string, active: boolean): MemberImportRow[] {
  return rows.map((row) =>
    row.id === rowId ? { ...row, isActive: active, activeSource: 'MANUAL' as const } : row,
  )
}

export function setRowIncluded(rows: MemberImportRow[], rowId: string, include: boolean): MemberImportRow[] {
  return rows.map((row) => (row.id === rowId ? { ...row, include } : row))
}

export interface MemberCleanAnswerRow {
  rowId: string
  firstName?: string
  lastName?: string
  familySurnames?: string
  isPrimary?: boolean
  note?: string
}

const CLEAN_PROMPT = `You are cleaning a membership list before it is imported into SwiftPOS.

Rules:
- Return ONLY valid JSON, no prose and no code fences.
- Keep every rowId exactly as supplied. Never invent, merge or remove a person.
- Capitalise names correctly (Mc/Mac/O'/Fitz, particles like van/de/der/den/da stay lower-case inside a surname).
- Remove a surname that has been repeated in the first name (e.g. "Sue JOHN" + surname "JOHN" becomes first name "Sue").
- For a family, one membership is kept: choose the primary person, and produce a family surname like "SMITH (Family)" or "SMITH/JONES (Family)" when surnames differ.
- Do not use email, phone or notes: they are not supplied.
- If a row is already correct, return it unchanged.

Return this shape:
{"rows":[{"rowId":"r2","firstName":"...","lastName":"...","familySurnames":"...","isPrimary":true,"note":"..."}]}`

export function buildMemberCleanPrompt(rows: MemberImportRow[], scope: 'flagged' | 'all' = 'flagged'): string {
  const selected = rows.filter((row) => row.include && (scope === 'all' || row.needsAi))
  const lines = selected.map((row) =>
    [
      row.id,
      row.membershipNumber,
      row.firstName,
      row.lastName,
      row.isFamily ? 'FAMILY' : '',
      row.isPrimary ? 'PRIMARY' : '',
    ].join(' | '),
  )
  return [
    CLEAN_PROMPT,
    '',
    'Rows (rowId | membershipNumber | firstName | lastName | family | primary):',
    ...lines,
  ].join('\n')
}

export function parseMemberCleanAnswer(answer: string): MemberCleanAnswerRow[] {
  const cleaned = answer.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  const slice = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned
  let parsed: unknown
  try {
    parsed = JSON.parse(slice)
  } catch {
    return []
  }
  const list = Array.isArray(parsed)
    ? parsed
    : (parsed && typeof parsed === 'object' && Array.isArray((parsed as { rows?: unknown }).rows)
        ? (parsed as { rows: unknown[] }).rows
        : [])
  const out: MemberCleanAnswerRow[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const rowId = String(row.rowId ?? '').trim()
    if (!rowId) continue
    out.push({
      rowId,
      firstName: typeof row.firstName === 'string' ? row.firstName : undefined,
      lastName: typeof row.lastName === 'string' ? row.lastName : undefined,
      familySurnames: typeof row.familySurnames === 'string' ? row.familySurnames : undefined,
      isPrimary: typeof row.isPrimary === 'boolean' ? row.isPrimary : undefined,
      note: typeof row.note === 'string' ? row.note : undefined,
    })
  }
  return out
}

export function applyMemberCleanAnswer(
  rows: MemberImportRow[],
  answer: MemberCleanAnswerRow[],
): MemberImportRow[] {
  const byId = new Map(answer.map((row) => [row.rowId, row]))
  let next = rows.map((row) => {
    const patch = byId.get(row.id)
    if (!patch) return row
    const firstName = patch.firstName ? titleCaseName(patch.firstName) : row.firstName
    const lastName = patch.lastName ? titleCaseName(patch.lastName, { surname: true }) : row.lastName
    const familySurnames = patch.familySurnames?.trim() || row.familySurnames
    return {
      ...row,
      firstName,
      lastName,
      displayName: titleCaseName(`${firstName} ${lastName}`),
      familySurnames,
    }
  })

  for (const patch of answer) {
    if (patch.isPrimary !== true) continue
    const row = next.find((r) => r.id === patch.rowId)
    if (!row || !row.baseNumber) continue
    next = setFamilyPrimary(next, row.baseNumber, row.id)
  }
  return next
}

export interface SwiftPosMemberMappingValues {
  typeActive: number
  statusActive: number
  typeRemoved: number
  statusRemoved: number
}

export const SWIFTPOS_MEMBER_HEADER = [
  'First Name',
  'Last Name',
  'Membership Number ',
  'Member Type',
  'Member Status',
] as const

export function toSwiftPosCsv(rows: MemberImportRow[], mapping: SwiftPosMemberMappingValues): string {
  const effective = effectiveMemberRows(rows)
  const out: (string | number)[][] = [[...SWIFTPOS_MEMBER_HEADER]]
  for (const row of effective) {
    if (!row.baseNumber) continue
    const lastName = row.isFamily
      ? row.familySurnames || buildFamilyLastName([row.lastName])
      : row.lastName
    out.push([
      row.firstName,
      lastName,
      row.baseNumber,
      row.isActive ? mapping.typeActive : mapping.typeRemoved,
      row.isActive ? mapping.statusActive : mapping.statusRemoved,
    ])
  }
  return toCsv(out)
}

export function prepareCommitRows(rows: MemberImportRow[]): {
  rows: CommitMemberRow[]
  issues: MemberIssue[]
} {
  const issues: MemberIssue[] = []
  const seen = new Set<string>()
  const effective = effectiveMemberRows(rows)
  const committed: CommitMemberRow[] = []

  for (const row of effective) {
    const number = normaliseMembershipNumber(row.baseNumber || row.membershipNumber)
    if (!number) {
      issues.push({
        code: 'INVALID_MEMBERSHIP_NUMBER',
        severity: 'ERROR',
        rowId: row.id,
        message: `SKIPPED "${row.membershipNumber}" — NOT A VALID MEMBERSHIP NUMBER`,
      })
      continue
    }
    if (seen.has(number.base)) {
      issues.push({
        code: 'DUPLICATE_MEMBERSHIP_NUMBER',
        severity: 'WARNING',
        rowId: row.id,
        message: `MEMBERSHIP ${number.base} APPEARS MORE THAN ONCE — ONLY THE FIRST IS IMPORTED`,
      })
      continue
    }
    seen.add(number.base)
    committed.push({
      membershipNumber: number.base,
      baseNumber: number.base,
      firstName: row.firstName || 'UNKNOWN',
      lastName: row.isFamily
        ? row.familySurnames || buildFamilyLastName([row.lastName])
        : row.lastName,
      memberType: row.memberType,
      email: row.email,
      phone: row.phone,
      memberInterests: row.memberInterests,
      company: row.company,
      externalId: row.externalId,
      isFamily: row.isFamily,
      isPrimary: row.isPrimary,
      familySurnames: row.familySurnames || '',
      isActive: row.isActive,
      sourceRowId: row.id,
    })
  }

  return { rows: committed, issues }
}
