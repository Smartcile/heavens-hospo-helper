import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { validateTemplateConfig } from '@/lib/invoice-import'
import { nextTemplateVersion, normaliseTemplateConfig } from '@/lib/supplier-template'
import { resolvePurchasingVenue } from '@/lib/purchasing-api'

interface Params {
  params: { id: string }
}

const STATUSES = ['DRAFT', 'ACTIVE']

async function loadTemplate(id: string, venueId: string) {
  return prisma.supplierInvoiceTemplate.findFirst({
    where: { id, deletedAt: null, supplier: { venueId, deletedAt: null } },
    include: { supplier: { select: { id: true, name: true, venueId: true } } },
  })
}

export async function GET(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'ops.purchasing.view')
  if (denied) return denied

  const venueId = resolvePurchasingVenue(session.user, req.nextUrl.searchParams.get('venueId'))
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })

  const template = await loadTemplate(params.id, venueId)
  if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(template)
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'ops.purchasing.edit')
  if (denied) return denied

  const body = await req.json().catch(() => null) as {
    venueId?: string
    name?: unknown
    config?: unknown
    status?: string
    notes?: string | null
  } | null

  const venueId = resolvePurchasingVenue(session.user, body?.venueId)
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })

  const template = await loadTemplate(params.id, venueId)
  if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const data: Record<string, unknown> = {}
  if (body?.name !== undefined) {
    const name = String(body.name).trim()
    if (!name) return NextResponse.json({ error: 'name cannot be blank' }, { status: 400 })
    data.name = name
  }
  if (body?.notes !== undefined) data.notes = body.notes
  if (body?.status !== undefined && STATUSES.includes(body.status)) data.status = body.status

  if (body?.config !== undefined) {
    const errors = validateTemplateConfig(body.config as never)
    if (errors.length > 0) {
      return NextResponse.json({ error: 'INVALID TEMPLATE', details: errors }, { status: 400 })
    }
    const config = normaliseTemplateConfig(body.config)
    const changed = JSON.stringify(config) !== JSON.stringify(template.config)
    data.config = config
    if (changed) {
      const existing = await prisma.supplierInvoiceTemplate.findMany({
        where: { supplierId: template.supplierId },
        select: { version: true },
      })
      data.version = nextTemplateVersion(existing.map((row) => row.version))
      data.lastVerifiedAt = null
    }
  }

  const updated = await prisma.supplierInvoiceTemplate.update({ where: { id: template.id }, data })
  return NextResponse.json(updated)
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'ops.purchasing.delete')
  if (denied) return denied

  const venueId = resolvePurchasingVenue(session.user, req.nextUrl.searchParams.get('venueId'))
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })

  const template = await loadTemplate(params.id, venueId)
  if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.supplierInvoiceTemplate.update({ where: { id: template.id }, data: { deletedAt: new Date() } })
  return NextResponse.json({ success: true })
}
