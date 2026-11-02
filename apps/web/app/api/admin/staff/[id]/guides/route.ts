import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { resolveStaffGuides } from '@/lib/guides'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, _req, 'training.playbook.view')
  if (denied) return denied

  const staff = await prisma.staff.findUnique({
    where: { id: params.id },
    select: { id: true, venueId: true },
  })
  if (!staff) return NextResponse.json({ error: 'Staff not found' }, { status: 404 })

  if (session.user.role === 'MANAGER' && staff.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const resolved = await resolveStaffGuides(params.id)
  if (!resolved) return NextResponse.json({ error: 'Staff not found' }, { status: 404 })

  // Resolve manager names for anything signed off.
  const signOffIds = [
    ...new Set(
      resolved.items
        .map((g) => g.completion?.signedOffById)
        .filter((id): id is string => !!id),
    ),
  ]
  const signOffNames = signOffIds.length
    ? new Map(
        (
          await prisma.staff.findMany({
            where: { id: { in: signOffIds } },
            select: { id: true, firstName: true, lastName: true },
          })
        ).map((s) => [s.id, `${s.firstName} ${s.lastName}`]),
      )
    : new Map<string, string>()

  const items = resolved.items.map((g) => ({
    id: g.id,
    title: g.title,
    description: g.description,
    category: g.category,
    requiresSignOff: g.requiresSignOff,
    isOnboarding: g.isOnboarding,
    source: g.source,
    assignmentReason: g.assignmentReason,
    completed: g.completed,
    completion: g.completion
      ? {
          completedAt: g.completion.completedAt.toISOString(),
          selfCompleted: g.completion.selfCompleted,
          signedOffByName: g.completion.signedOffById
            ? signOffNames.get(g.completion.signedOffById) ?? null
            : null,
          note: g.completion.note,
        }
      : null,
  }))

  return NextResponse.json({ items })
}
