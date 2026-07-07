import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

const BUILT_IN: { name: string; tab: string | null }[] = [
  // FOOD
  { name: 'PROTEIN', tab: 'FOOD' },
  { name: 'DAIRY', tab: 'FOOD' },
  { name: 'PRODUCE', tab: 'FOOD' },
  { name: 'DRY GOODS', tab: 'FOOD' },
  { name: 'BAKERY', tab: 'FOOD' },
  { name: 'CONDIMENTS', tab: 'FOOD' },
  // BEVERAGE
  { name: 'LIQUOR', tab: 'BEVERAGE' },
  { name: 'WINE', tab: 'BEVERAGE' },
  { name: 'BEER', tab: 'BEVERAGE' },
  { name: 'SOFT DRINK', tab: 'BEVERAGE' },
  { name: 'JUICE', tab: 'BEVERAGE' },
  { name: 'COFFEE', tab: 'BEVERAGE' },
  // OTHER (equipment, utensils, etc.)
  { name: 'CUTLERY', tab: null },
  { name: 'GLASSWARE', tab: null },
  { name: 'LINEN', tab: null },
  { name: 'BARWARE', tab: null },
  { name: 'CROCKERY', tab: null },
  { name: 'CLEANING', tab: null },
  { name: 'MISCELLANEOUS', tab: null },
  { name: 'FURNITURE', tab: null },
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
      await prisma.inventoryCategory.create({ data: { name: bi.name, tab: bi.tab, isBuiltIn: true, venueId: null } })
    }
  }

  const where: any = { deletedAt: null }
  if (session.user.role === 'ADMIN') {
    where.OR = [{ venueId: null, isBuiltIn: true }, { venueId: session.user.venueId }]
  } else {
    where.OR = [{ venueId: null, isBuiltIn: true }, { venueId: session.user.venueId }]
  }

  const categories = await prisma.inventoryCategory.findMany({
    where,
    orderBy: [{ isBuiltIn: 'desc' }, { name: 'asc' }],
  })
  return NextResponse.json(categories)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, tab } = await req.json()
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const upper = name.toUpperCase().trim()
  if (BUILT_IN_NAMES.includes(upper)) {
    return NextResponse.json({ error: 'BUILT-IN CATEGORIES ARE SEEDED AUTOMATICALLY' }, { status: 400 })
  }

  const existing = await prisma.inventoryCategory.findFirst({
    where: { venueId: session.user.venueId, name: upper, deletedAt: null },
  })
  if (existing) {
    return NextResponse.json({ error: 'CATEGORY ALREADY EXISTS' }, { status: 409 })
  }

  const cat = await prisma.inventoryCategory.create({
    data: {
      venueId: session.user.venueId,
      name: upper,
      tab: tab || null,
      isBuiltIn: false,
    },
  })
  return NextResponse.json(cat, { status: 201 })
}
