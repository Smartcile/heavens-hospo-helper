import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { summariseMethods, summariseServes } from '@/lib/menu-serves'
import { formatEquipment } from '@/lib/reference-table'

// Everything a guide step can link to, for one venue, in one round trip.
// The editor needs six different option lists; fetching them separately would
// be six requests every time the guide form opens.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'training.playbook.view')
  if (denied) return denied

  const venueId =
    session.user.role === 'MANAGER'
      ? session.user.venueId
      : new URL(req.url).searchParams.get('venueId')
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })

  const scope = { venueId, deletedAt: null }

  const [items, tasks, checklists, guides, sections, recipes, menuItems, menus] = await Promise.all([
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
    prisma.menuItem.findMany({
      where: { ...scope, isActive: true },
      select: {
        id: true,
        name: true,
        price: true,
        description: true,
        imageUrl: true,
        dietaryInfo: true,
        tastingNotes: true,
        vintage: true,
        howToServe: true,
        inventoryLinks: {
          where: { deletedAt: null },
          select: { qty: true, inventoryItem: { select: { name: true } } },
        },
        serves: {
          where: { deletedAt: null },
          orderBy: { sortOrder: 'asc' },
          select: {
            method: true,
            label: true,
            qty: true,
            uom: { select: { name: true } },
            recipe: { select: { name: true } },
            inventoryItem: { select: { name: true } },
          },
        },
      },
      orderBy: { name: 'asc' },
    }),
    // Menus (groups) with their ordered, live product ids — lets a reference
    // table pull its rows from a menu in one round trip.
    prisma.menu.findMany({
      where: scope,
      select: {
        id: true,
        name: true,
        items: {
          where: { menuItem: { deletedAt: null, isActive: true } },
          orderBy: { sortOrder: 'asc' },
          select: { menuItemId: true },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
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
    // Products for a product-reference table's linked-product column. Full
    // fields (not just id/name/price) so the editor's derived columns render.
    MENU_ITEM: menuItems.map((m) => ({
      value: m.id,
      label: m.price ? `${m.name} — $${m.price.toFixed(2)}` : m.name,
      name: m.name,
      price: m.price,
      description: m.description,
      imageUrl: m.imageUrl,
      dietaryInfo: m.dietaryInfo,
      tastingNotes: m.tastingNotes,
      vintage: m.vintage,
      howToServe: m.howToServe,
      equipment: formatEquipment(m.inventoryLinks.map((l) => ({ name: l.inventoryItem.name, qty: l.qty }))),
      serveMethod: summariseMethods(m.serves),
      serveSummary: summariseServes(m.serves),
    })),
    // Menus a reference table can source its rows from.
    MENU: menus.map((m) => ({
      value: m.id,
      label: m.name,
      // Only product lines — a reference table sources MenuItems, not stock.
      itemIds: m.items.map((i) => i.menuItemId).filter((id): id is string => !!id),
    })),
  })
}
