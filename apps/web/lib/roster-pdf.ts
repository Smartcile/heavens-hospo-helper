import { jsPDF } from 'jspdf'
import { shiftPaidHours, type RosterShift, type StaffRate } from '@/lib/roster-math'

export interface RosterPdfStaff {
  id: string
  name: string
}

export interface RosterPdfData {
  venueName: string
  weekLabel: string // e.g. "MON 10 AUG — SUN 16 AUG 2026"
  weekDates: string[] // 7 date keys, Monday-first
  staff: RosterPdfStaff[]
  shifts: RosterShift[]
  rates: StaffRate[]
}

const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

/** A4 week roster: staff down the left, 7 day columns, shift blocks inside. */
export function generateRosterPdf(data: RosterPdfData): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 12
  const innerW = pageW - margin * 2

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(120)
  doc.text(data.venueName.toUpperCase(), margin, 14)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(0)
  doc.text('WEEKLY ROSTER', margin, 22)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(data.weekLabel, margin + 45, 22)

  // Column layout: staff column 55mm, then 7 equal day columns.
  const staffColW = 55
  const dayW = (innerW - staffColW) / 7
  let y = 30
  const rowH = 22

  const rateById = new Map(data.rates.map((r) => [r.staffId, r.hourlyRate ?? 0]))

  for (let s = 0; s < data.staff.length; s++) {
    const staff = data.staff[s]
    const isLast = s === data.staff.length - 1
    const rowBottom = y + rowH

    doc.setDrawColor(180)
    doc.setLineWidth(0.2)
    doc.rect(margin, y, staffColW, rowH)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(0)
    doc.text(`${s + 1}. ${staff.name.toUpperCase()}`, margin + 2, y + 5)

    const staffShifts = data.shifts.filter((sh) => sh.staffId === staff.id)
    const totalHours = staffShifts.reduce((t, sh) => t + shiftPaidHours(sh), 0)
    const totalCost = staffShifts.reduce((t, sh) => t + (rateById.get(sh.staffId) ?? 0) * shiftPaidHours(sh), 0)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(100)
    doc.text(`${totalHours.toFixed(2)}HRS / $${totalCost.toFixed(2)}`, margin + 2, y + 10)

    for (let d = 0; d < 7; d++) {
      const x = margin + staffColW + d * dayW
      doc.rect(x, y, dayW, rowH)
      const dayShifts = staffShifts.filter((sh) => sh.date === data.weekDates[d])
      let dy = y + 5
      for (const sh of dayShifts) {
        doc.setFontSize(6.5)
        doc.setTextColor(0)
        doc.setFont('helvetica', 'bold')
        doc.text(`${sh.startTime}-${sh.endTime}`, x + 1, dy)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(80)
        const label = sh.tag ?? sh.positionName ?? ''
        if (label) doc.text(label.toUpperCase(), x + 1, dy + 3.5)
        dy += 8
      }
    }

    doc.setFontSize(7)
    doc.setTextColor(150)
    doc.text(`PAID HRS: ${totalHours.toFixed(2)}`, margin + staffColW + 0, rowBottom - 3)

    y = rowBottom + 1
    if (s > 0 && s % 12 === 0 && !isLast) {
      doc.addPage('a4', 'landscape')
      y = 18
    }
  }

  return doc
}
