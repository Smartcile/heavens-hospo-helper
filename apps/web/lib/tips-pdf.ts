import { jsPDF } from 'jspdf'
import { pdfSafe } from '@/lib/pdf-safe'

export interface TipsPdfShare {
  name: string
  hours: number
  shareWeight: number
  amount: number
  status: string
  approvalNote?: string | null
  issueNote?: string | null
  /** Per-person period thread bodies — printed only when `includeNotes`. */
  notes?: string[]
}

export interface TipsPdfData {
  venueName: string
  label: string
  fromDate: string
  toDate: string
  poolTotal: number
  shares: TipsPdfShare[]
  /** Opt-in (#180), default OFF: print each person's note thread. */
  includeNotes?: boolean
}

function money(n: number): string {
  const value = Number.isFinite(n) ? n : 0
  return `$${value.toFixed(2)}`
}

/**
 * Admin-only tip distribution sheet. One row per person: name, hours, weight,
 * cash amount, status and notes. Plain A4 portrait with page-numbered footer,
 * matching the checklist/roster PDF conventions.
 */
export function generateTipsPdf(data: TipsPdfData): jsPDF {
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
  doc.text('TIP DISTRIBUTION', margin, y)
  y += 7

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(0)
  doc.text(pdfSafe(data.label).toUpperCase(), margin, y)
  y += 5
  doc.setFontSize(9)
  doc.setTextColor(90)
  doc.text(`${pdfSafe(data.fromDate)} -> ${pdfSafe(data.toDate)}`, margin, y)
  y += 5
  doc.text(`POOL: ${money(data.poolTotal)}`, margin, y)
  y += 9

  // Column layout (mm)
  const cols = { name: margin, hours: margin + 74, weight: margin + 92, amount: margin + 108, status: margin + 136 }
  const rowH = 6

  function header() {
    doc.setDrawColor(180)
    doc.setLineWidth(0.3)
    doc.line(margin, y, pageW - margin, y)
    y += 5
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(0)
    doc.text('NAME', cols.name, y)
    doc.text('HOURS', cols.hours, y, { align: 'right' })
    doc.text('WEIGHT', cols.weight, y, { align: 'right' })
    doc.text('AMOUNT', cols.amount, y, { align: 'right' })
    doc.text('STATUS', cols.status, y)
    y += 3
    doc.line(margin, y, pageW - margin, y)
    y += 6
  }

  function footer() {
    const footerY = pageH - 12
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(140)
    const pages = doc.getNumberOfPages()
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i)
      doc.text(`HOSPO OPS - ${pdfSafe(data.venueName).toUpperCase()}`, pageW / 2, footerY, { align: 'center' })
      doc.text(`${i} / ${pages}`, pageW / 2, footerY - 4, { align: 'center' })
    }
  }

  header()

  for (const share of data.shares) {
    if (y > pageH - 24) {
      doc.addPage()
      y = 18
      header()
    }

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(0)
    const name = doc.splitTextToSize(pdfSafe(share.name).toUpperCase(), 68) as string[]
    doc.text(name, cols.name, y)
    doc.text(String(share.hours), cols.hours, y, { align: 'right' })
    doc.text(String(share.shareWeight), cols.weight, y, { align: 'right' })
    doc.text(money(share.amount), cols.amount, y, { align: 'right' })
    doc.text(pdfSafe(share.status), cols.status, y)
    y += rowH

    const notes = [share.approvalNote, share.issueNote].filter((n): n is string => !!n && !!n.trim())
    if (notes.length > 0) {
      doc.setFont('helvetica', 'italic')
      doc.setFontSize(8)
      doc.setTextColor(90)
      const lines = doc.splitTextToSize(pdfSafe(notes.join(' · ')), innerW - 4) as string[]
      doc.text(lines, cols.name + 3, y - 1)
      y += lines.length * 4 + 1
    }

    // Optional per-person note thread (#180) — only when explicitly asked for.
    if (data.includeNotes) {
      for (const note of share.notes ?? []) {
        const text = typeof note === 'string' ? note.trim() : ''
        if (!text) continue
        if (y > pageH - 24) {
          doc.addPage()
          y = 18
          header()
        }
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(90)
        const lines = doc.splitTextToSize(pdfSafe(`NOTE: ${text}`), innerW - 8) as string[]
        doc.text(lines, cols.name + 3, y - 1)
        y += lines.length * 3.8 + 1
      }
    }
  }

  footer()
  return doc
}

export function tipsPdfToBuffer(doc: jsPDF): ArrayBuffer {
  return doc.output('arraybuffer')
}
