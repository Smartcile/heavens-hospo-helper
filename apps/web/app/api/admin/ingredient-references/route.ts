import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const venueId = session.user.role === 'MANAGER'
    ? session.user.venueId
    : req.nextUrl.searchParams.get('venueId') || session.user.venueId

  const refs = await prisma.ingredientReference.findMany({
    where: {
      deletedAt: null,
      OR: [{ venueId: null, isBuiltIn: true }, { venueId }],
    },
    orderBy: [{ isBuiltIn: 'desc' }, { name: 'asc' }],
  })
  return NextResponse.json(refs)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, densityGramsPerMl, weightPerUnitGrams, notes, venueId: bodyVenueId } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const venueId = session.user.role === 'MANAGER' ? session.user.venueId : (bodyVenueId || session.user.venueId)
  const upper = name.toUpperCase().trim()

  const existing = await prisma.ingredientReference.findFirst({
    where: { venueId, name: upper, deletedAt: null },
  })
  if (existing) return NextResponse.json({ error: 'KNOWN INGREDIENT ALREADY EXISTS' }, { status: 409 })

  const ref = await prisma.ingredientReference.create({
    data: {
      venueId,
      name: upper,
      densityGramsPerMl: densityGramsPerMl != null && densityGramsPerMl !== '' ? parseFloat(String(densityGramsPerMl)) : null,
      weightPerUnitGrams: weightPerUnitGrams != null && weightPerUnitGrams !== '' ? parseFloat(String(weightPerUnitGrams)) : null,
      notes: notes || null,
      isBuiltIn: false,
    },
  })
  return NextResponse.json(ref, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const ref = await prisma.ingredientReference.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, venueId: true, isBuiltIn: true },
  })
  if (!ref) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (ref.isBuiltIn) return NextResponse.json({ error: 'Built-in references cannot be deleted' }, { status: 403 })
  if (session.user.role === 'MANAGER' && ref.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.ingredientReference.update({ where: { id }, data: { deletedAt: new Date() } })
  return NextResponse.json({ success: true })
}
