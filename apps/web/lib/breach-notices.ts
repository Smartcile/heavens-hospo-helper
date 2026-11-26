// Pure rules for breach / infringement notices. Prisma-free so the worker form,
// the manager review queue and the server routes share one validation path.
//
// A STAFF notice is always the submitter's own (subjectStaffId is stamped from
// the session). A CLIENT notice is recorded by a manager and has no staff
// subject. Statuses move SUBMITTED → WAIVED | DECLINED | PAID (or WITHDRAWN);
// every terminal row is immutable.

import { isValidPlate, normalisePlate } from './parking'

export const BREACH_ATTACHMENT_LIMIT = 3
export const BREACH_ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024
export const BREACH_DETAILS_MAX = 2000
export const BREACH_NOTES_MAX = 2000
export const BREACH_REASON_MAX = 1000

export type BreachSubjectType = 'STAFF' | 'CLIENT'
export type BreachKind = 'PARKING' | 'VEHICLE' | 'CONDUCT' | 'OTHER'
export type BreachNoticeStatus = 'SUBMITTED' | 'WAIVED' | 'DECLINED' | 'PAID' | 'WITHDRAWN'
export type BreachReviewAction = 'WAIVE' | 'DECLINE' | 'PAID'

export const BREACH_SUBJECT_TYPES: BreachSubjectType[] = ['STAFF', 'CLIENT']
export const BREACH_KINDS: BreachKind[] = ['PARKING', 'VEHICLE', 'CONDUCT', 'OTHER']
export const BREACH_STATUSES: BreachNoticeStatus[] = [
  'SUBMITTED',
  'WAIVED',
  'DECLINED',
  'PAID',
  'WITHDRAWN',
]

export interface BreachNoticeInput {
  subjectType?: unknown
  kind?: unknown
  numberplate?: unknown
  noticeDetails?: unknown
  breachDate?: unknown
  location?: unknown
  issuingAuthority?: unknown
  fineAmount?: unknown
  paymentDueDate?: unknown
  notes?: unknown
  clientName?: unknown
  clientReference?: unknown
  attachmentUrls?: unknown
  subjectStaffId?: unknown
}

export interface BreachNoticeValues {
  subjectType: BreachSubjectType
  kind: BreachKind
  numberplate: string
  noticeDetails: string
  /** YYYY-MM-DD. */
  breachDate: string
  location: string | null
  issuingAuthority: string | null
  fineAmount: number | null
  /** YYYY-MM-DD. */
  paymentDueDate: string | null
  notes: string | null
  clientName: string | null
  clientReference: string | null
  attachmentUrls: string[]
}

export type BreachNoticeValidation =
  | { ok: true; value: BreachNoticeValues }
  | { ok: false; error: string }

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

/** True when `value` is a real YYYY-MM-DD calendar day (no rollover). */
export function isDateKey(value: string): boolean {
  if (!DATE_KEY_RE.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

/** Today as YYYY-MM-DD in UTC. Callers may pass the venue-local day instead. */
export function todayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10)
}

/** A stored attachment is a photo unless its filename is a PDF. */
export function isBreachPhoto(url: string): boolean {
  return !/\.pdf$/i.test(url.split('?')[0].toLowerCase())
}

