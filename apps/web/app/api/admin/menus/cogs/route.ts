import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { guardAccess } from '@/lib/permissions'
import { cogsForMenuItems } from '@/lib/menu-cogs.server'

// Batch COGS for the menu builder. A product looks expensive to cost (recipe
// explosion), so it is fetched lazily for the ids the builder is showing rather
// than before every product on every page load.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'ops.menus.view')
  if (denied) return denied

  const body = await req.json().catch(() => ({}))
  const menuItemIds: string[] = Array.isArray(body.menuItemIds) ? body.menuItemIds.map(String) : []
  const venueId = session.user.role === 'MANAGER' ? session.user.venueId : (body.venueId ? String(body.venueId) : null)

  const cogs = await cogsForMenuItems(menuItemIds, venueId)
  return NextResponse.json({ cogs })
}
