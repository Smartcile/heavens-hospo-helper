// Server half of breach notices — Prisma only, never imported by a client
// component. Creating a STAFF notice best-effort files a staff-plate request
// when the plate is not already approved for that person; that side effect can
// never block the notice itself.

import { prisma, type BreachNotice } from '@hospo-ops/db'
import { normalisePlate } from './parking'
import { PLATE_REASON_MAX, plateSubmissionError } from './staff-parking'
import {
  breachDuplicateKey,
  isStoredBreachAttachment,
  reviewActionToStatus,
  reviewReasonError,
  reviewTransitionError,
  validateBreachNotice,
  validateReviewAction,
  type BreachNoticeInput,
  type BreachReviewAction,
} from './breach-notices'

export interface CreateBreachNoticeArgs {
  venueId: string
  submittedById: string
  input: BreachNoticeInput
  /** Venue-local today (YYYY-MM-DD) so today's notice is never "in the future". */
  today?: string
  /** Managers/admins may record a CLIENT notice; floor staff may not. */
  allowClient: boolean
}

export type ReviewBreachNoticeArgs = {
  id: string
  venueId: string
  reviewedById: string
  action: unknown
  note: string | null | undefined
}

export type WithdrawBreachNoticeArgs = {
  id: string
  venueId: string
  staffId: string
  /** Managers may withdraw any notice; a worker only their own. */
  allowAny: boolean
}

type Failure = { ok: false; status: number; error: string }

