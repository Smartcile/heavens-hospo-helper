// Playbook guide PDF export — the same jsPDF pattern as checklist-pdf.ts.
// Pure and sync: image loading is done by the route and handed in as data
// URLs, so this module stays testable without the filesystem or the network.

import { jsPDF } from 'jspdf'
import path from 'node:path'
import fs from 'node:fs'
import { guideTypeLabel } from '@/lib/guide-types'
import { pdfSafe } from '@/lib/pdf-safe'

export interface GuidePdfLink {
  kind: string
  label: string
  note: string | null
}

export interface GuidePdfStep {
  heading: string | null
  content: string
  videoUrl?: string | null
  /** Locally uploaded clip — printed as a "view in the app" note. */
  videoPath?: string | null
  /** Optional data URL (filled by the route) — embedded below the content. */
  imageDataUrl?: string | null
  /** Ordered step photos (data URLs, filled by the route). */
  imageDataUrls?: string[]
  links?: GuidePdfLink[]
}

/** One product-reference item, pre-flattened by the route for printing. */
export interface GuidePdfTableItem {
  heading: string | null
  imageDataUrl?: string | null
  fields: { label: string; value: string }[]
}

export interface GuidePdfData {
  venueName: string
  title: string
  description?: string | null
  category?: string | null
  guideType?: string | null
  /** Plain-text form of the rich-text body (shown above the steps). */
  body?: string | null
  requiresSignOff?: boolean
  steps: GuidePdfStep[]
  /** Product-reference rows — rendered instead of steps when present. */
  table?: GuidePdfTableItem[] | null
}

const LINK_LABEL: Record<string, string> = {
  ITEM: 'TOOL',
  TASK: 'TASK',
  CHECKLIST: 'LIST',
  GUIDE: 'GUIDE',
  SECTION: 'SECTION',
  RECIPE: 'RECIPE',
}

function drawGuide(doc: jsPDF, data: GuidePdfData) {
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 15
  const innerW = pageW - margin * 2

  let y = 20

  const ensure = (needed: number) => {
    if (y + needed > pageH - 20) {
      doc.addPage()
      y = 20
    }
  }

  // A wrapped, margin-safe text block — the ONE place body copy is drawn, so a
  // long paragraph always breaks at the right edge instead of running off.
  const paragraph = (
    text: string,
    opts: { size: number; style: string; color: number; indent?: number; lead: number },
  ) => {
    doc.setFont('helvetica', opts.style)
    doc.setFontSize(opts.size)
    doc.setTextColor(opts.color)
    const indent = opts.indent ?? 0
    const lines = doc.splitTextToSize(text, innerW - indent) as string[]
    for (const line of lines) {
      ensure(opts.lead)
      doc.text(line, margin + indent, y)
      y += opts.lead
    }
  }

  // Header
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(120)
  doc.text(pdfSafe(data.venueName).toUpperCase(), margin, y)
  y += 9

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(0)
  const titleLines = doc.splitTextToSize(pdfSafe(data.title).toUpperCase(), innerW) as string[]
  doc.text(titleLines, margin, y)
  y += titleLines.length * 7 + 2

  const meta = [
    guideTypeLabel(data.guideType),
    data.category ? `CATEGORY: ${pdfSafe(data.category).toUpperCase()}` : null,
    data.requiresSignOff ? 'MANAGER SIGN-OFF REQUIRED' : 'SELF-COMPLETE',
  ]
    .filter(Boolean)
    .join(' · ')
  if (meta) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(120)
    doc.text(pdfSafe(meta), margin, y)
    y += 6
  }

  if (data.description) {
    ensure(10)
    y += 4
    paragraph(pdfSafe(data.description), { size: 9, style: 'italic', color: 90, lead: 4.5 })
  }

  y += 4
  doc.setLineWidth(0.3)
  doc.setDrawColor(0)
  doc.line(margin, y, pageW - margin, y)
  y += 8

  // Rich-text body (plain text) — instructions before any numbered steps.
  if (data.body) {
    paragraph(pdfSafe(data.body), { size: 9.5, style: 'normal', color: 30, lead: 4.8 })
    y += 6
  }

  // Product-reference items — one block each (image + labelled fields).
  for (const item of data.table ?? []) {
    ensure(14)
    if (item.heading) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.setTextColor(0)
      const hLines = doc.splitTextToSize(pdfSafe(item.heading).toUpperCase(), innerW) as string[]
      for (const line of hLines) {
        ensure(6)
        doc.text(line, margin, y)
        y += 5.5
      }
      y += 1
    }
    if (item.imageDataUrl) {
      try {
        const img = doc.getImageProperties(item.imageDataUrl)
        const scale = Math.min(45 / img.width, 45 / img.height, 1)
        const w = img.width * scale
        const h = img.height * scale
        ensure(h + 4)
        doc.addImage(item.imageDataUrl, 'JPEG', margin, y, w, h)
        y += h + 3
      } catch {
        // Unreadable image — the fields still print.
      }
    }
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(60)
    for (const f of item.fields) {
      const lines = doc.splitTextToSize(
        `${pdfSafe(f.label).toUpperCase()}: ${pdfSafe(f.value)}`,
        innerW - 2,
      ) as string[]
      for (const line of lines) {
        ensure(5)
        doc.text(line, margin + 2, y)
        y += 4.4
      }
    }
    y += 4
    ensure(4)
    doc.setLineWidth(0.1)
    doc.setDrawColor(180)
    doc.line(margin, y, pageW - margin, y)
    y += 6
  }

  // Steps
  for (let i = 0; i < data.steps.length; i++) {
    const s = data.steps[i]
    ensure(14)

    const heading = `STEP ${i + 1}${s.heading ? ` — ${pdfSafe(s.heading).toUpperCase().trim()}` : ''}`
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(0)
    for (const line of doc.splitTextToSize(heading, innerW) as string[]) {
      ensure(6)
      doc.text(line, margin, y)
      y += 5.5
    }
    y += 1

    if (s.content.trim()) {
      paragraph(pdfSafe(s.content).trim(), { size: 9.5, style: 'normal', color: 30, lead: 4.8 })
    }

    for (const l of s.links ?? []) {
      const label = `- ${LINK_LABEL[l.kind] ?? l.kind}: ${pdfSafe(l.label)}${l.note ? ` (${pdfSafe(l.note)})` : ''}`
      paragraph(label, { size: 8.5, style: 'normal', color: 80, indent: 3, lead: 4.2 })
    }

    if (s.videoUrl || s.videoPath) {
      const vLabel = s.videoUrl ? `WATCH VIDEO: ${pdfSafe(s.videoUrl)}` : 'VIDEO — VIEW IN THE APP'
      paragraph(vLabel, { size: 8, style: 'normal', color: 80, lead: 4 })
      y += 2
    }

    const stepImages = s.imageDataUrls ?? (s.imageDataUrl ? [s.imageDataUrl] : [])
    for (const imgData of stepImages) {
      try {
        const img = doc.getImageProperties(imgData)
        const maxW = innerW
        const maxH = 60
        const scale = Math.min(maxW / img.width, maxH / img.height, 1)
        const w = img.width * scale
        const h = img.height * scale
        ensure(h + 4)
        doc.addImage(imgData, 'JPEG', margin, y, w, h)
        y += h + 6
      } catch {
        // Unreadable image data — the step text is the content, keep going.
      }
    }

    y += 4
  }
}

