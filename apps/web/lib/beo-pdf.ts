// BEO PDF export — same jsPDF pattern as guide-pdf.ts / checklist-pdf.ts.
// Pure and sync: the route builds the data and hands it in.
//
// Three variants:
//   FULL    — the internal banquet event order (everything except the activity log)
//   CLIENT  — the customer-facing copy (no staffing, no working notes, no internal notes)
//   KITCHEN — the back-of-house copy: dietary, run sheet, dish totals, notes

import { jsPDF } from 'jspdf'
import { blockDef } from '@/lib/beo-blocks'

export type BeoPdfVariant = 'FULL' | 'CLIENT' | 'KITCHEN'

export interface BeoPdfBlock {
  type: string
  title: string | null
  config: Record<string, unknown>
}

export interface BeoPdfLine {
  name: string
  qty: number
  total: number
}

export interface BeoPdfData {
  venueName: string
  eventName: string
  eventType: string | null
  status: string
  eventDate: string
  startTime: string | null
  endTime: string | null
  guestCount: number
  diningStyle: string | null
  contactName: string | null
  contactEmail: string | null
  contactPhone: string | null
  menuName: string | null
  setupName: string | null
  notes: string | null
  internalNotes: string | null
  blocks: BeoPdfBlock[]
  menuItems: { id: string; name: string }[]
  totals: { subtotal: number; deposit: number; balance: number; lines: BeoPdfLine[] }
}

const VARIANT_TITLE: Record<BeoPdfVariant, string> = {
  FULL: 'BANQUET EVENT ORDER',
  CLIENT: 'BANQUET EVENT ORDER — CLIENT COPY',
  KITCHEN: 'BANQUET EVENT ORDER — KITCHEN COPY',
}

/** The kitchen copy leads with dietary, then the run sheet and dish blocks. */
const KITCHEN_ORDER = ['DIETARY', 'TIMELINE', 'MENU_SELECTION', 'DRINKS_SELECTION', 'ROOM_SETUP', 'NOTES', 'STAFFING']

/** Blocks each variant prints. `null` = everything except the activity log. */
const VARIANT_BLOCKS: Record<BeoPdfVariant, string[] | null> = {
  FULL: null,
  CLIENT: [
    'CUSTOMER_DETAILS', 'DINING_STYLE', 'MENU_SELECTION', 'DRINKS_SELECTION',
    'DIETARY', 'ROOM_SETUP', 'TIMELINE', 'VENDORS', 'TRANSPORT', 'PAYMENT', 'CUSTOM_TEXT',
  ],
  KITCHEN: KITCHEN_ORDER,
}

/** Blocks never printed — the activity log is not a document. */
const ALWAYS_SKIP = ['HISTORY']

/**
 * The blocks a variant prints. FULL and CLIENT keep the operator's authored
 * order; KITCHEN is re-sorted so dietary always leads.
 */
export function blocksForVariant(blocks: BeoPdfBlock[], variant: BeoPdfVariant): BeoPdfBlock[] {
  const allowed = VARIANT_BLOCKS[variant]
  const kept = blocks.filter((b) => {
    if (ALWAYS_SKIP.includes(b.type)) return false
    return allowed === null ? true : allowed.includes(b.type)
  })
  if (variant !== 'KITCHEN') return kept
  return kept.sort((a, b) => KITCHEN_ORDER.indexOf(a.type) - KITCHEN_ORDER.indexOf(b.type))
}

function money(n: number): string {
  return `$${n.toFixed(2)}`
}

