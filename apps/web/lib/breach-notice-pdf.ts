import { jsPDF } from 'jspdf'
import { pdfSafe } from '@/lib/pdf-safe'
import { describeBreachKind, describeBreachStatus } from '@/lib/breach-notices'

export interface BreachNoticePdfData {
  venueName: string
  subjectType: string
  kind: string
  numberplate: string
  noticeDetails: string
  breachDate: string
  location: string | null
  issuingAuthority: string | null
  fineAmount: number | null
  paymentDueDate: string | null
  notes: string | null
  clientName: string | null
  clientReference: string | null
  status: string
  submittedByName: string
  reviewedByName: string | null
  reviewedAt: string | null
  reviewNote: string | null
  /** First uploaded photo, already loaded as a data URL. */
  photoDataUrl?: string | null
}

function money(value: number | null): string {
  return value == null ? '-' : `$${value.toFixed(2)}`
}

function photoFormat(dataUrl: string): 'PNG' | 'JPEG' {
  return dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG'
}

/**
 * The compiled breach-notice sheet: every submitted field plus the notice
 * photo. Uses the same jsPDF A4 conventions as the checklist/guide exports.
 */
export function generateBreachNoticePdf(data: BreachNoticePdfData): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 15
  const innerW = pageW - margin * 2

  let y = 20
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(120)
  doc.text(pdfSafe(data.venueName).toUpperCase(), margin, y)
  y += 9

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(0)
  doc.text('BREACH NOTICE', margin, y)
  y += 9

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(60)
  doc.text(
    `${pdfSafe(data.subjectType)} · ${pdfSafe(describeBreachKind(data.kind))} · ${pdfSafe(describeBreachStatus(data.status))}`,
    margin,
    y,
  )
  y += 8

  const rows: [string, string][] = [
    ['NUMBER PLATE', data.numberplate],
    ['BREACH DATE', data.breachDate],
    ['KIND', describeBreachKind(data.kind)],
    ['LOCATION', data.location ?? '-'],
    ['ISSUING AUTHORITY', data.issuingAuthority ?? '-'],
    ['FINE AMOUNT', money(data.fineAmount)],
    ['PAYMENT DUE', data.paymentDueDate ?? '-'],
    ['SUBMITTED BY', data.submittedByName],
  ]
  if (data.subjectType === 'CLIENT') {
    rows.push(['CLIENT', data.clientName ?? '-'])
    rows.push(['REFERENCE', data.clientReference ?? '-'])
  }

  for (const [label, value] of rows) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(120)
    doc.text(pdfSafe(label).toUpperCase(), margin, y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(20)
    const lines = doc.splitTextToSize(pdfSafe(value), innerW - 42) as string[]
    doc.text(lines, margin + 42, y)
    y += 5.5 * Math.max(1, lines.length)
  }

  const block = (heading: string, body: string) => {
    if (y > pageH - 45) {
      doc.addPage()
      y = margin
    }
    doc.setDrawColor(210)
    doc.line(margin, y, pageW - margin, y)
    y += 5
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(80)
    doc.text(pdfSafe(heading).toUpperCase(), margin, y)
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    doc.setTextColor(20)
    const lines = doc.splitTextToSize(pdfSafe(body), innerW) as string[]
    doc.text(lines, margin, y)
    y += 4.8 * lines.length + 5
  }

  block('Notice details', data.noticeDetails)
  if (data.notes) block('Notes', data.notes)
  if (data.status !== 'SUBMITTED') {
    const decision = [
      `DECISION: ${describeBreachStatus(data.status)}`,
      data.reviewedByName ? `BY: ${data.reviewedByName}` : null,
      data.reviewedAt ? `ON: ${data.reviewedAt}` : null,
      data.reviewNote ? `REASON: ${data.reviewNote}` : null,
    ]
      .filter(Boolean)
      .join('\n')
    block('Review', decision)
  }

  if (data.photoDataUrl) {
    if (y > pageH - 80) {
      doc.addPage()
      y = margin
    }
    doc.setDrawColor(210)
    doc.line(margin, y, pageW - margin, y)
    y += 5
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(80)
    doc.text('NOTICE PHOTO', margin, y)
    y += 4
    const maxW = innerW
    const maxH = pageH - y - margin - 10
    try {
      doc.addImage(data.photoDataUrl, photoFormat(data.photoDataUrl), margin, y, maxW, maxH, undefined, 'FAST')
    } catch {
      // A corrupt image never stops the record printing; the text remains.
    }
  }

  const pages = doc.getNumberOfPages()
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(120)
    doc.text(
      `HOSPO OPS - ${pdfSafe(data.venueName).toUpperCase()} · PAGE ${page} OF ${pages}`,
      pageW / 2,
      pageH - 8,
      { align: 'center' },
    )
  }

  return doc
}

export function breachNoticePdfToBuffer(doc: jsPDF): ArrayBuffer {
  return doc.output('arraybuffer')
}

export function breachNoticePdfFilename(plate: string, breachDate: string): string {
  const cleanPlate = plate.replace(/[^A-Z0-9]/gi, '').toUpperCase() || 'NOTICE'
  const cleanDate = breachDate.replace(/[^0-9-]/g, '') || 'DATE'
  return `BREACH NOTICE - ${cleanPlate} - ${cleanDate}.pdf`
}
