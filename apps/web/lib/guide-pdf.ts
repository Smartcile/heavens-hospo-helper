// Playbook guide PDF export — the same jsPDF pattern as checklist-pdf.ts.
// Pure and sync: image loading is done by the route and handed in as data
// URLs, so this module stays testable without the filesystem or the network.

import { jsPDF } from 'jspdf'
import path from 'node:path'
import fs from 'node:fs'
import { guideTypeLabel } from '@/lib/guide-types'
import { STEP_LINK_LABEL, type StepLinkKind } from '@/lib/guide-links'
import { isLightColour, plotArrow, type AnnotationData } from '@/lib/image-annotations'
import { pdfSafe } from '@/lib/pdf-safe'
import { storageRoot } from '@/lib/storage'

export interface GuidePdfLink {
  kind: string
  label: string
  /** Operator note; when absent the target's `sub` line is printed instead. */
  note: string | null
  /** "2× T20 TORX" — legacy rows may carry a quantity. */
  qty?: number | null
  /** Secondary line from the target (storage path, department, yields…). */
  sub?: string | null
  /** Target thumbnail (equipment photo) as a data URL, filled by the route. */
  imageDataUrl?: string | null
  /** Target no longer exists — printed in red, like the reader. */
  missing?: boolean
}

export interface GuidePdfStepImage {
  dataUrl: string
  /** The annotation layer for this photo (drawn over it), when it has one. */
  annotations?: AnnotationData | null
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
  /** Ordered step photos with their annotation layers — preferred over the plain lists. */
  images?: GuidePdfStepImage[]
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
  /** Printed as a "REFERENCE — NOT TRACKED" badge when false (like the reader). */
  isTracked?: boolean
  steps: GuidePdfStep[]
  /** Product-reference rows — rendered instead of steps when present. */
  table?: GuidePdfTableItem[] | null
}

// Accent colours matching GuideStepLinks on screen.
const LINK_ACCENT: Record<string, [number, number, number]> = {
  ITEM: [96, 165, 250],
  TASK: [120, 120, 120],
  CHECKLIST: [74, 222, 128],
  GUIDE: [249, 115, 22],
  SECTION: [192, 132, 252],
  RECIPE: [202, 165, 48],
}

