import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { extractPdfText } from '@/lib/pdf-text.server'
import { buildInvoiceLearnPrompt } from '@/lib/invoice-import'
import { resolvePurchasingVenue } from '@/lib/purchasing-api'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'ops.purchasing.view')
  if (denied) return denied

  const body = await req.json().catch(() => null) as {
    venueId?: string
    supplierId?: string
    sampleText?: string
    fileBase64?: string
  } | null

  const venueId = resolvePurchasingVenue(session.user, body?.venueId)
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })
  if (!body?.supplierId) return NextResponse.json({ error: 'supplierId is required' }, { status: 400 })

  const supplier = await prisma.supplier.findFirst({
    where: { id: body.supplierId, venueId, deletedAt: null },
    select: { id: true, name: true },
  })
  if (!supplier) return NextResponse.json({ error: 'Supplier not found for this venue' }, { status: 404 })

  let text = typeof body.sampleText === 'string' ? body.sampleText : ''
  if (!text && body.fileBase64) {
    const base64 = body.fileBase64.replace(/^data:[^;]*;base64,/, '')
    const buffer = Buffer.from(base64, 'base64')
    if (buffer.length === 0) return NextResponse.json({ error: 'Empty file' }, { status: 400 })
    const extracted = await extractPdfText(buffer)
    text = extracted.text
  }

  return NextResponse.json({ prompt: buildInvoiceLearnPrompt(supplier.name, text) })
}
