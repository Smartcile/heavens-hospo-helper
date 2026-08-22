// Playbook guide PDF export — the same jsPDF pattern as checklist-pdf.ts.
// Pure and sync: image loading is done by the route and handed in as data
// URLs, so this module stays testable without the filesystem or the network.

import { jsPDF } from 'jspdf'
import path from 'node:path'
import fs from 'node:fs'

export interface GuidePdfLink {
  kind: string
  label: string
  note: string | null
}

export interface GuidePdfStep {
  heading: string | null
  content: string
  videoUrl?: string | null
  /** Optional data URL (filled by the route) — embedded below the content. */
  imageDataUrl?: string | null
  links?: GuidePdfLink[]
}

export interface GuidePdfData {
  venueName: string
  title: string
  description?: string | null
  category?: string | null
  requiresSignOff?: boolean
  steps: GuidePdfStep[]
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

  // Header
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(120)
  doc.text(data.venueName.toUpperCase(), margin, y)
  y += 9

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(0)
  const titleLines = doc.splitTextToSize(data.title.toUpperCase(), innerW) as string[]
  doc.text(titleLines, margin, y)
  y += titleLines.length * 7 + 2

  const meta = [
    data.category ? `CATEGORY: ${data.category.toUpperCase()}` : null,
    data.requiresSignOff ? 'MANAGER SIGN-OFF REQUIRED' : 'SELF-COMPLETE',
  ]
    .filter(Boolean)
    .join(' · ')
  if (meta) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(120)
    doc.text(meta, margin, y)
    y += 6
  }

  if (data.description) {
    ensure(10)
    const descLines = doc.splitTextToSize(data.description, innerW) as string[]
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(9)
    doc.setTextColor(90)
    doc.text(descLines, margin, y + 4)
    y += 4 + descLines.length * 4.5
  }

  y += 4
  doc.setLineWidth(0.3)
  doc.setDrawColor(0)
  doc.line(margin, y, pageW - margin, y)
  y += 8

  // Steps
  for (let i = 0; i < data.steps.length; i++) {
    const s = data.steps[i]
    ensure(12)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(0)
    doc.text(`STEP ${i + 1}${s.heading ? ` — ${s.heading.toUpperCase()}` : ''}`, margin, y)
    y += 6

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    doc.setTextColor(30)
    const contentLines = doc.splitTextToSize(s.content, innerW) as string[]
    for (const line of contentLines) {
      ensure(5)
      doc.text(line, margin, y)
      y += 4.8
    }

    for (const l of s.links ?? []) {
      ensure(8)
      const label = `${LINK_LABEL[l.kind] ?? l.kind}: ${l.label}${l.note ? ` — ${l.note}` : ''}`
      const linkLines = doc.splitTextToSize(label, innerW - 6) as string[]
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)
      doc.setTextColor(80)
      doc.text('▪', margin, y)
      doc.text(linkLines, margin + 4, y)
      y += linkLines.length * 4.2 + 1
    }

    if (s.videoUrl) {
      ensure(8)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(80)
      const vLines = doc.splitTextToSize(`WATCH VIDEO: ${s.videoUrl}`, innerW) as string[]
      doc.text(vLines, margin, y)
      y += vLines.length * 4 + 2
    }

    if (s.imageDataUrl) {
      try {
        const img = doc.getImageProperties(s.imageDataUrl)
        const maxW = innerW
        const maxH = 60
        const scale = Math.min(maxW / img.width, maxH / img.height, 1)
        const w = img.width * scale
        const h = img.height * scale
        ensure(h + 4)
        doc.addImage(s.imageDataUrl, 'JPEG', margin, y, w, h)
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
    doc.text(`HOSPO OPS — ${venueName.toUpperCase()}`, pageW / 2, footerY, { align: 'center' })
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
