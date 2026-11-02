import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'

const BUILT_IN: { name: string; baseUnit: string; conversionRatio: number; kind: string }[] = [
  { name: 'EACH', baseUnit: 'ea', conversionRatio: 1, kind: 'COUNT' },
  { name: 'LITRE', baseUnit: 'mL', conversionRatio: 1000, kind: 'VOLUME' },
  { name: '750ML BOTTLE', baseUnit: 'mL', conversionRatio: 750, kind: 'VOLUME' },
  { name: '6 PACK 1L', baseUnit: 'mL', conversionRatio: 6000, kind: 'VOLUME' },
  { name: 'KILOGRAM', baseUnit: 'g', conversionRatio: 1000, kind: 'MASS' },
  { name: 'GRAM', baseUnit: 'g', conversionRatio: 1, kind: 'MASS' },
  { name: 'ML', baseUnit: 'mL', conversionRatio: 1, kind: 'VOLUME' },
  { name: 'BUNCH', baseUnit: 'ea', conversionRatio: 1, kind: 'COUNT' },
  { name: 'CASE 12', baseUnit: 'ea', conversionRatio: 12, kind: 'COUNT' },
  { name: 'CASE 24', baseUnit: 'ea', conversionRatio: 24, kind: 'COUNT' },
  { name: 'SLEEVE', baseUnit: 'ea', conversionRatio: 1, kind: 'COUNT' },
  // Metric-volume + imperial-mass presets (1 CUP = 250 mL, 1 OUNCE = 28.35 g)
  { name: 'CUP', baseUnit: 'mL', conversionRatio: 250, kind: 'VOLUME' },
  { name: 'TABLESPOON', baseUnit: 'mL', conversionRatio: 20, kind: 'VOLUME' },
  { name: 'TEASPOON', baseUnit: 'mL', conversionRatio: 5, kind: 'VOLUME' },
  { name: 'PINT', baseUnit: 'mL', conversionRatio: 570, kind: 'VOLUME' },
  { name: 'OUNCE', baseUnit: 'g', conversionRatio: 28.35, kind: 'MASS' },
  { name: 'POUND', baseUnit: 'g', conversionRatio: 453.6, kind: 'MASS' },
]

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'ops.inventory.view')
  if (denied) return denied

  // Auto-seed built-in UOMs
  const current = await prisma.unitOfMeasure.findMany({
    where: { name: { in: BUILT_IN.map((b) => b.name) }, deletedAt: null, venueId: null },
  })
  const currentNames = new Set(current.map((c) => c.name))
  for (const bi of BUILT_IN) {
    if (!currentNames.has(bi.name)) {
      await prisma.unitOfMeasure.create({
        data: { name: bi.name, baseUnit: bi.baseUnit, conversionRatio: bi.conversionRatio, kind: bi.kind as any, isBuiltIn: true, venueId: null },
      })
    }
  }

  const where: any = { deletedAt: null }
  const venueId = session.user.role === 'MANAGER'
    ? session.user.venueId
    : req.nextUrl.searchParams.get('venueId') || session.user.venueId
  where.OR = [{ venueId: null, isBuiltIn: true }, { venueId }]

  const uoms = await prisma.unitOfMeasure.findMany({
    where,
    orderBy: [{ isBuiltIn: 'desc' }, { name: 'asc' }],
  })
  return NextResponse.json(uoms)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'ops.inventory.create')
  if (denied) return denied

  const { name, baseUnit, conversionRatio, kind, venueId: bodyVenueId } = await req.json()
  if (!name?.trim() || !baseUnit?.trim()) {
    return NextResponse.json({ error: 'name and baseUnit are required' }, { status: 400 })
  }

  const venueId = session.user.role === 'MANAGER' ? session.user.venueId : (bodyVenueId || session.user.venueId)

  const upper = name.toUpperCase().trim()
  const existing = await prisma.unitOfMeasure.findFirst({
    where: { venueId, name: upper, deletedAt: null },
  })
  if (existing) return NextResponse.json({ error: 'UNIT ALREADY EXISTS' }, { status: 409 })

  const validKinds = ['VOLUME', 'MASS', 'COUNT']
  const uom = await prisma.unitOfMeasure.create({
    data: {
      venueId,
      name: upper,
      baseUnit: baseUnit.toLowerCase().trim(),
      conversionRatio: parseFloat(String(conversionRatio)) || 1,
      kind: (validKinds.includes(kind) ? kind : 'COUNT') as any,
      isBuiltIn: false,
    },
  })
  return NextResponse.json(uom, { status: 201 })
}
