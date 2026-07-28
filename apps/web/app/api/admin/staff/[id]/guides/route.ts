import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const staff = await prisma.staff.findUnique({
    where: { id: params.id },
    select: { id: true, firstName: true, lastName: true, departmentId: true, venueId: true },
  })
  if (!staff) return NextResponse.json({ error: 'Staff not found' }, { status: 404 })

  if (session.user.role === 'MANAGER' && staff.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Find all published guides that apply to this person:
  // - Onboarding (all staff)
  // - Department match
  // - Individually assigned (GuideAssignment)
  const assignments = await prisma.guideAssignment.findMany({
    where: { staffId: params.id, deletedAt: null },
    select: { guideId: true, reason: true },
  })
  const assignedIds = assignments.map((a) => a.guideId)
  const reasonMap = new Map(assignments.map((a) => [a.guideId, a.reason]))

  const guides = await prisma.guide.findMany({
    where: {
      venueId: staff.venueId,
      status: 'PUBLISHED',
      isTracked: true,
      deletedAt: null,
      OR: [
        { isOnboarding: true },
        ...(staff.departmentId ? [{ departmentId: staff.departmentId }] : []),
        ...(assignedIds.length > 0 ? [{ id: { in: assignedIds } }] : []),
      ],
    },
    include: {
      department: { select: { id: true, name: true } },
    },
    orderBy: { title: 'asc' },
  })

  // Completions
  const guideIds = guides.map((g) => g.id)
  const completions = guideIds.length > 0
    ? await prisma.guideCompletion.findMany({
        where: { guideId: { in: guideIds }, staffId: params.id },
        select: { guideId: true, completedAt: true, selfCompleted: true, signedOffById: true, note: true },
      })
    : []

  const completionMap = new Map(completions.map((c) => [c.guideId, c]))

  // Resolve manager names for sign-off
  const signOffIds = [...new Set(completions.map((c) => c.signedOffById).filter(Boolean) as string[])]
  const signOffNames = signOffIds.length > 0
    ? new Map((await prisma.staff.findMany({
        where: { id: { in: signOffIds } },
        select: { id: true, firstName: true, lastName: true },
      })).map((s) => [s.id, `${s.firstName} ${s.lastName}`]))
    : new Map<string, string>()

  const items = guides.map((g) => {
    const isAssigned = assignedIds.includes(g.id)
    let source: string
    if (isAssigned) source = 'ASSIGNED'
    else if (g.isOnboarding) source = 'ONBOARDING'
    else source = 'DEPARTMENT'

    const comp = completionMap.get(g.id) ?? null
    return {
      id: g.id,
      title: g.title,
      description: g.description,
      category: g.category,
      requiresSignOff: g.requiresSignOff,
      isOnboarding: g.isOnboarding,
      source,
      assignmentReason: reasonMap.get(g.id) ?? null,
      completed: !!comp,
      completion: comp
        ? {
            completedAt: comp.completedAt.toISOString(),
            selfCompleted: comp.selfCompleted,
            signedOffByName: comp.signedOffById ? signOffNames.get(comp.signedOffById) ?? null : null,
            note: comp.note,
          }
        : null,
    }
  })

  return NextResponse.json({ items })
}
