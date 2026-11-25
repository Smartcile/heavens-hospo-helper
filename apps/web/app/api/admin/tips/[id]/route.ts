import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma, Prisma, TipsShareStatus } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { getManagerVenueId } from '@/lib/venue-scope'
import { cleanCashCounts, cleanTipsShareRows, isTipsPeriodLocked } from '@/lib/tips'
import { buildTipsPeriodPayload } from '@/lib/tips.server'

interface Params {
  params: { id: string }
}

const SHARES_INCLUDE = {
  shares: {
    orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
    include: { _count: { select: { notes: { where: { deletedAt: null } } } } },
  },
}

/** "YYYY-MM-DD" (or ISO) → a UTC-midnight Date, or null when unparseable. */
function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !value) return null
  const date = new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** The period must exist and be in the caller's venue (MANAGER is locked). */
async function loadScoped(id: string, role: string, managerVenueId: string | null) {
  const period = await prisma.tipsPeriod.findUnique({
    where: { id },
    select: { id: true, venueId: true, deletedAt: true },
  })
  if (!period || period.deletedAt) return { error: 'Not found', status: 404 as const }
  if (role === 'MANAGER' && managerVenueId && period.venueId !== managerVenueId) {
    return { error: 'Forbidden', status: 403 as const }
  }
  return { period }
}

export async function GET(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'performance.tips.view')
  if (denied) return denied

  const scoped = await loadScoped(params.id, session.user.role, getManagerVenueId(session, req))
  if ('error' in scoped) return NextResponse.json({ error: scoped.error }, { status: scoped.status })

  const period = await prisma.tipsPeriod.findUnique({ where: { id: params.id }, include: SHARES_INCLUDE })
  if (!period || period.deletedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(buildTipsPeriodPayload(period))
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'performance.tips.edit')
  if (denied) return denied

  const scoped = await loadScoped(params.id, session.user.role, getManagerVenueId(session, req))
  if ('error' in scoped) return NextResponse.json({ error: scoped.error }, { status: scoped.status })

  const existing = await prisma.tipsPeriod.findUnique({ where: { id: params.id }, include: SHARES_INCLUDE })
  if (!existing || existing.deletedAt) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const liveShares = existing.shares.filter((s) => !s.deletedAt)
  if (isTipsPeriodLocked(liveShares)) {
    return NextResponse.json(
      { error: 'PERIOD IS LOCKED — SHARES HAVE ALREADY BEEN ISSUED' },
      { status: 409 },
    )
  }

  const body = await req.json()
  const data: Record<string, unknown> = {}

  if (body.label !== undefined) {
    data.label = typeof body.label === 'string' && body.label.trim() ? body.label.trim().toUpperCase() : null
  }
  if (body.fromDate !== undefined) {
    const from = parseDate(body.fromDate)
    if (!from) return NextResponse.json({ error: 'Invalid fromDate' }, { status: 400 })
    data.fromDate = from
  }
  if (body.toDate !== undefined) {
    const to = parseDate(body.toDate)
    if (!to) return NextResponse.json({ error: 'Invalid toDate' }, { status: 400 })
    data.toDate = to
  }
  if (body.cashCounts !== undefined) {
    data.cashCounts = cleanCashCounts(body.cashCounts) as unknown as Prisma.InputJsonValue
  }
  if (body.posTotal !== undefined) data.posTotal = Number(body.posTotal) || 0
  if (body.notes !== undefined) {
    data.notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null
  }

  const drafts = body.shares !== undefined ? cleanTipsShareRows(body.shares) : null

  let staffNames = new Map<string, string>()
  if (drafts) {
    const staffIds = [...new Set(drafts.map((d) => d.staffId).filter((id): id is string => !!id))]
    if (staffIds.length > 0) {
      const staff = await prisma.staff.findMany({
        where: { id: { in: staffIds }, venueId: existing.venueId, deletedAt: null },
        select: { id: true, firstName: true, lastName: true },
      })
      if (staff.length !== staffIds.length) {
        return NextResponse.json({ error: 'A staff member is not in this venue' }, { status: 400 })
      }
      staffNames = new Map(
        staff.map((s) => [s.id, `${s.firstName} ${s.lastName}`.trim().toUpperCase()]),
      )
    }
  }

  if (Object.keys(data).length > 0) {
    await prisma.tipsPeriod.update({ where: { id: params.id }, data })
  }

  if (drafts) {
    const allShares = await prisma.tipsShare.findMany({ where: { tipsPeriodId: params.id } })
    const byId = new Map(allShares.map((s) => [s.id, s]))
    const byStaff = new Map(allShares.filter((s) => s.staffId).map((s) => [s.staffId as string, s]))

    await prisma.$transaction(async (tx) => {
      const kept = new Set<string>()

      for (const draft of drafts) {
        const byIdRow = draft.id ? byId.get(draft.id) : undefined
        if (byIdRow) {
          await tx.tipsShare.update({
            where: { id: byIdRow.id },
            data: {
              deletedAt: null,
              name: byIdRow.staffId ? byIdRow.name : draft.name,
              hours: draft.hours,
              shareWeight: draft.shareWeight,
              sortOrder: draft.sortOrder,
            },
          })
          kept.add(byIdRow.id)
          continue
        }

        if (draft.staffId) {
          const byStaffRow = byStaff.get(draft.staffId)
          if (byStaffRow) {
            await tx.tipsShare.update({
              where: { id: byStaffRow.id },
              data: {
                deletedAt: null,
                name: staffNames.get(draft.staffId) ?? byStaffRow.name,
                hours: draft.hours,
                shareWeight: draft.shareWeight,
                sortOrder: draft.sortOrder,
                status: TipsShareStatus.PLANNED,
                approvedAt: null,
                approvedById: null,
                approvalNote: null,
                issuedAt: null,
                issuedById: null,
                issueNote: null,
              },
            })
            kept.add(byStaffRow.id)
            continue
          }
        }

        const created = await tx.tipsShare.create({
          data: {
            tipsPeriodId: params.id,
            staffId: draft.staffId,
            name: draft.staffId ? staffNames.get(draft.staffId) ?? draft.name : draft.name,
            hours: draft.hours,
            shareWeight: draft.shareWeight,
            sortOrder: draft.sortOrder,
          },
        })
        kept.add(created.id)
      }

      for (const share of liveShares) {
        if (kept.has(share.id)) continue
        await tx.tipsShare.update({ where: { id: share.id }, data: { deletedAt: new Date() } })
      }
    })
  }

  const saved = await prisma.tipsPeriod.findUnique({ where: { id: params.id }, include: SHARES_INCLUDE })
  if (!saved) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(buildTipsPeriodPayload(saved))
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'performance.tips.delete')
  if (denied) return denied

  const scoped = await loadScoped(params.id, session.user.role, getManagerVenueId(session, req))
  if ('error' in scoped) return NextResponse.json({ error: scoped.error }, { status: scoped.status })

  await prisma.tipsPeriod.update({ where: { id: params.id }, data: { deletedAt: new Date() } })
  return NextResponse.json({ success: true })
}
