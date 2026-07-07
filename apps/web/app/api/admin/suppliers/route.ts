import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const suppliers = await prisma.supplier.findMany({
    where: { venueId: session.user.venueId, deletedAt: null },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json(suppliers)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, contact, email, phone, notes } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const supplier = await prisma.supplier.create({
    data: {
      venueId: session.user.venueId,
      name: name.toUpperCase().trim(),
      contact: contact || null,
      email: email || null,
      phone: phone || null,
      notes: notes || null,
    },
  })
  return NextResponse.json(supplier, { status: 201 })
}
