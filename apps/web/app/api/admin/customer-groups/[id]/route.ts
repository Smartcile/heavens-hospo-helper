import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { resolveScopedVenueId } from '@/lib/venue-scope'
import { normaliseGroupInput } from '@/lib/customer-groups'
import {
  customerGroupInclude,
  customerGroupView,
  validateParkingTypeLink,
} from '@/lib/customer-groups.server'
import { syncCustomerGroupToParking } from '@/lib/customer-group-parking.server'

async function findGroup(venueId: string, id: string) {
  return prisma.customerGroup.findFirst({
    where: { id, venueId, deletedAt: null },
    include: customerGroupInclude,
  })
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'customers.customers.view')
  if (denied) return denied

  const scoped = resolveScopedVenueId(session, req)
  if ('error' in scoped) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const group = await findGroup(scoped.venueId, params.id)
  if (!group) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ group: customerGroupView(group) })
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'customers.customers.edit')
  if (denied) return denied

  const body = await req.json().catch(() => ({}))
  const scoped = resolveScopedVenueId(session, req, typeof body.venueId === 'string' ? body.venueId : undefined)
  if ('error' in scoped) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const existing = await findGroup(scoped.venueId, params.id)
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const parsed = normaliseGroupInput(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 422 })
  const value = parsed.value

  if (body.parkingTypeId !== undefined) {
    const link = await validateParkingTypeLink(scoped.venueId, value.parkingTypeId, params.id)
    if (!link.ok) return NextResponse.json({ error: link.error }, { status: link.status })
  }

  const clash = await prisma.customerGroup.findFirst({
    where: { venueId: scoped.venueId, slug: value.slug, id: { not: params.id } },
    select: { id: true, deletedAt: true },
  })
  if (clash && !clash.deletedAt) {
    return NextResponse.json({ error: 'A DATABASE WITH THAT SLUG ALREADY EXISTS' }, { status: 409 })
  }

  const group = await prisma.customerGroup.update({
    where: { id: params.id },
    data: {
      name: value.name,
      slug: value.slug,
      kind: value.kind,
      description: value.description,
      colour: value.colour,
      isActive: value.isActive,
      sortOrder: value.sortOrder,
      ...(body.parkingTypeId !== undefined ? { parkingTypeId: value.parkingTypeId } : {}),
      swiftPosTypeActive: value.mapping.typeActive,
      swiftPosStatusActive: value.mapping.statusActive,
      swiftPosTypeRemoved: value.mapping.typeRemoved,
      swiftPosStatusRemoved: value.mapping.statusRemoved,
      exportEncoding: value.mapping.exportEncoding,
      areas: {
        deleteMany: {},
        create: value.areas.map((area) => ({ area })),
      },
    },
    include: customerGroupInclude,
  })

  let parkingSync = null
  try {
    parkingSync = await syncCustomerGroupToParking(scoped.venueId, group.id)
  } catch (error) {
    console.error('customer database parking sync failed (non-blocking):', error)
  }

  return NextResponse.json({ group: customerGroupView(group), parkingSync })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'customers.customers.edit')
  if (denied) return denied

  const scoped = resolveScopedVenueId(session, req)
  if ('error' in scoped) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const result = await prisma.customerGroup.updateMany({
    where: { id: params.id, venueId: scoped.venueId, deletedAt: null },
    data: { deletedAt: new Date(), isActive: false },
  })
  if (result.count !== 1) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
