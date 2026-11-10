import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { extractPdfText } from '@/lib/pdf-text.server'
import { normaliseTemplateConfig } from '@/lib/supplier-template'
import { parseInvoiceText } from '@/lib/invoice-import'
import { matchInvoiceLine, normaliseInvoiceText, type MatchContext } from '@/lib/invoice-match'
import { resolvePurchasingVenue } from '@/lib/purchasing-api'

interface Params {
  params: { id: string }
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'ops.purchasing.edit')
  if (denied) return denied

  const body = await req.json().catch(() => null) as {
    venueId?: string
    text?: string
    fileBase64?: string
  } | null

  const venueId = resolvePurchasingVenue(session.user, body?.venueId)
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })

  const template = await prisma.supplierInvoiceTemplate.findFirst({
    where: { id: params.id, deletedAt: null, supplier: { venueId, deletedAt: null } },
    include: { supplier: { select: { id: true, name: true } } },
  })
  if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let text = typeof body?.text === 'string' ? body.text : ''
  if (!text && body?.fileBase64) {
    const base64 = body.fileBase64.replace(/^data:[^;]*;base64,/, '')
    const buffer = Buffer.from(base64, 'base64')
    if (buffer.length === 0) return NextResponse.json({ error: 'Empty file' }, { status: 400 })
    const extracted = await extractPdfText(buffer)
    text = extracted.text
  }
  if (!text.trim()) return NextResponse.json({ error: 'No invoice text to test' }, { status: 400 })

  const parsed = parseInvoiceText(text, normaliseTemplateConfig(template.config))

  const [codes, aliases, items] = await Promise.all([
    prisma.supplierItemCode.findMany({
      where: { supplierId: template.supplierId, deletedAt: null },
      select: { supplierSku: true, inventoryItemId: true },
    }),
    prisma.supplierItemAlias.findMany({
      where: { supplierId: template.supplierId, deletedAt: null },
      select: { normalisedTextKey: true, inventoryItemId: true },
    }),
    prisma.inventoryItem.findMany({
      where: { venueId, deletedAt: null },
      select: { id: true, name: true },
    }),
  ])

  const bySku = new Map<string, string>()
  for (const code of codes) {
    const key = normaliseInvoiceText(code.supplierSku)
    if (key) bySku.set(key, code.inventoryItemId)
  }
  const aliasMap = new Map<string, string>()
  for (const alias of aliases) {
    if (alias.normalisedTextKey) aliasMap.set(alias.normalisedTextKey, alias.inventoryItemId)
  }
  const ctx: MatchContext = { bySku, aliases: aliasMap, items }

  const lines = parsed.lines.map((line) => ({
    ...line,
    match: matchInvoiceLine({ description: line.description, supplierSku: line.supplierSku }, ctx),
  }))
  const matched = lines.filter((line) => line.match.status === 'MATCHED').length
  const confidence = lines.length > 0 ? Math.round((matched / lines.length) * 100) / 100 : 0

  await prisma.supplierInvoiceTemplate.update({
    where: { id: template.id },
    data: { lastVerifiedAt: new Date() },
  })

  return NextResponse.json({
    header: parsed.header,
    lines,
    issues: parsed.issues,
    confidence,
  })
}
