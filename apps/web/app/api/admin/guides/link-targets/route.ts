import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

// Everything a guide step can link to, for one venue, in one round trip.
// The editor needs six different option lists; fetching them separately would
// be six requests every time the guide form opens.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const venueId =
    session.user.role === 'MANAGER'
      ? session.user.venueId
      : new URL(req.url).searchParams.get('venueId')
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })

  const scope = { venueId, deletedAt: null }

  const [items, tasks, checklists, guides, sections, recipes] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: scope,
      select: { id: true, name: true, unit: true },
      orderBy: { name: 'asc' },
    }),
    prisma.task.findMany({
      where: { ...scope, isActive: true },
      select: { id: true, title: true, department: { select: { name: true } } },
      orderBy: { title: 'asc' },
    }),
    prisma.checklist.findMany({
      where: scope,
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.guide.findMany({
      where: scope,
      select: { id: true, title: true, category: true },
      orderBy: { title: 'asc' },
    }),
    prisma.section.findMany({
      where: scope,
      select: { id: true, name: true, department: { select: { name: true } } },
      orderBy: { name: 'asc' },
    }),
    prisma.recipe.findMany({
      where: scope,
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ])

  return NextResponse.json({
    ITEM: items.map((i) => ({ value: i.id, label: i.unit ? `${i.name} (${i.unit})` : i.name })),
    TASK: tasks.map((t) => ({
      value: t.id,
      label: t.department ? `${t.title} — ${t.department.name}` : t.title,
    })),
    CHECKLIST: checklists.map((c) => ({ value: c.id, label: c.name })),
    GUIDE: guides.map((g) => ({ value: g.id, label: g.category ? `${g.title} — ${g.category}` : g.title })),
    SECTION: sections.map((s) => ({
      value: s.id,
      label: s.department ? `${s.department.name} → ${s.name}` : s.name,
    })),
    RECIPE: recipes.map((r) => ({ value: r.id, label: r.name })),
  })
}
