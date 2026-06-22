import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const venueId = url.searchParams.get('venueId') ?? session.user.venueId

  const sections = await prisma.section.findMany({
    where: { venueId, deletedAt: null },
    include: {
      floorPlanElements: {
        where: { type: 'TABLE', deletedAt: null },
        orderBy: { sortOrder: 'asc' },
        include: {
          floorPlan: { select: { name: true } },
          inventoryItems: {
            include: { item: true },
          },
        },
      },
    },
    orderBy: { name: 'asc' },
  })

  const tree = sections.map((s) => ({
    id: s.id,
    name: s.name,
    tables: s.floorPlanElements.map((el) => ({
      id: el.id,
      label: el.label ?? 'TABLE',
      width: el.width,
      depth: el.depth,
      planName: el.floorPlan.name,
      planId: el.floorPlanId,
      inventoryItems: el.inventoryItems.map((eii) => ({
        id: eii.item.id,
        name: eii.item.name,
        quantity: eii.quantity,
        unit: eii.item.unit,
      })),
    })),
  }))

  return NextResponse.json({ sections: tree })
}
