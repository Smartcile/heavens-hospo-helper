import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { discoverPdfFields, GIFT_CARD_DATA_KEYS, GIFT_CARD_AMOUNT_FORMATS, GiftCardFieldMapping } from '@/lib/gift-card-template'
import { readFileSync, existsSync } from 'fs'

const VALID_KEYS = new Set<string>([...GIFT_CARD_DATA_KEYS.map((k) => k.key), ''])
const VALID_FORMATS = new Set<string>(GIFT_CARD_AMOUNT_FORMATS.map((f) => f.value))

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'performance.giftcards.issue')
  if (denied) return denied

  const template = await prisma.giftCardTemplate.findFirst({
    where: { id: params.id, venueId: session.user.venueId, deletedAt: null },
  })
  if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { name, fieldMapping, isActive } = await req.json()

  let data: Record<string, unknown> = {}
  if (typeof name === 'string' && name.trim()) data.name = name.trim()

  if (fieldMapping !== undefined) {
    if (!Array.isArray(fieldMapping)) return NextResponse.json({ error: 'fieldMapping must be an array' }, { status: 400 })

    let fields: { name: string; type: string }[] = []
    if (existsSync(template.filePath)) {
      try {
        fields = await discoverPdfFields(readFileSync(template.filePath))
      } catch (err) {
        return NextResponse.json({ error: 'Template PDF is unreadable' }, { status: 400 })
      }
    }
    const fieldNames = new Set(fields.map((f) => f.name))

    for (const m of fieldMapping as GiftCardFieldMapping[]) {
      if (!m || typeof m.pdfField !== 'string' || !fieldNames.has(m.pdfField)) {
        return NextResponse.json({ error: `Unknown form field "${m?.pdfField ?? ''}"` }, { status: 400 })
      }
      if (!VALID_KEYS.has(m.dataKey ?? '')) {
        return NextResponse.json({ error: `Invalid data key "${m.dataKey}"` }, { status: 400 })
      }
      if (m.dataKey !== 'amount' && m.format !== undefined) {
        return NextResponse.json({ error: `Format only applies to amount fields` }, { status: 400 })
      }
      if (m.format !== undefined && !VALID_FORMATS.has(m.format)) {
        return NextResponse.json({ error: `Invalid format "${m.format}"` }, { status: 400 })
      }
    }

    data.fieldMapping = JSON.parse(JSON.stringify(fieldMapping))
  }

  if (isActive !== undefined) {
    data.isActive = !!isActive
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (data.isActive) {
      await tx.giftCardTemplate.updateMany({
        where: { venueId: session.user.venueId, id: { not: params.id }, deletedAt: null },
        data: { isActive: false },
      })
    }
    return tx.giftCardTemplate.update({ where: { id: params.id }, data })
  })

  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'performance.giftcards.issue')
  if (denied) return denied

  const template = await prisma.giftCardTemplate.findFirst({
    where: { id: params.id, venueId: session.user.venueId, deletedAt: null },
  })
  if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.giftCardTemplate.update({ where: { id: params.id }, data: { deletedAt: new Date() } })
  return NextResponse.json({ ok: true })
}