export function firstPhotoUrl(urls: readonly string[] | null | undefined): string | null {
  return (urls ?? []).find((url) => isBreachPhoto(url)) ?? null
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function optionalText(value: unknown, max: number): string | null {
  const clean = text(value)
  return clean ? clean.slice(0, max) : null
}

function normaliseEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T | null {
  const raw = text(value).toUpperCase()
  if (!raw) return fallback
  return (allowed as readonly string[]).includes(raw) ? (raw as T) : null
}

function normaliseAttachments(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  const urls = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
  return urls
}

/**
 * Attachments must be files in the app's own upload store. The PDF route reads
 * them server-side, so a remote URL would be an SSRF hole (and a way to satisfy
 * the mandatory-photo rule without uploading anything).
 */
export function isStoredBreachAttachment(url: string): boolean {
  for (const prefix of ['/api/upload/', '/uploads/']) {
    if (!url.startsWith(prefix)) continue
    const basename = url.slice(prefix.length)
    return Boolean(
      basename &&
        !basename.includes('/') &&
        !basename.includes('\\') &&
        !basename.includes('..') &&
        !basename.includes('?') &&
        !basename.includes('#'),
    )
  }
  return false
}

/**
 * Validate + normalise a submitted notice. `today` is the venue-local day the
 * form is being saved on, so a notice dated today is never rejected.
 */
export function validateBreachNotice(
  input: BreachNoticeInput,
  options: { today?: string } = {},
): BreachNoticeValidation {
  const subjectType = normaliseEnum<BreachSubjectType>(input.subjectType, BREACH_SUBJECT_TYPES, 'STAFF')
  if (!subjectType) return { ok: false, error: 'CHOOSE STAFF OR CLIENT' }

  const kind = normaliseEnum<BreachKind>(input.kind, BREACH_KINDS, 'PARKING')
  if (!kind) return { ok: false, error: 'CHOOSE A NOTICE TYPE' }

  const numberplate = normalisePlate(text(input.numberplate))
  if (!numberplate) return { ok: false, error: 'NUMBER PLATE IS REQUIRED' }
  if (!isValidPlate(numberplate)) {
    return { ok: false, error: 'NUMBER PLATE MUST BE 1–6 LETTERS OR DIGITS' }
  }

  const noticeDetails = text(input.noticeDetails)
  if (!noticeDetails) return { ok: false, error: 'BREACH NOTICE DETAILS ARE REQUIRED' }
  if (noticeDetails.length > BREACH_DETAILS_MAX) {
    return { ok: false, error: `NOTICE DETAILS MUST BE ${BREACH_DETAILS_MAX} CHARACTERS OR LESS` }
  }

  const breachDate = text(input.breachDate)
  if (!isDateKey(breachDate)) return { ok: false, error: 'A VALID BREACH DATE IS REQUIRED' }
  const today = options.today && isDateKey(options.today) ? options.today : todayKey()
  if (breachDate > today) return { ok: false, error: 'THE BREACH DATE CANNOT BE IN THE FUTURE' }

  const paymentDueDateRaw = text(input.paymentDueDate)
  if (paymentDueDateRaw && !isDateKey(paymentDueDateRaw)) {
    return { ok: false, error: 'THE PAYMENT DUE DATE IS NOT VALID' }
  }

  let fineAmount: number | null = null
  const fineRaw = input.fineAmount
  if (fineRaw !== null && fineRaw !== undefined && String(fineRaw).trim() !== '') {
    const amount = Number(fineRaw)
    if (!Number.isFinite(amount)) return { ok: false, error: 'THE FINE AMOUNT MUST BE A NUMBER' }
    if (amount < 0) return { ok: false, error: 'THE FINE AMOUNT CANNOT BE NEGATIVE' }
    fineAmount = amount
  }

  const attachments = normaliseAttachments(input.attachmentUrls)
  if (!attachments) return { ok: false, error: 'ATTACHMENTS MUST BE A LIST OF FILES' }
  if (attachments.length === 0) return { ok: false, error: 'ADD AT LEAST ONE PHOTO OF THE NOTICE' }
  if (attachments.length > BREACH_ATTACHMENT_LIMIT) {
    return { ok: false, error: `YOU CAN ADD UP TO ${BREACH_ATTACHMENT_LIMIT} FILES` }
  }
  if (!attachments.every(isStoredBreachAttachment)) {
    return { ok: false, error: 'ATTACHMENTS MUST BE FILES UPLOADED TO THE APP' }
  }
  if (!attachments.some(isBreachPhoto)) {
    return { ok: false, error: 'AT LEAST ONE ATTACHMENT MUST BE A PHOTO' }
  }

  const isClient = subjectType === 'CLIENT'
  return {
    ok: true,
    value: {
      subjectType,
      kind,
      numberplate,
      noticeDetails,
      breachDate,
      location: optionalText(input.location, 200),
      issuingAuthority: optionalText(input.issuingAuthority, 200),
      fineAmount,
      paymentDueDate: paymentDueDateRaw || null,
      notes: optionalText(input.notes, BREACH_NOTES_MAX),
      clientName: isClient ? optionalText(input.clientName, 200) : null,
      // References are matched case-insensitively for the duplicate guard.
      clientReference: isClient ? optionalText(input.clientReference, 120)?.toUpperCase() ?? null : null,
      attachmentUrls: attachments,
    },
  }
}

/**
 * Duplicate identity: one live notice per reference number, or per plate+day
 * when there is no reference. A CLIENT reference is the only reference field;
 * STAFF notices fall back to the plate + breach date.
 */
export function breachDuplicateKey(input: {
  subjectType?: BreachSubjectType | string
  clientReference?: string | null
  numberplate: string
  breachDate: string
}): string {
  const reference = (input.clientReference ?? '').trim().toUpperCase()
  if (String(input.subjectType ?? '').toUpperCase() === 'CLIENT' && reference) {
    return `REF:${reference}`
  }
  return `PLATE:${normalisePlate(input.numberplate)}|${input.breachDate}`
}

/** Map a review button to the terminal status it records. */
export function reviewActionToStatus(action: BreachReviewAction): BreachNoticeStatus {
  if (action === 'WAIVE') return 'WAIVED'
  if (action === 'DECLINE') return 'DECLINED'
  return 'PAID'
}

export function validateReviewAction(value: unknown): BreachReviewAction | null {
  const raw = text(value).toUpperCase().replace(/[\s_-]+/g, '')
  if (raw === 'WAIVE' || raw === 'WAIVED') return 'WAIVE'
  if (raw === 'DECLINE' || raw === 'DECLINED') return 'DECLINE'
  if (raw === 'PAID' || raw === 'MARKPAID' || raw === 'PAY') return 'PAID'
  return null
}

export function isClosedStatus(status: string): boolean {
  return status !== 'SUBMITTED'
}

/** Only a SUBMITTED notice can be reviewed or withdrawn. */
export function reviewTransitionError(status: string): string | null {
  return isClosedStatus(status) ? 'THIS NOTICE HAS ALREADY BEEN CLOSED' : null
}

export function reviewReasonError(reason: string | null | undefined): string | null {
  const clean = text(reason)
  if (!clean) return 'ADD A REASON FOR THIS DECISION'
  if (clean.length > BREACH_REASON_MAX) {
    return `THE REASON MUST BE ${BREACH_REASON_MAX} CHARACTERS OR LESS`
  }
  return null
}

export function describeBreachStatus(status: string): string {
  switch (status) {
    case 'WAIVED':
      return 'WAIVED'
    case 'DECLINED':
      return 'DECLINED'
    case 'PAID':
      return 'PAID'
    case 'WITHDRAWN':
      return 'WITHDRAWN'
    default:
      return 'AWAITING REVIEW'
  }
}

export function describeBreachKind(kind: string): string {
  switch (kind) {
    case 'VEHICLE':
      return 'VEHICLE'
    case 'CONDUCT':
      return 'CONDUCT'
    case 'OTHER':
      return 'OTHER'
    default:
      return 'PARKING'
  }
}

/** One-line summary for lists: `ABC123 · 12-11-2026 · AWAITING REVIEW`. */
export function describeBreachNotice(row: {
  numberplate: string
  breachDate: string | Date
  status: string
  subjectType?: string | null
}): string {
  const date = typeof row.breachDate === 'string'
    ? row.breachDate.slice(0, 10)
    : row.breachDate.toISOString().slice(0, 10)
  const [year, month, day] = date.split('-')
  const subject = row.subjectType === 'CLIENT' ? 'CLIENT' : 'STAFF'
  return `${subject} · ${row.numberplate} · ${day}-${month}-${year} · ${describeBreachStatus(row.status)}`
}
