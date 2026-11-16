import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { resolveScopedVenueId } from '@/lib/venue-scope'
import { normaliseGroupInput } from '@/lib/customer-groups'
import { customerGroupInclude, customerGroupView } from '@/lib/customer-groups.server'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'customers.customers.view')
  if (denied) return denied

  const scoped = resolveScopedVenueId(session, req)
  if ('error' in scoped) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const groups = await prisma.customerGroup.findMany({
    where: { venueId: scoped.venueId, deletedAt: null },
    include: customerGroupInclude,
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  })
  return NextResponse.json({ venueId: scoped.venueId, groups: groups.map(customerGroupView) })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'customers.customers.edit')
  if (denied) return denied

  const body = await req.json().catch(() => ({}))
  const scoped = resolveScopedVenueId(session, req, typeof body.venueId === 'string' ? body.venueId : undefined)
  if ('error' in scoped) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const parsed = normaliseGroupInput(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 422 })
  const value = parsed.value

  const existing = await prisma.customerGroup.findFirst({
    where: { venueId: scoped.venueId, slug: value.slug },
  })
  if (existing && !existing.deletedAt) {
    return NextResponse.json({ error: 'A DATABASE WITH THAT SLUG ALREADY EXISTS' }, { status: 409 })
  }

  const data = {
    venueId: scoped.venueId,
    name: value.name,
    slug: value.slug,
    kind: value.kind,
    description: value.description,
    colour: value.colour,
    isActive: value.isActive,
    sortOrder: value.sortOrder,
    swiftPosTypeActive: value.mapping.typeActive,
    swiftPosStatusActive: value.mapping.statusActive,
    swiftPosTypeRemoved: value.mapping.typeRemoved,
    swiftPosStatusRemoved: value.mapping.statusRemoved,
    exportEncoding: value.mapping.exportEncoding,
    deletedAt: null,
  }

  const group = existing
    ? await prisma.customerGroup.update({
        where: { id: existing.id },
        data: {
          ...data,
          areas: {
            deleteMany: {},
            create: value.areas.map((area) => ({ area })),
          },
        },
        include: customerGroupInclude,
      })
    : await prisma.customerGroup.create({
        data: {
          ...data,
          areas: { create: value.areas.map((area) => ({ area })) },
        },
        include: customerGroupInclude,
      })

  return NextResponse.json({ group: customerGroupView(group) }, { status: existing ? 200 : 201 })
}
