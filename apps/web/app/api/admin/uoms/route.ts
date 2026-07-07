import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

const BUILT_IN: { name: string; baseUnit: string; conversionRatio: number }[] = [
  { name: 'EACH', baseUnit: 'ea', conversionRatio: 1 },
  { name: 'LITRE', baseUnit: 'mL', conversionRatio: 1000 },
  { name: '750ML BOTTLE', baseUnit: 'mL', conversionRatio: 750 },
  { name: '6 PACK 1L', baseUnit: 'mL', conversionRatio: 6000 },
  { name: 'KILOGRAM', baseUnit: 'g', conversionRatio: 1000 },
  { name: 'GRAM', baseUnit: 'g', conversionRatio: 1 },
  { name: 'ML', baseUnit: 'mL', conversionRatio: 1 },
  { name: 'BUNCH', baseUnit: 'ea', conversionRatio: 1 },
  { name: 'CASE 12', baseUnit: 'ea', conversionRatio: 12 },
  { name: 'CASE 24', baseUnit: 'ea', conversionRatio: 24 },
  { name: 'SLEEVE', baseUnit: 'ea', conversionRatio: 1 },
]

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Auto-seed built-in UOMs
  const current = await prisma.unitOfMeasure.findMany({
    where: { name: { in: BUILT_IN.map((b) => b.name) }, deletedAt: null, venueId: null },
  })
  const currentNames = new Set(current.map((c) => c.name))
  for (const bi of BUILT_IN) {
    if (!currentNames.has(bi.name)) {
      await prisma.unitOfMeasure.create({
        data: { name: bi.name, baseUnit: bi.baseUnit, conversionRatio: bi.conversionRatio, isBuiltIn: true, venueId: null },
      })
    }
  }

  const where: any = { deletedAt: null }
  where.OR = [{ venueId: null, isBuiltIn: true }, { venueId: session.user.venueId }]

  const uoms = await prisma.unitOfMeasure.findMany({
    where,
    orderBy: [{ isBuiltIn: 'desc' }, { name: 'asc' }],
  })
  return NextResponse.json(uoms)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, baseUnit, conversionRatio } = await req.json()
  if (!name?.trim() || !baseUnit?.trim()) {
    return NextResponse.json({ error: 'name and baseUnit are required' }, { status: 400 })
  }

  const upper = name.toUpperCase().trim()
  const existing = await prisma.unitOfMeasure.findFirst({
    where: { venueId: session.user.venueId, name: upper, deletedAt: null },
  })
  if (existing) return NextResponse.json({ error: 'UNIT ALREADY EXISTS' }, { status: 409 })

  const uom = await prisma.unitOfMeasure.create({
    data: {
      venueId: session.user.venueId,
      name: upper,
      baseUnit: baseUnit.toLowerCase().trim(),
      conversionRatio: parseFloat(String(conversionRatio)) || 1,
      isBuiltIn: false,
    },
  })
  return NextResponse.json(uom, { status: 201 })
}
