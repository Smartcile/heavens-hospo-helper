import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'ops.inventory.view')
  if (denied) return denied

  const venueId = session.user.role === 'MANAGER'
    ? session.user.venueId
    : req.nextUrl.searchParams.get('venueId') || session.user.venueId

  const suppliers = await prisma.supplier.findMany({
    where: { venueId, deletedAt: null },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json(suppliers)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'ops.inventory.create')
  if (denied) return denied

  const { name, contact, email, phone, notes, venueId: bodyVenueId } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const venueId = session.user.role === 'MANAGER' ? session.user.venueId : (bodyVenueId || session.user.venueId)

  const supplier = await prisma.supplier.create({
    data: {
      venueId,
      name: name.toUpperCase().trim(),
      contact: contact || null,
      email: email || null,
      phone: phone || null,
      notes: notes || null,
    },
  })
  return NextResponse.json(supplier, { status: 201 })
}
