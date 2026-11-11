import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { validateTemplateConfig } from '@/lib/invoice-import'
import { nextTemplateVersion, normaliseTemplateConfig } from '@/lib/supplier-template'
import { resolvePurchasingVenue } from '@/lib/purchasing-api'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'ops.purchasing.view')
  if (denied) return denied

  const venueId = resolvePurchasingVenue(session.user, req.nextUrl.searchParams.get('venueId'))
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })

  const supplierId = req.nextUrl.searchParams.get('supplierId')
  if (!supplierId) return NextResponse.json({ error: 'supplierId is required' }, { status: 400 })

  const supplier = await prisma.supplier.findFirst({
    where: { id: supplierId, venueId, deletedAt: null },
    select: { id: true },
  })
  if (!supplier) return NextResponse.json({ error: 'Supplier not found for this venue' }, { status: 404 })

  const templates = await prisma.supplierInvoiceTemplate.findMany({
    where: { supplierId, deletedAt: null },
    orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
  })
  return NextResponse.json(templates)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'ops.purchasing.create')
  if (denied) return denied

  const body = await req.json().catch(() => null) as {
    venueId?: string
    supplierId?: string
    name?: unknown
    config?: unknown
    sampleFingerprint?: string | null
    notes?: string | null
  } | null

  const venueId = resolvePurchasingVenue(session.user, body?.venueId)
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })
  if (!body?.supplierId) return NextResponse.json({ error: 'supplierId is required' }, { status: 400 })

  const supplier = await prisma.supplier.findFirst({
    where: { id: body.supplierId, venueId, deletedAt: null },
    select: { id: true },
  })
  if (!supplier) return NextResponse.json({ error: 'Supplier not found for this venue' }, { status: 404 })

  const name = String(body?.name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const errors = validateTemplateConfig(body?.config as never)
  if (errors.length > 0) {
    return NextResponse.json({ error: 'INVALID TEMPLATE', details: errors }, { status: 400 })
  }
  const config = normaliseTemplateConfig(body?.config)

  const existing = await prisma.supplierInvoiceTemplate.findMany({
    where: { supplierId: supplier.id },
    select: { version: true },
  })

  const template = await prisma.supplierInvoiceTemplate.create({
    data: {
      supplierId: supplier.id,
      name,
      version: nextTemplateVersion(existing.map((row) => row.version)),
      config,
      sampleFingerprint: body?.sampleFingerprint ?? null,
      status: 'DRAFT',
      notes: body?.notes ?? null,
    },
  })

  return NextResponse.json(template, { status: 201 })
}
