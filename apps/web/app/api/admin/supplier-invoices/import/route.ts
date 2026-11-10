import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { extractPdfText } from '@/lib/pdf-text.server'
import { storageDir } from '@/lib/storage'
import { normaliseTemplateConfig } from '@/lib/supplier-template'
import { parseInvoiceText } from '@/lib/invoice-import'
import {
  compareLineToPurchaseOrder,
  matchInvoiceLine,
  normaliseInvoiceText,
  type MatchContext,
} from '@/lib/invoice-match'
import { findSimilar } from '@/lib/import/similarity'
import { resolvePurchasingVenue, safePdfFilename } from '@/lib/purchasing-api'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'ops.purchasing.view')
  if (denied) return denied

  const body = await req.json().catch(() => null) as {
    venueId?: string
    supplierId?: string
    templateId?: string
    fileBase64?: string
    fileName?: string
    text?: string
  } | null

  const venueId = resolvePurchasingVenue(session.user, body?.venueId)
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })
  if (!body?.supplierId) return NextResponse.json({ error: 'supplierId is required' }, { status: 400 })

  const supplier = await prisma.supplier.findFirst({
    where: { id: body.supplierId, venueId, deletedAt: null },
    select: { id: true, name: true },
  })
  if (!supplier) return NextResponse.json({ error: 'Supplier not found for this venue' }, { status: 404 })

  let text = typeof body.text === 'string' ? body.text : ''
  let fileUrl: string | null = null

  if (!text && body.fileBase64) {
    const base64 = body.fileBase64.replace(/^data:[^;]*;base64,/, '')
    const buffer = Buffer.from(base64, 'base64')
    if (buffer.length === 0) return NextResponse.json({ error: 'Empty file' }, { status: 400 })
    if (buffer.length > 25 * 1024 * 1024) {
      return NextResponse.json({ error: 'FILE IS TOO LARGE (MAX 25MB)' }, { status: 413 })
    }
    const root = storageDir()
    await mkdir(root, { recursive: true })
    const filename = safePdfFilename(body.fileName)
    await writeFile(join(root, filename), buffer)
    fileUrl = `/api/upload/${filename}`
    const extracted = await extractPdfText(buffer)
    text = extracted.text
  }

  if (!text.trim()) return NextResponse.json({ error: 'No invoice text to parse' }, { status: 400 })

  const template = body.templateId
    ? await prisma.supplierInvoiceTemplate.findFirst({
        where: { id: body.templateId, supplierId: supplier.id, deletedAt: null },
      })
    : await prisma.supplierInvoiceTemplate.findFirst({
        where: { supplierId: supplier.id, status: 'ACTIVE', deletedAt: null },
        orderBy: { version: 'desc' },
      })

  if (!template) {
    return NextResponse.json({ error: 'NO ACTIVE TEMPLATE', supplierId: supplier.id }, { status: 409 })
  }

  const parsed = parseInvoiceText(text, normaliseTemplateConfig(template.config))

  const [codes, aliases, items] = await Promise.all([
    prisma.supplierItemCode.findMany({
      where: { supplierId: supplier.id, deletedAt: null },
      select: { supplierSku: true, inventoryItemId: true },
    }),
    prisma.supplierItemAlias.findMany({
      where: { supplierId: supplier.id, deletedAt: null },
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

  // Try to link a purchase order by finding any of this supplier's PO numbers
  // in the invoice text.
  const orders = await prisma.purchaseOrder.findMany({
    where: { venueId, supplierId: supplier.id, deletedAt: null },
    include: { lines: { where: { deletedAt: null } } },
  })
  const lowerText = text.toLowerCase()
  const matchedOrder = orders.find((order) => order.number && lowerText.includes(order.number.toLowerCase()))
  const poLines = matchedOrder?.lines ?? []

  const lines = parsed.lines.map((line) => {
    const match = matchInvoiceLine(
      { description: line.description, supplierSku: line.supplierSku },
      ctx,
    )

    let poLine: (typeof poLines)[number] | undefined
    if (matchedOrder) {
      if (match.inventoryItemId) {
        poLine = poLines.find((candidate) => candidate.inventoryItemId === match.inventoryItemId)
      }
      if (!poLine) {
        const key = normaliseInvoiceText(line.description)
        poLine = poLines.find((candidate) => normaliseInvoiceText(candidate.description) === key)
      }
      if (!poLine && poLines.length > 0) {
        const best = findSimilar(
          line.description,
          poLines.map((candidate) => ({ id: candidate.id, name: candidate.description })),
        )
        if (best) poLine = poLines.find((candidate) => candidate.id === best.target.id)
      }
    }

    const comparison = poLine
      ? compareLineToPurchaseOrder(
          { qty: line.qty, unitPrice: line.unitPrice },
          { qty: poLine.qty, unitPrice: poLine.unitPrice },
        )
      : null

    return {
      description: line.description,
      supplierSku: line.supplierSku ?? null,
      qty: line.qty,
      unitPrice: line.unitPrice,
      lineTotal: line.lineTotal,
      match,
      poLine: poLine
        ? {
            id: poLine.id,
            description: poLine.description,
            qty: poLine.qty,
            unitPrice: poLine.unitPrice,
            comparison,
          }
        : null,
    }
  })

  return NextResponse.json({
    fileUrl,
    text,
    template: { id: template.id, name: template.name, version: template.version },
    header: parsed.header,
    lines,
    issues: parsed.issues,
    purchaseOrderId: matchedOrder?.id ?? null,
  })
}
