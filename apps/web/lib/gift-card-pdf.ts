import { jsPDF } from 'jspdf'

export interface GiftCardPdfData {
  number: string
  amount: number
  customerName: string
  issueDate: string
  message?: string
}

export function generateGiftCardPdf(data: GiftCardPdfData): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 20
  const innerW = pageW - margin * 2

  let y = 30

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.text('Akarana EATERY', pageW / 2, y, { align: 'center' })
  y += 12

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text('GIFT VOUCHER', pageW / 2, y, { align: 'center' })
  y += 18

  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('VOUCHER TO THE VALUE OF:', pageW / 2, y, { align: 'center' })
  y += 8

  doc.setFontSize(18)
  doc.text(`$${data.amount.toFixed(2)}`, pageW / 2, y, { align: 'center' })
  y += 16

  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.text(`VOUCHER NUMBER: ${data.number}`, pageW / 2, y, { align: 'center' })
  y += 7

  doc.setFont('helvetica', 'normal')
  doc.text(`DATE OF ISSUE: ${data.issueDate}`, pageW / 2, y, { align: 'center' })
  y += 20

  const termsY = y
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('TERMS & CONDITIONS', margin, y)
  y += 7

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  const terms = [
    'Not redeemable for cash.',
    'Voucher can be used across multiple purchases until the full value is redeemed.',
    'Only valid for food and beverage.',
    'A physical or digital voucher must be shown at the time of redemption.',
    'Please mention voucher upon booking.',
    'Valid for 12 months from date of issue.',
  ]
  for (const term of terms) {
    doc.text(`\u2022  ${term}`, margin + 4, y)
    y += 5
  }
  y += 6

  const personalMessage = data.message || 'Something special just for you - see you soon!'
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(10)
  doc.text(personalMessage, pageW / 2, y, { align: 'center' })

  const footerY = pageH - 35
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('Akarana EATERY', pageW / 2, footerY, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  const footerLines = [
    '8-10 Tamaki Drive, Orakei, Auckland',
    '09 520 0203 | akarana.co.nz',
    'info@akaranaeatery.co.nz',
  ]
  for (let i = 0; i < footerLines.length; i++) {
    doc.text(footerLines[i], pageW / 2, footerY + 5 + i * 4, { align: 'center' })
  }

  return doc
}

export function giftCardPdfToBuffer(doc: jsPDF): Buffer {
  const arrayBuffer = doc.output('arraybuffer')
  return Buffer.from(arrayBuffer)
}
