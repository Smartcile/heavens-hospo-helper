import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { completeGrantSet, registryErrors } from '@/lib/permissions/registry'

// Access-control management — ADMIN only. Grants are per venue; the `restricted`
// flag is per staff member (when false the staff member keeps legacy full access).

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const staff = await prisma.staff.findUnique({
    where: { id: params.id, deletedAt: null },
    select: {
      restricted: true,
      venueId: true,
      staffVenues: { select: { venueId: true } },
      permissions: {
        where: { deletedAt: null },
        select: { venueId: true, permissionKey: true },
      },
    },
  })
  if (!staff) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(staff)
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const errors = registryErrors()
  if (errors.length > 0) {
    return NextResponse.json({ error: `Permission registry invalid: ${errors.join('; ')}` }, { status: 500 })
  }

  const body = (await req.json()) as {
    restricted?: boolean
    grants?: { venueId: string; keys: string[] }[]
  }

  const target = await prisma.staff.findUnique({
    where: { id: params.id, deletedAt: null },
    select: { id: true, restricted: true },
  })
  if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Venue scoping: a target's grants must stay within its own venues.
  const targetWithVenues = await prisma.staff.findUnique({
    where: { id: params.id, deletedAt: null },
    select: { venueId: true, staffVenues: { select: { venueId: true } } },
  })
  if (!targetWithVenues) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const allowedVenues = new Set([
    targetWithVenues.venueId,
    ...targetWithVenues.staffVenues.map((v) => v.venueId),
  ])

  await prisma.$transaction(async (tx) => {
    await tx.staff.update({
      where: { id: params.id },
      data: { restricted: body.restricted ?? target.restricted },
    })
    await tx.staffPermission.deleteMany({ where: { staffId: params.id } })
    const rows: { staffId: string; venueId: string; permissionKey: string }[] = []
    for (const g of body.grants ?? []) {
      if (!allowedVenues.has(g.venueId)) continue
      for (const key of completeGrantSet(g.keys)) {
        rows.push({ staffId: params.id, venueId: g.venueId, permissionKey: key })
      }
    }
    if (rows.length > 0) await tx.staffPermission.createMany({ data: rows })
  })

  return NextResponse.json({ success: true })
}
