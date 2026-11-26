// Server half of the breach-notice PDF: loads the first notice photo from the
// upload storage root, then renders the pure jsPDF document. Imported only by
// the worker/admin PDF routes.

import { loadImageDataUrl } from '@/lib/guide-pdf'
import { firstPhotoUrl } from '@/lib/breach-notices'
import { breachNoticePdfToBuffer, generateBreachNoticePdf } from '@/lib/breach-notice-pdf'

export interface BreachNoticePdfRow {
  venueName: string
  subjectType: string
  kind: string
  numberplate: string
  noticeDetails: string
  breachDate: Date
  location: string | null
  issuingAuthority: string | null
  fineAmount: number | null
  paymentDueDate: Date | null
  notes: string | null
  clientName: string | null
  clientReference: string | null
  status: string
  submittedByName: string
  reviewedByName: string | null
  reviewedAt: Date | null
  reviewNote: string | null
  attachmentUrls: unknown
}

function dateKey(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null
}

type Person = { firstName: string; lastName: string } | null

function fullName(person: Person): string {
  return person ? `${person.firstName} ${person.lastName}`.trim() : 'STAFF'
}

/** Map a Prisma row (with its relations) to the PDF input shape. */
export function breachNoticePdfRow(row: {
  subjectType: string
  kind: string
  numberplate: string
  noticeDetails: string
  breachDate: Date
  location: string | null
  issuingAuthority: string | null
  fineAmount: number | null
  paymentDueDate: Date | null
  notes: string | null
  clientName: string | null
  clientReference: string | null
  status: string
  reviewedAt: Date | null
  reviewNote: string | null
  attachmentUrls: unknown
  venue: { name: string }
  submittedBy: Person
  reviewedBy: Person
}): BreachNoticePdfRow {
  return {
    venueName: row.venue.name,
    subjectType: row.subjectType,
    kind: row.kind,
    numberplate: row.numberplate,
    noticeDetails: row.noticeDetails,
    breachDate: row.breachDate,
    location: row.location,
    issuingAuthority: row.issuingAuthority,
    fineAmount: row.fineAmount,
    paymentDueDate: row.paymentDueDate,
    notes: row.notes,
    clientName: row.clientName,
    clientReference: row.clientReference,
    status: row.status,
    submittedByName: fullName(row.submittedBy),
    reviewedByName: row.reviewedBy ? fullName(row.reviewedBy) : null,
    reviewedAt: row.reviewedAt,
    reviewNote: row.reviewNote,
    attachmentUrls: row.attachmentUrls,
  }
}

export async function buildBreachNoticePdfBuffer(row: BreachNoticePdfRow): Promise<ArrayBuffer> {
  const urls = Array.isArray(row.attachmentUrls)
    ? row.attachmentUrls.filter((url): url is string => typeof url === 'string')
    : []
  const photo = firstPhotoUrl(urls)
  const photoDataUrl = photo ? await loadImageDataUrl(photo) : null

  return breachNoticePdfToBuffer(
    generateBreachNoticePdf({
      venueName: row.venueName,
      subjectType: row.subjectType,
      kind: row.kind,
      numberplate: row.numberplate,
      noticeDetails: row.noticeDetails,
      breachDate: dateKey(row.breachDate) ?? '',
      location: row.location,
      issuingAuthority: row.issuingAuthority,
      fineAmount: row.fineAmount,
      paymentDueDate: dateKey(row.paymentDueDate),
      notes: row.notes,
      clientName: row.clientName,
      clientReference: row.clientReference,
      status: row.status,
      submittedByName: row.submittedByName,
      reviewedByName: row.reviewedByName,
      reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString().slice(0, 16).replace('T', ' ') : null,
      reviewNote: row.reviewNote,
      photoDataUrl,
    }),
  )
}
