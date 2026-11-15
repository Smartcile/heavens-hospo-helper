// Server-only evidence pack for a confirmed vPermit claim. Writes a private
// PDF, the vendor confirmation screenshot and the raw HTML under UPLOAD_PATH so
// the admin can send one file when an infringement needs evidence.
//
// Never import this from a client component.

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { jsPDF } from 'jspdf'
import { pdfSafe } from './pdf-safe'
import { storageDir, storageRel, storageRoot } from './storage'

export interface FtpEvidenceInput {
  claimId: string
  venueName: string
  typeName: string
  plate: string | null
  credentialKind: string
  membershipNumber: string | null
  contactName: string | null
  contactEmail: string | null
  contactPhone: string | null
  status: string
  claimedAt: Date
  timezone: string
  validFrom: string | null
  validUntil: string | null
  locations: string[]
  confirmationText: string | null
  screenshot: Buffer | null
  html: string | null
}

export interface FtpEvidencePaths {
  pdfPath: string | null
  imagePath: string | null
  htmlPath: string | null
}

function stamp(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-NZ', {
    timeZone: timezone,
    dateStyle: 'medium',
    timeStyle: 'short',
    hour12: false,
  }).format(date)
}

function buildPdf(
  input: FtpEvidenceInput,
  imageDataUrl: string | null,
): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 15
  const innerW = pageW - margin * 2
  let y = 20

  function pageIfNeeded(needed: number) {
    if (y + needed <= pageH - margin) return
    doc.addPage()
    y = 20
  }

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(120)
  doc.text(pdfSafe(input.venueName).toUpperCase(), margin, y)
  y += 8

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(0)
  doc.text('PARKING EVIDENCE', margin, y)
  y += 7

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(110)
  doc.text(`CLAIM ${input.claimId}`, margin, y)
  y += 9

  function row(label: string, value: string | null) {
    if (!value) return
    pageIfNeeded(7)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(120)
    doc.text(label.toUpperCase(), margin, y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(0)
    const lines = doc.splitTextToSize(pdfSafe(value), innerW - 42) as string[]
    doc.text(lines, margin + 42, y)
    y += Math.max(6, lines.length * 5 + 1)
  }

  row('Status', input.status)
  row('Parking type', input.typeName)
  row('Plate', input.plate)
  row(
    'Credential',
    input.credentialKind === 'ADMIN_PIN'
      ? 'ADMIN PIN'
      : input.membershipNumber
        ? `MEMBER ${input.membershipNumber}`
        : 'MEMBER',
  )
  row('Name', input.contactName)
  row('Email', input.contactEmail)
  row('Phone', input.contactPhone)
  row('Claimed at', stamp(input.claimedAt, input.timezone))
  row('Valid from', input.validFrom)
  row('Valid until', input.validUntil)
  if (input.locations.length) row('Locations', input.locations.join(' · '))

  if (input.confirmationText) {
    y += 3
    pageIfNeeded(12)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(120)
    doc.text('VENDOR CONFIRMATION', margin, y)
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(0)
    const lines = doc.splitTextToSize(pdfSafe(input.confirmationText), innerW) as string[]
    for (const line of lines.slice(0, 80)) {
      pageIfNeeded(5)
      doc.text(line, margin, y)
      y += 4.5
    }
  }

  if (imageDataUrl) {
    doc.addPage()
    y = 20
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(0)
    doc.text('VENDOR CONFIRMATION SCREEN', margin, y)
    y += 7
    const props = doc.getImageProperties(imageDataUrl)
    const maxW = innerW
    const maxH = pageH - y - margin
    const ratio = Math.min(maxW / props.width, maxH / props.height)
    const width = props.width * ratio
    const height = props.height * ratio
    doc.addImage(imageDataUrl, 'PNG', margin, y, width, height)
  }

  const pages = doc.getNumberOfPages()
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(140)
    doc.text(`HOSPO OPS · PAGE ${page} OF ${pages}`, pageW - margin, pageH - 8, {
      align: 'right',
    })
  }
  return doc
}

export async function writeFtpEvidence(
  input: FtpEvidenceInput,
): Promise<FtpEvidencePaths> {
  const root = storageRoot()
  const dir = storageDir('evidence', 'ftp', input.claimId)
  await mkdir(dir, { recursive: true })

  let imagePath: string | null = null
  let htmlPath: string | null = null
  let pdfPath: string | null = null

  if (input.screenshot) {
    const file = path.join(dir, 'confirmation.png')
    await writeFile(file, input.screenshot)
    imagePath = storageRel(root, file) || null
  }
  if (input.html) {
    const file = path.join(dir, 'confirmation.html')
    await writeFile(file, input.html, 'utf8')
    htmlPath = storageRel(root, file) || null
  }

  try {
    const imageDataUrl = input.screenshot
      ? `data:image/png;base64,${input.screenshot.toString('base64')}`
      : null
    const doc = buildPdf(input, imageDataUrl)
    const buffer = Buffer.from(doc.output('arraybuffer'))
    const file = path.join(dir, 'evidence.pdf')
    await writeFile(file, buffer)
    pdfPath = storageRel(root, file) || null
  } catch {
    pdfPath = null
  }

  return { pdfPath, imagePath, htmlPath }
}