function imageFormat(dataUrl: string): 'PNG' | 'JPEG' {
  return /^data:image\/png/i.test(dataUrl) ? 'PNG' : 'JPEG'
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return [239, 68, 68]
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/**
 * Draw one annotation layer over an already-embedded photo. Geometry is stored
 * as fractions of the image box, so it maps straight onto the printed rect.
 */
function drawPdfAnnotation(doc: jsPDF, data: AnnotationData, x: number, y: number, w: number, h: number) {
  for (const s of data.shapes) {
    const [r, g, b] = hexToRgb(s.color)
    doc.setDrawColor(r, g, b)
    doc.setFillColor(r, g, b)
    doc.setLineWidth(Math.max(0.25, s.width * h))
    doc.setLineCap('round')
    doc.setLineJoin('round')

    if (s.tool === 'pen' || s.tool === 'line') {
      for (let i = 1; i < s.points.length; i++) {
        doc.line(
          x + s.points[i - 1].x * w,
          y + s.points[i - 1].y * h,
          x + s.points[i].x * w,
          y + s.points[i].y * h,
        )
      }
    } else if (s.tool === 'arrow') {
      // Pixel-space geometry: shaft + head computed in the printed rect's units,
      // so the head is not distorted by a non-square photo.
      const { shaft, head } = plotArrow(s.points[0], s.points[1], w, h, s.width)
      doc.line(x + shaft[0].x, y + shaft[0].y, x + shaft[1].x, y + shaft[1].y)
      doc.triangle(
        x + head[0].x, y + head[0].y,
        x + head[1].x, y + head[1].y,
        x + head[2].x, y + head[2].y,
        'F',
      )
    } else {
      const [a, b2] = s.points
      doc.rect(
        x + Math.min(a.x, b2.x) * w,
        y + Math.min(a.y, b2.y) * h,
        Math.abs(b2.x - a.x) * w,
        Math.abs(b2.y - a.y) * h,
        'S',
      )
    }
  }

  for (const t of data.texts) {
    const [r, g, b] = hexToRgb(t.color)
    const size = Math.max(5, Math.min(24, t.size * h * 2.8346)) // pt
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(size)
    const text = pdfSafe(t.text)
    const tx = x + t.x * w
    const baseline = y + t.y * h
    const tw = doc.getTextWidth(text)
    const th = t.size * h
    // A readable plate behind the label — dark under light text (a white
    // plate would swallow white labels), light under everything else.
    if (isLightColour(t.color)) doc.setFillColor(10, 10, 10)
    else doc.setFillColor(255, 255, 255)
    doc.rect(tx - 0.6, baseline - th, tw + 1.2, th + 1, 'F')
    doc.setTextColor(r, g, b)
    doc.text(text, tx, baseline)
  }
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

  // One link rendered exactly like the reader card: accent bar, kind label,
  // qty + target, note/sub, and the target's photo when it has one.
  const drawLinkRow = (l: GuidePdfLink) => {
    const accent = LINK_ACCENT[l.kind] ?? [130, 130, 130]
    // Same wording as the worker reader: tools are "items needed" on the floor.
    const kindText = pdfSafe(l.kind === 'ITEM' ? 'ITEMS NEEDED' : STEP_LINK_LABEL[l.kind as StepLinkKind] ?? l.kind)
    const labelText = pdfSafe(`${l.qty && l.qty > 1 ? `${l.qty}x ` : ''}${l.label}`)
    const subText = l.note ? l.note : l.sub

    const imgSize = l.imageDataUrl ? 11 : 0
    const textX = margin + 4 + (imgSize ? imgSize + 3 : 0)
    const textW = pageW - margin - 4 - textX

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    const labelLines = doc.splitTextToSize(labelText, textW) as string[]
    doc.setFontSize(8)
    const subLines = subText ? (doc.splitTextToSize(pdfSafe(subText).toUpperCase(), textW) as string[]) : []

    // Baselines relative to the box top: kind at 5.5, label at 10.1, then
    // 4.0 per label line, then 3.4 per sub line — sized so the last line
    // never spills past the bottom border.
    const lastLabel = 10.1 + (labelLines.length - 1) * 4
    const lastSub = subLines.length ? 10.1 + labelLines.length * 4 + subLines.length * 3.4 : 0
    const rowH = Math.max(13, lastLabel + 2.5, lastSub + 2.5, imgSize + 4)

    ensure(rowH + 2.5)

    // The reader renders links as bordered cards with a coloured left edge;
    // the PDF prints the same box so GUIDE / TOOL links read as items, not
    // running text.
    doc.setFillColor(248, 249, 250)
    doc.setDrawColor(160, 166, 176)
    doc.setLineWidth(0.25)
    doc.rect(margin, y, innerW, rowH, 'FD')
    doc.setFillColor(accent[0], accent[1], accent[2])
    doc.rect(margin, y, 1.4, rowH, 'F')

    if (l.imageDataUrl) {
      try {
        const img = doc.getImageProperties(l.imageDataUrl)
        const scale = Math.min(imgSize / img.width, imgSize / img.height, 1)
        const w = img.width * scale
        const h = img.height * scale
        const iy = y + (rowH - h) / 2
        doc.addImage(l.imageDataUrl, imageFormat(l.imageDataUrl), margin + 3, iy, w, h)
        doc.setDrawColor(200)
        doc.setLineWidth(0.2)
        doc.rect(margin + 3, iy, w, h, 'S')
      } catch {
        // Unreadable thumbnail — the text row still prints.
      }
    }

    let ty = y + 5.5
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(accent[0], accent[1], accent[2])
    doc.text(kindText.toUpperCase(), textX, ty)
    ty += 4.6

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    if (l.missing) doc.setTextColor(200, 40, 40)
    else doc.setTextColor(20)
    for (const line of labelLines) {
      doc.text(line, textX, ty)
      ty += 4
    }

    if (subLines.length) {
      doc.setFontSize(8)
      doc.setTextColor(110)
      for (const line of subLines) {
        ty += 3.4
        doc.text(line, textX, ty)
      }
    }

    y += rowH + 2.5
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
    data.isTracked === false ? 'REFERENCE — NOT TRACKED' : null,
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
        ensure(h + 5)
        doc.addImage(item.imageDataUrl, imageFormat(item.imageDataUrl), margin, y, w, h)
        doc.setDrawColor(190)
        doc.setLineWidth(0.2)
        doc.rect(margin, y, w, h, 'S')
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
      drawLinkRow(l)
    }

    if (s.videoUrl || s.videoPath) {
      const vLabel = s.videoUrl ? `WATCH VIDEO: ${pdfSafe(s.videoUrl)}` : 'VIDEO — VIEW IN THE APP'
      paragraph(vLabel, { size: 8, style: 'normal', color: 80, lead: 4 })
      y += 2
    }

    const stepImages: GuidePdfStepImage[] =
      s.images?.length
        ? s.images
        : s.imageDataUrls?.length
          ? s.imageDataUrls.map((dataUrl) => ({ dataUrl }))
          : s.imageDataUrl
            ? [{ dataUrl: s.imageDataUrl }]
            : []
    for (let k = 0; k < stepImages.length; k++) {
      const { dataUrl: imgData, annotations: layer } = stepImages[k]
      try {
        const img = doc.getImageProperties(imgData)
        const maxW = innerW
        const maxH = 70
        const scale = Math.min(maxW / img.width, maxH / img.height, 1)
        const w = img.width * scale
        const h = img.height * scale
        const x = margin + (innerW - w) / 2
        ensure(h + (stepImages.length > 1 ? 10 : 6))
        if (stepImages.length > 1) {
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(7)
          doc.setTextColor(150)
          doc.text(`PHOTO ${k + 1} / ${stepImages.length}`, margin, y)
          y += 4
        }
        doc.addImage(imgData, imageFormat(imgData), x, y, w, h)
        doc.setDrawColor(190)
        doc.setLineWidth(0.2)
        doc.rect(x, y, w, h, 'S')
        if (layer && (layer.shapes.length > 0 || layer.texts.length > 0)) {
          drawPdfAnnotation(doc, layer, x, y, w, h)
        }
        y += h + 6
      } catch {
        // Unreadable image data — the step text is the content, keep going.
      }
    }

    y += 2
    if (i < data.steps.length - 1) {
      ensure(8)
      doc.setDrawColor(225)
      doc.setLineWidth(0.2)
      doc.line(margin, y, pageW - margin, y)
      y += 7
    }
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

const LOCAL_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
}

/**
 * Map an uploaded-file URL to its file on disk. Uploads serve from
 * `/api/upload/<name>` and live on the UPLOAD_PATH storage root (a mounted
 * volume in Docker) — NOT under public/, which is inside the image and wiped
 * on redeploy. `/uploads/<name>` is the legacy URL shape and also resolves
 * against the storage root.
 */
function storageFileForUrl(url: string): string | null {
  for (const prefix of ['/api/upload/', '/uploads/']) {
    if (!url.startsWith(prefix)) continue
    const name = decodeURIComponent(url.slice(prefix.length))
    if (!name || name.includes('/') || name.includes('\\') || name.includes('..')) return null
    return path.join(storageRoot(), name)
  }
  return null
}

/**
 * Load a step image into a data URL for jsPDF. Local uploads are read from
 * the storage root; remote URLs are fetched with a short timeout. Returns
 * null on any failure — the PDF falls back to text only.
 */
export async function loadImageDataUrl(url: string | null | undefined): Promise<string | null> {
  if (!url) return null
  if (url.startsWith('data:')) return url
  try {
    const file = storageFileForUrl(url)
    if (file) {
      const buf = await fs.promises.readFile(file)
      if (buf.byteLength > 2_000_000) return null
      const ext = path.extname(file).slice(1).toLowerCase()
      return `data:${LOCAL_MIME[ext] ?? 'image/png'};base64,${buf.toString('base64')}`
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
