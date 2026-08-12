import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

const BUILT_IN: { name: string; tab: string | null; showDeepFields: boolean; showEquipmentFields: boolean }[] = [
  // FOOD
  { name: 'PROTEIN', tab: 'FOOD', showDeepFields: true, showEquipmentFields: false },
  { name: 'DAIRY', tab: 'FOOD', showDeepFields: true, showEquipmentFields: false },
  { name: 'PRODUCE', tab: 'FOOD', showDeepFields: true, showEquipmentFields: false },
  { name: 'DRY GOODS', tab: 'FOOD', showDeepFields: true, showEquipmentFields: false },
  { name: 'BAKERY', tab: 'FOOD', showDeepFields: true, showEquipmentFields: false },
  { name: 'CONDIMENTS', tab: 'FOOD', showDeepFields: true, showEquipmentFields: false },
  // BEVERAGE
  { name: 'LIQUOR', tab: 'BEVERAGE', showDeepFields: true, showEquipmentFields: false },
  { name: 'WINE', tab: 'BEVERAGE', showDeepFields: true, showEquipmentFields: false },
  { name: 'BEER', tab: 'BEVERAGE', showDeepFields: true, showEquipmentFields: false },
  { name: 'SOFT DRINK', tab: 'BEVERAGE', showDeepFields: true, showEquipmentFields: false },
  { name: 'JUICE', tab: 'BEVERAGE', showDeepFields: true, showEquipmentFields: false },
  { name: 'COFFEE', tab: 'BEVERAGE', showDeepFields: true, showEquipmentFields: false },
  // OTHER (equipment, utensils, etc.)
  { name: 'CUTLERY', tab: null, showDeepFields: false, showEquipmentFields: true },
  { name: 'GLASSWARE', tab: null, showDeepFields: false, showEquipmentFields: true },
  { name: 'LINEN', tab: null, showDeepFields: false, showEquipmentFields: true },
  { name: 'BARWARE', tab: null, showDeepFields: false, showEquipmentFields: true },
  { name: 'CROCKERY', tab: null, showDeepFields: false, showEquipmentFields: true },
  { name: 'CLEANING', tab: null, showDeepFields: false, showEquipmentFields: true },
  { name: 'MISCELLANEOUS', tab: null, showDeepFields: false, showEquipmentFields: true },
  { name: 'TABLES', tab: null, showDeepFields: false, showEquipmentFields: true },
]

const BUILT_IN_NAMES = BUILT_IN.map((b) => b.name)

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Auto-seed any missing built-in categories
  const current = await prisma.inventoryCategory.findMany({ where: { name: { in: BUILT_IN_NAMES }, deletedAt: null } })
  const currentNames = new Set(current.map((c) => c.name))
  for (const bi of BUILT_IN) {
    if (!currentNames.has(bi.name)) {
      await prisma.inventoryCategory.create({ data: { name: bi.name, tab: bi.tab, showDeepFields: bi.showDeepFields, showEquipmentFields: bi.showEquipmentFields, isBuiltIn: true, venueId: null } })
    }
  }

  const where: any = { deletedAt: null }
  const venueId = session.user.role === 'MANAGER'
    ? session.user.venueId
    : (req.nextUrl.searchParams.get('venueId') || session.user.venueId)
  where.OR = [{ venueId: null, isBuiltIn: true }, { venueId }]

  const categories = await prisma.inventoryCategory.findMany({
    where,
    orderBy: [{ isBuiltIn: 'desc' }, { name: 'asc' }],
  })
  return NextResponse.json(categories)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, tab, showDeepFields, showEquipmentFields, venueId: bodyVenueId } = await req.json()
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const venueId = session.user.role === 'MANAGER' ? session.user.venueId : (bodyVenueId || session.user.venueId)

  const upper = name.toUpperCase().trim()
  if (BUILT_IN_NAMES.includes(upper)) {
    return NextResponse.json({ error: 'BUILT-IN CATEGORIES ARE SEEDED AUTOMATICALLY' }, { status: 400 })
  }

  const existing = await prisma.inventoryCategory.findFirst({
    where: { venueId, name: upper, deletedAt: null },
  })
  if (existing) {
    return NextResponse.json({ error: 'CATEGORY ALREADY EXISTS' }, { status: 409 })
  }

  const cat = await prisma.inventoryCategory.create({
    data: {
      venueId,
      name: upper,
      tab: tab || null,
      showDeepFields: !!showDeepFields,
      showEquipmentFields: !!showEquipmentFields,
      isBuiltIn: false,
    },
  })
  return NextResponse.json(cat, { status: 201 })
}