function drawBeo(doc: jsPDF, data: BeoPdfData, variant: BeoPdfVariant) {
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 15
  const innerW = pageW - margin * 2
  const isKitchen = variant === 'KITCHEN'
  const showMoney = variant !== 'KITCHEN'

  let y = 20
  const ensure = (needed: number) => {
    if (y + needed > pageH - 20) {
      doc.addPage()
      y = 20
    }
  }

  // ── Header ──
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(120)
  doc.text(data.venueName.toUpperCase(), margin, y)
  y += 9

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(0)
  const titleLines = doc.splitTextToSize(VARIANT_TITLE[variant], innerW) as string[]
  doc.text(titleLines, margin, y)
  y += titleLines.length * 6.5

  doc.setFontSize(18)
  const nameLines = doc.splitTextToSize(data.eventName.toUpperCase(), innerW) as string[]
  doc.text(nameLines, margin, y)
  y += nameLines.length * 7 + 1

  const when = [
    data.eventDate,
    data.startTime ? `${data.startTime}${data.endTime ? `–${data.endTime}` : ''}` : null,
    data.guestCount ? `${data.guestCount} GUESTS` : null,
    data.diningStyle ? data.diningStyle.toUpperCase() : null,
    data.eventType ? data.eventType.toUpperCase() : null,
  ].filter(Boolean).join(' · ')

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(60)
  doc.text(when, margin, y)
  y += 5

  doc.setFontSize(8)
  doc.setTextColor(120)
  const meta = [
    `STATUS: ${data.status}`,
    data.menuName ? `MENU: ${data.menuName.toUpperCase()}` : null,
    data.setupName ? `LAYOUT: ${data.setupName.toUpperCase()}` : null,
  ].filter(Boolean).join(' · ')
  doc.text(meta, margin, y)
  y += 5

  if (!isKitchen && data.contactName) {
    const contact = [data.contactName, data.contactPhone, data.contactEmail].filter(Boolean).join(' · ')
    const lines = doc.splitTextToSize(`CONTACT: ${contact}`, innerW) as string[]
    doc.text(lines, margin, y)
    y += lines.length * 4
  }

  y += 3
  doc.setLineWidth(0.3)
  doc.setDrawColor(0)
  doc.line(margin, y, pageW - margin, y)
  y += 8

  // ── Blocks ──
  const blocks = blocksForVariant(data.blocks, variant)

  const nameOf = (id: string) => data.menuItems.find((m) => m.id === id)?.name ?? 'ITEM'

  for (const block of blocks) {
    const def = blockDef(block.type)
    const label = (block.title?.trim() || def?.label || block.type).toUpperCase()
    const cfg = block.config ?? {}

    ensure(14)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10.5)
    doc.setTextColor(0)
    doc.text(label, margin, y)
    y += 6

    const rows = Array.isArray(cfg.rows) ? (cfg.rows as Record<string, unknown>[]) : null
    const items = Array.isArray(cfg.items) ? (cfg.items as { menuItemId: string; qty: number }[]) : null

    // Scalar text fields.
    for (const [key, value] of Object.entries(cfg)) {
      if (key === 'rows' || key === 'items') continue
      if (typeof value !== 'string' || !value.trim()) continue
      const fieldLabel = def?.fields.find((f) => f.key === key)?.label ?? key.toUpperCase()
      ensure(8)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9.5)
      doc.setTextColor(30)
      const lines = doc.splitTextToSize(`${fieldLabel}: ${value}`, innerW - 4) as string[]
      doc.text(lines, margin + 4, y)
      y += lines.length * 4.5
    }

    if (items && items.length > 0) {
      for (const it of items) {
        ensure(6)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9.5)
        doc.setTextColor(30)
        doc.text(`▪ ${nameOf(it.menuItemId)} × ${it.qty}`, margin + 4, y)
        y += 4.5
      }
    }

    if (rows && rows.length > 0) {
      for (const row of rows) {
        const parts = Object.entries(row)
          .filter(([, v]) => String(v ?? '').trim() !== '')
          .map(([k, v]) => (k === 'count' ? `× ${String(v)}` : String(v)))
        if (parts.length === 0) continue
        ensure(6)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9.5)
        doc.setTextColor(30)
        const lines = doc.splitTextToSize(`▪ ${parts.join(' — ')}`, innerW - 4) as string[]
        doc.text(lines, margin + 4, y)
        y += lines.length * 4.5
      }
    }

    y += 4
  }

  // ── Dish totals (kitchen) / pricing (full + client) ──
  if (data.totals.lines.length > 0 && (isKitchen || showMoney)) {
    ensure(16)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10.5)
    doc.setTextColor(0)
    doc.text(isKitchen ? 'DISH TOTALS' : 'ORDER SUMMARY', margin, y)
    y += 6

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    doc.setTextColor(30)
    for (const line of data.totals.lines) {
      ensure(6)
      doc.text(`▪ ${line.name} × ${line.qty}`, margin + 4, y)
      if (showMoney) doc.text(money(line.total), pageW - margin, y, { align: 'right' })
      y += 4.5
    }

    if (showMoney) {
      y += 2
      ensure(18)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.text(`SUBTOTAL: ${money(data.totals.subtotal)}`, margin + 4, y); y += 5
      doc.text(`DEPOSIT: ${money(data.totals.deposit)}`, margin + 4, y); y += 5
      doc.text(`BALANCE: ${money(data.totals.balance)}`, margin + 4, y); y += 5
    }
    y += 4
  }

  // ── Notes ──
  if (data.notes) {
    ensure(14)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10.5)
    doc.setTextColor(0)
    doc.text('NOTES', margin, y)
    y += 6
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    doc.setTextColor(30)
    const lines = doc.splitTextToSize(data.notes, innerW) as string[]
    doc.text(lines, margin, y)
    y += lines.length * 4.5 + 4
  }

  // Internal notes are for the venue, never the client copy.
  if (data.internalNotes && variant !== 'CLIENT') {
    ensure(14)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10.5)
    doc.setTextColor(0)
    doc.text('INTERNAL NOTES', margin, y)
    y += 6
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    doc.setTextColor(30)
    const lines = doc.splitTextToSize(data.internalNotes, innerW) as string[]
    doc.text(lines, margin, y)
    y += lines.length * 4.5
  }
}

export function generateBeoPdf(data: BeoPdfData, variant: BeoPdfVariant = 'FULL'): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  drawBeo(doc, data, variant)
  stampFooter(doc, data.venueName)
  return doc
}

function stampFooter(doc: jsPDF, venueName: string) {
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const footerY = pageH - 12
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(140)
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.text(`HOSPO OPS — ${venueName.toUpperCase()}`, pageW / 2, footerY, { align: 'center' })
    doc.text(`${i} / ${pages}`, pageW / 2, footerY - 4, { align: 'center' })
  }
}

export function beoPdfToBuffer(doc: jsPDF): ArrayBuffer {
  return doc.output('arraybuffer')
}

/** Sanitised filename for a BEO PDF, suffixed by variant. */
export function beoPdfFilename(eventName: string, variant: BeoPdfVariant = 'FULL'): string {
  const clean = eventName
    .toUpperCase()
    .replace(/[^A-Z0-9 \-_]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  const suffix = variant === 'FULL' ? '' : ` - ${variant}`
  return `BEO - ${clean || 'EVENT'}${suffix}.pdf`
}