export function generateGuidePdf(data: GuidePdfData): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  drawGuide(doc, data)
  stampFooter(doc, data.venueName)
  return doc
}

/** One PDF for a group of guides — each guide starts on a fresh page. */
export function mergedGuidePdf(venueName: string, guides: GuidePdfData[]): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  for (let i = 0; i < guides.length; i++) {
    if (i > 0) doc.addPage()
    drawGuide(doc, guides[i])
  }
  stampFooter(doc, venueName)
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
    doc.text(`HOSPO OPS — ${pdfSafe(venueName).toUpperCase()}`, pageW / 2, footerY, { align: 'center' })
    doc.text(`${i} / ${pages}`, pageW / 2, footerY - 4, { align: 'center' })
  }
}

export function guidePdfToBuffer(doc: jsPDF): ArrayBuffer {
  return doc.output('arraybuffer')
}

/** Sanitised filename for a guide PDF. */
export function guidePdfFilename(title: string): string {
  const clean = title
    .toUpperCase()
    .replace(/[^A-Z0-9 \-_]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return `GUIDE - ${clean || 'PLAYBOOK'}.pdf`
}

/**
 * Load a step image into a data URL for jsPDF. Local uploads are read from
 * disk; remote URLs are fetched with a short timeout. Returns null on any
 * failure — the PDF falls back to text only.
 */
export async function loadImageDataUrl(url: string | null | undefined): Promise<string | null> {
  if (!url) return null
  try {
    if (url.startsWith('/')) {
      const file = path.join(process.cwd(), 'public', url.replace(/^\//, ''))
      const buf = await fs.promises.readFile(file)
      if (buf.byteLength > 2_000_000) return null
      const ext = path.extname(file).slice(1).toLowerCase()
      const mime = ext === 'jpg' ? 'jpeg' : ext === 'svg' ? 'svg+xml' : ext || 'png'
      return `data:image/${mime};base64,${buf.toString('base64')}`
    }
    if (url.startsWith('http://') || url.startsWith('https://')) {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 5000)
      try {
        const r = await fetch(url, { signal: ctrl.signal })
        if (!r.ok) return null
        const buf = Buffer.from(await r.arrayBuffer())
        if (buf.byteLength > 2_000_000) return null
        const type = r.headers.get('content-type')?.split(';')[0] ?? 'image/jpeg'
        return `data:${type};base64,${buf.toString('base64')}`
      } finally {
        clearTimeout(t)
      }
    }
  } catch {
    // Any failure — skip the image, keep the text.
  }
  return null
}
