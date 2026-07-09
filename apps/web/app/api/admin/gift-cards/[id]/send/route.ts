import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import fs from 'fs'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const card = await prisma.giftCard.findFirst({
    where: { id: params.id, venueId: session.user.venueId, deletedAt: null },
  })
  if (!card) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!card.pdfPath) return NextResponse.json({ error: 'PDF not yet generated. Issue the gift card first.' }, { status: 400 })

  const { smtpHost, smtpPort, smtpUser, smtpPass, smtpFrom, subject, body } = await req.json()

  if (!smtpHost || !smtpFrom || !card.customerEmail) {
    return NextResponse.json({ error: 'SMTP configuration and customer email are required' }, { status: 400 })
  }

  const nodemailer = await import('nodemailer')
  const transporter = nodemailer.default.createTransport({
    host: smtpHost,
    port: smtpPort || 587,
    secure: smtpPort === 465,
    auth: { user: smtpUser, pass: smtpPass },
  })

  const mailSubject = subject || `Your Gift Card - ${card.number}`
  const mailBody = body || `Please find your gift card attached.\n\nVoucher Number: ${card.number}\nAmount: $${card.amount.toFixed(2)}`

  await transporter.sendMail({
    from: smtpFrom,
    to: card.customerEmail,
    subject: mailSubject,
    text: mailBody,
    attachments: [{ filename: `Gift Card - ${card.number}.pdf`, path: card.pdfPath }],
  })

  const updated = await prisma.giftCard.update({
    where: { id: params.id },
    data: { status: 'SENT', sentAt: new Date() },
  })

  return NextResponse.json(updated)
}