function dateValue(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`)
}

/**
 * If the notice plate is not one of the submitter's ACTIVE approved plates,
 * file a PENDING StaffParkingPlateRequest so a manager can add it. Deduped
 * against an existing pending request and another person's active plate.
 * Best-effort: false on any failure, never throws.
 */
export async function autoFileBreachPlateRequest(input: {
  venueId: string
  staffId: string
  plate: string
  noticeLabel?: string | null
}): Promise<boolean> {
  try {
    const plate = normalisePlate(input.plate)
    if (!plate) return false

    const [plates, pending, otherOwners] = await Promise.all([
      prisma.staffParkingPlate.findMany({
        where: { venueId: input.venueId, staffId: input.staffId, deletedAt: null },
        select: { id: true, plate: true, status: true },
      }),
      prisma.staffParkingPlateRequest.findMany({
        where: { venueId: input.venueId, staffId: input.staffId, status: 'PENDING', deletedAt: null },
        select: { plate: true },
      }),
      prisma.staffParkingPlate.findMany({
        where: {
          venueId: input.venueId,
          plate,
          status: 'ACTIVE',
          staffId: { not: input.staffId },
          deletedAt: null,
        },
        select: { staffId: true, plate: true },
      }),
    ])

    const label = (input.noticeLabel ?? '').trim()
    const reason = `BREACH NOTICE${label ? ` ${label}` : ''} - PLATE FROM NOTICE`.slice(0, PLATE_REASON_MAX)
    // The same rules a worker-submitted plate request uses (own active plate,
    // pending request, another owner, reason length).
    const error = plateSubmissionError({
      plate,
      reason,
      activePlates: plates.filter((row) => row.status === 'ACTIVE'),
      pendingPlates: pending.map((row) => row.plate),
      otherOwners,
      staffId: input.staffId,
    })
    if (error) return false

    await prisma.staffParkingPlateRequest.create({
      data: {
        venueId: input.venueId,
        staffId: input.staffId,
        plate,
        previousPlate: null,
        reason,
        status: 'PENDING',
      },
    })
    return true
  } catch (error) {
    console.error('breach notice plate request failed', error)
    return false
  }
}

/** Validate, dedupe and create one notice. */
export async function createBreachNotice(args: CreateBreachNoticeArgs): Promise<{ ok: true; notice: BreachNotice } | Failure> {
  const parsed = validateBreachNotice(args.input, { today: args.today })
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error }

  const values = parsed.value
  // Defence in depth: never persist a remote/foreign attachment URL. The PDF
  // route reads the first photo server-side, so only the app's upload store is
  // allowed (no http(s), no traversal, no query).
  if (!values.attachmentUrls.every(isStoredBreachAttachment)) {
    return { ok: false, status: 400, error: 'ATTACHMENTS MUST BE FILES UPLOADED TO THE APP' }
  }
  if (values.subjectType === 'CLIENT' && !args.allowClient) {
    return { ok: false, status: 403, error: 'CLIENT NOTICES ARE FOR MANAGERS' }
  }

  const rawSubject = typeof args.input.subjectStaffId === 'string' ? args.input.subjectStaffId.trim() : ''
  if (values.subjectType === 'CLIENT') {
    if (rawSubject) return { ok: false, status: 400, error: 'A CLIENT NOTICE HAS NO STAFF SUBJECT' }
  } else if (rawSubject && rawSubject !== args.submittedById) {
    // Own notice only — a worker cannot file one for a colleague.
    return { ok: false, status: 403, error: 'YOU CAN ONLY SUBMIT YOUR OWN STAFF NOTICE' }
  }

  // The person must exist. ADMIN may act across venues; everyone else must
  // either be based at the acting venue or be explicitly linked to it via
  // StaffVenue (the shared-venue / multi-venue login path).
  const submitter = await prisma.staff.findFirst({
    where: { id: args.submittedById, deletedAt: null },
    select: { id: true, role: true, venueId: true },
  })
  if (!submitter) return { ok: false, status: 403, error: 'YOU ARE NOT A STAFF MEMBER' }
  if (submitter.role !== 'ADMIN' && submitter.venueId !== args.venueId) {
    const linked = await prisma.staffVenue.findFirst({
      where: { staffId: args.submittedById, venueId: args.venueId },
      select: { id: true },
    })
    if (!linked) {
      return { ok: false, status: 403, error: 'YOU ARE NOT A STAFF MEMBER AT THIS VENUE' }
    }
  }

  const reference = values.subjectType === 'CLIENT' ? values.clientReference : null
  const duplicate = reference
    ? await prisma.breachNotice.findFirst({
        where: {
          venueId: args.venueId,
          deletedAt: null,
          subjectType: 'CLIENT',
          clientReference: reference,
          status: { not: 'WITHDRAWN' },
        },
        select: { id: true },
      })
    : await prisma.breachNotice.findFirst({
        where: {
          venueId: args.venueId,
          deletedAt: null,
          numberplate: values.numberplate,
          breachDate: dateValue(values.breachDate),
          status: { not: 'WITHDRAWN' },
        },
        select: { id: true },
      })
  if (duplicate) {
    return {
      ok: false,
      status: 409,
      error: `A NOTICE FOR THIS ${reference ? 'REFERENCE' : 'PLATE AND DATE'} IS ALREADY SUBMITTED`,
    }
  }

  const notice = await prisma.breachNotice.create({
    data: {
      venueId: args.venueId,
      submittedById: args.submittedById,
      subjectStaffId: values.subjectType === 'STAFF' ? args.submittedById : null,
      subjectType: values.subjectType,
      kind: values.kind,
      numberplate: values.numberplate,
      noticeDetails: values.noticeDetails,
      breachDate: dateValue(values.breachDate),
      location: values.location,
      issuingAuthority: values.issuingAuthority,
      fineAmount: values.fineAmount,
      paymentDueDate: values.paymentDueDate ? dateValue(values.paymentDueDate) : null,
      notes: values.notes,
      clientName: values.clientName,
      clientReference: values.clientReference,
      attachmentUrls: values.attachmentUrls,
      status: 'SUBMITTED',
    },
  })

  if (values.subjectType === 'STAFF') {
    // Best effort — the notice is already saved and must never depend on this.
    await autoFileBreachPlateRequest({
      venueId: args.venueId,
      staffId: args.submittedById,
      plate: values.numberplate,
      noticeLabel: `${values.numberplate} ${values.breachDate}`,
    })
  }

  return { ok: true, notice }
}

/** Record WAIVED / DECLINED / PAID with a required reason. Terminal rows 409. */
export async function reviewBreachNotice(args: ReviewBreachNoticeArgs): Promise<{ ok: true; notice: BreachNotice } | Failure> {
  const action = validateReviewAction(args.action)
  if (!action) return { ok: false, status: 400, error: 'CHOOSE WAIVE, DECLINE OR MARK PAID' }

  const reasonError = reviewReasonError(args.note)
  if (reasonError) return { ok: false, status: 400, error: reasonError }

  const existing = await prisma.breachNotice.findFirst({
    where: { id: args.id, venueId: args.venueId, deletedAt: null },
    select: { id: true, status: true },
  })
  if (!existing) return { ok: false, status: 404, error: 'NOTICE NOT FOUND' }

  const transitionError = reviewTransitionError(existing.status)
  if (transitionError) return { ok: false, status: 409, error: transitionError }

  const status = reviewActionToStatus(action as BreachReviewAction)
  const updated = await prisma.breachNotice.updateMany({
    where: { id: args.id, venueId: args.venueId, status: 'SUBMITTED', deletedAt: null },
    data: {
      status,
      reviewedById: args.reviewedById,
      reviewedAt: new Date(),
      reviewNote: (args.note ?? '').trim().slice(0, 1000),
    },
  })
  if (updated.count === 0) return { ok: false, status: 409, error: 'THIS NOTICE HAS ALREADY BEEN CLOSED' }

  const notice = await prisma.breachNotice.findUnique({ where: { id: args.id } })
  if (!notice) return { ok: false, status: 404, error: 'NOTICE NOT FOUND' }
  return { ok: true, notice }
}

/** Withdraw a SUBMITTED notice. The audit row is kept. */
export async function withdrawBreachNotice(args: WithdrawBreachNoticeArgs): Promise<{ ok: true; notice: BreachNotice } | Failure> {
  const existing = await prisma.breachNotice.findFirst({
    where: { id: args.id, venueId: args.venueId, deletedAt: null },
    select: { id: true, status: true, submittedById: true },
  })
  if (!existing) return { ok: false, status: 404, error: 'NOTICE NOT FOUND' }
  if (!args.allowAny && existing.submittedById !== args.staffId) {
    return { ok: false, status: 403, error: 'YOU CAN ONLY WITHDRAW YOUR OWN NOTICE' }
  }

  const transitionError = reviewTransitionError(existing.status)
  if (transitionError) return { ok: false, status: 409, error: transitionError }

  const updated = await prisma.breachNotice.updateMany({
    where: { id: args.id, venueId: args.venueId, status: 'SUBMITTED', deletedAt: null },
    // Do not stamp the submitter as the reviewer — a withdrawal is not a
    // manager decision and must not read as one on the row.
    data: { status: 'WITHDRAWN' },
  })
  if (updated.count === 0) return { ok: false, status: 409, error: 'THIS NOTICE HAS ALREADY BEEN CLOSED' }

  const notice = await prisma.breachNotice.findUnique({ where: { id: args.id } })
  if (!notice) return { ok: false, status: 404, error: 'NOTICE NOT FOUND' }
  return { ok: true, notice }
}

/** The stable duplicate key for a notice row (used by the UI if needed). */
export function rowDuplicateKey(row: {
  subjectType: string
  clientReference: string | null
  numberplate: string
  breachDate: Date
}): string {
  return breachDuplicateKey({
    subjectType: row.subjectType,
    clientReference: row.clientReference,
    numberplate: row.numberplate,
    breachDate: row.breachDate.toISOString().slice(0, 10),
  })
}
