import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { fillGiftCardTemplate, discoverPdfFields, GiftCardFieldMapping, GIFT_CARD_DATA_KEYS, GIFT_CARD_AMOUNT_FORMATS } from '@/lib/gift-card-template'
import { formatDate } from '@/lib/utils'
import { readFileSync, existsSync } from 'fs'

const VALID_KEYS = new Set<string>([...GIFT_CARD_DATA_KEYS.map((k) => k.key), ''])
const VALID_FORMATS = new Set<string>(GIFT_CARD_AMOUNT_FORMATS.map((f) => f.value))

async function loadTemplate(id: string, venueId: string) {
  const template = await prisma.giftCardTemplate.findFirst({
    where: { id, venueId, deletedAt: null },
  })
  if (!template) return { error: 'Not found', status: 404 } as const
  if (!template.filePath || !existsSync(template.filePath)) {
    return { error: 'Template has no PDF file — upload one first', status: 404 } as const
  }
  return { template }
}

function pdfResponse(buffer: Buffer): NextResponse {
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="Gift Card - Preview.pdf"',
    },
  })
}

/** Preview with the template's SAVED mapping (template card PREVIEW button). */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'performance.giftcards.view')
  if (denied) return denied

  const loaded = await loadTemplate(params.id, session.user.venueId)
  if ('error' in loaded) return NextResponse.json({ error: loaded.error }, { status: loaded.status })
  const { template } = loaded

  const buffer = await fillGiftCardTemplate(
    readFileSync(template.filePath as string),
    (template.fieldMapping as unknown as GiftCardFieldMapping[]) ?? [],
    {
      number: '20260001',
      amount: 50,
      customerName: 'SAMPLE CUSTOMER',
      issueDate: formatDate(new Date()),
      message: 'Something special just for you - see you soon!',
    },
  )
  return pdfResponse(buffer)
}

/**
 * Preview with a DRAFT mapping (the mapping editor's live right-hand panel).
 * Accepts the same mapping shape the PUT route validates; unknown fields or
 * invalid keys are rejected so the editor sees its own mistakes immediately.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'performance.giftcards.view')
  if (denied) return denied

  const loaded = await loadTemplate(params.id, session.user.venueId)
  if ('error' in loaded) return NextResponse.json({ error: loaded.error }, { status: loaded.status })
  const { template } = loaded

  const body = await req.json().catch(() => null)
  const fieldMapping = body?.fieldMapping
  if (!Array.isArray(fieldMapping)) {
    return NextResponse.json({ error: 'fieldMapping must be an array' }, { status: 400 })
  }

  let fieldNames = new Set<string>()
  try {
    const fields = await discoverPdfFields(readFileSync(template.filePath as string))
    fieldNames = new Set(fields.map((f) => f.name))
  } catch (err) {
    return NextResponse.json({ error: 'Template PDF is unreadable' }, { status: 400 })
  }

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

  const buffer = await fillGiftCardTemplate(
    readFileSync(template.filePath as string),
    fieldMapping as GiftCardFieldMapping[],
    {
      number: '20260001',
      amount: 50,
      customerName: 'SAMPLE CUSTOMER',
      issueDate: formatDate(new Date()),
      message: 'Something special just for you - see you soon!',
    },
  )
  return pdfResponse(buffer)
}
