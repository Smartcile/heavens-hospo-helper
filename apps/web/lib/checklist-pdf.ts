import { jsPDF } from 'jspdf'

export interface ChecklistPdfTask {
  title: string
  sectionName?: string | null
}

export interface ChecklistPdfData {
  venueName: string
  name: string
  description?: string | null
  appearFromTime?: string | null
  tasks: ChecklistPdfTask[]
}

export function generateChecklistPdf(data: ChecklistPdfData): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 15
  const innerW = pageW - margin * 2

  let y = 20

  // Header
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(120)
  doc.text(data.venueName.toUpperCase(), margin, y)
  y += 9

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(0)
  doc.text(data.name.toUpperCase(), margin, y)
  y += 6

  if (data.description) {
    const descLines = doc.splitTextToSize(data.description, innerW) as string[]
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(9)
    doc.setTextColor(90)
    doc.text(descLines, margin, y + 4)
    y += 4 + descLines.length * 4.5
  }

  if (data.appearFromTime) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(120)
    doc.text(`SHOWS ON THE FLOOR FROM ${data.appearFromTime}`, margin, y + 4)
    y += 8
  }

  // Fill-in line + divider
  y += 6
  doc.setFontSize(10)
  doc.setTextColor(0)
  doc.text('DATE: ______________________  STAFF: ______________________', margin, y)
  y += 8
  doc.setLineWidth(0.3)
  doc.line(margin, y, pageW - margin, y)
  y += 8

  // Tasks with checkbox squares
  doc.setFont('helvetica', 'normal')
  for (let i = 0; i < data.tasks.length; i++) {
    if (y > pageH - 20) {
      doc.addPage()
      y = 20
    }
    const t = data.tasks[i]
    doc.setLineWidth(0.3)
    doc.rect(margin, y - 3.5, 4, 4)
    const tag = t.sectionName ? `  (${t.sectionName})` : ''
    const wrapped = doc.splitTextToSize(`${i + 1}. ${t.title}${tag}`, innerW - 8) as string[]
    doc.setFontSize(10)
    doc.setTextColor(0)
    doc.text(wrapped, margin + 7, y)
    y += wrapped.length * 4.5 + 4
  }

  // Footer on every page
  const footerY = pageH - 12
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(140)
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.text(`HOSPO OPS - ${data.venueName.toUpperCase()}`, pageW / 2, footerY, { align: 'center' })
    doc.text(`${i} / ${pages}`, pageW / 2, footerY - 4, { align: 'center' })
  }

  return doc
}

export function checklistPdfToBuffer(doc: jsPDF): ArrayBuffer {
  return doc.output('arraybuffer')
}
