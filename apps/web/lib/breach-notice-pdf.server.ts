// Server half of the breach-notice PDF: loads the first notice photo from the
// upload storage root, then renders the pure jsPDF document. Imported only by
// the worker/admin PDF routes.

import { imageFormat, loadImageDataUrl } from '@/lib/guide-pdf'
import { firstPhotoUrl } from '@/lib/breach-notices'
import { formatDateDMY } from '@/lib/date-nav'
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
  return value ? formatDateDMY(value.toISOString().slice(0, 10)) : null
}

function reviewStamp(value: Date | null): string | null {
  if (!value) return null
  const day = formatDateDMY(value.toISOString().slice(0, 10))
  return `${day} ${value.toISOString().slice(11, 16)}`
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

function dataUrlBuffer(dataUrl: string): Buffer | null {
  const comma = dataUrl.indexOf(',')
  if (comma < 0 || !/;base64,/i.test(dataUrl.slice(0, comma))) return null
  return Buffer.from(dataUrl.slice(comma + 1), 'base64')
}

/** True when the bytes really are the JPEG/PNG the data URL claims. */
function magicMatches(buf: Buffer, format: 'PNG' | 'JPEG'): boolean {
  if (format === 'PNG') {
    return (
      buf.length >= 8 &&
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47
    )
  }
  return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff
}

/**
 * jsPDF only reliably embeds JPEG/PNG. WEBP/GIF are re-encoded, and HEIC (which
 * guide-pdf labels as PNG because its extension is unknown) is caught by the
 * magic-byte check. Anything sharp cannot decode is omitted rather than drawn
 * as a corrupt image.
 */
async function pdfPhotoDataUrl(url: string): Promise<string | null> {
  const dataUrl = await loadImageDataUrl(url)
  if (!dataUrl) return null
  const format = imageFormat(dataUrl)
  const buf = dataUrlBuffer(dataUrl)
  if (buf && (format === 'PNG' || format === 'JPEG') && magicMatches(buf, format)) {
    return dataUrl
  }
  if (!buf) return null
  try {
    const sharp = (await import('sharp')).default
    const out = await sharp(buf)
      .rotate()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 78, mozjpeg: true })
      .toBuffer()
    return `data:image/jpeg;base64,${out.toString('base64')}`
  } catch {
    return null
  }
}

export async function buildBreachNoticePdfBuffer(row: BreachNoticePdfRow): Promise<ArrayBuffer> {
  const urls = Array.isArray(row.attachmentUrls)
    ? row.attachmentUrls.filter((url): url is string => typeof url === 'string')
    : []
  const photo = firstPhotoUrl(urls)
  const photoDataUrl = photo ? await pdfPhotoDataUrl(photo) : null

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
      reviewedAt: reviewStamp(row.reviewedAt),
      reviewNote: row.reviewNote,
      photoDataUrl,
    }),
  )
}
