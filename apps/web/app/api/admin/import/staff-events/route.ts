import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { normaliseImportKey } from '@/lib/import/similarity'
import { buildStaffEventFields } from '@/lib/staff-events'
import { materialiseStaffEventInvites } from '@/lib/staff-events.server'
import type { ImportRowAction, ImportSummary } from '@/lib/import/types'
import type { StaffEventImportValues } from '@/lib/import/staff-event'

type Tx = Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>

interface RawRow { action?: ImportRowAction; targetId?: string; values?: Partial<StaffEventImportValues> }

const DRAFT_NOTE = 'IMPORTED STAFF EVENTS ARE DRAFT - PUBLISH THEM TO SEND THE NOTICE TO STAFF'

function pushTo<T extends { name: string }>(map: Map<string, T[]>, row: T) {
  const key = normaliseImportKey(row.name)
  const list = map.get(key) ?? []
  list.push(row)
  map.set(key, list)
}

function pickOne<T>(map: Map<string, T[]>, value: string): T | 'AMBIGUOUS' | null {
  const matches = map.get(normaliseImportKey(value)) ?? []
  if (matches.length === 1) return matches[0]
  if (matches.length > 1) return 'AMBIGUOUS'
  return null
}

async function loadRefs(tx: Tx, venueId: string) {
  const departments = await tx.department.findMany({ where: { venueId, deletedAt: null }, select: { id: true, name: true } })
  const sections = await tx.section.findMany({ where: { venueId, deletedAt: null }, select: { id: true, name: true } })
  const positions = await tx.position.findMany({ where: { venueId, deletedAt: null }, select: { id: true, name: true } })
  const map = <T extends { name: string }>(rows: T[]) => {
    const out = new Map<string, T[]>()
    for (const row of rows) pushTo(out, row)
    return out
  }
  return { departments: map(departments), sections: map(sections), positions: map(positions) }
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'notices.notices.view')
  if (denied) return denied

  const venueId = session.user.role === 'MANAGER'
    ? session.user.venueId
    : req.nextUrl.searchParams.get('venueId') || session.user.venueId
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })

  const [departments, sections, positions, events] = await Promise.all([
    prisma.department.findMany({ where: { venueId, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.section.findMany({ where: { venueId, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.position.findMany({ where: { venueId, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.staffEvent.findMany({
      where: { venueId, deletedAt: null },
      select: { id: true, title: true, startsAt: true },
      orderBy: { startsAt: 'desc' },
      take: 100,
    }),
  ])

  return NextResponse.json({
    departments,
    sections,
    positions,
    events: events.map((e) => ({ id: e.id, name: `${e.title}|${e.startsAt.toISOString().slice(0, 10)}` })),
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'notices.notices.post')
  if (denied) return denied

  const body = await req.json().catch(() => null) as { venueId?: string; rows?: RawRow[] } | null
  const venueId = session.user.role === 'MANAGER' ? session.user.venueId : body?.venueId || session.user.venueId
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })
  if (!Array.isArray(body?.rows) || body.rows.length === 0) return NextResponse.json({ error: 'NO ROWS TO IMPORT' }, { status: 400 })

  try {
    const summary = await prisma.$transaction(async (tx): Promise<ImportSummary> => {
      const out: ImportSummary = { created: 0, updated: 0, revived: 0, skipped: 0, warnings: [DRAFT_NOTE] }
      const refs = await loadRefs(tx, venueId)

      for (const raw of body.rows ?? []) {
        const values = raw.values ?? {}
        if ((raw.action ?? 'CREATE') !== 'CREATE') {
          out.skipped++
          out.warnings.push(`"${values.title ?? 'EVENT'}" SKIPPED - IMPORT ONLY CREATES NEW EVENTS`)
          continue
        }

        const built = buildStaffEventFields({
          title: values.title,
          date: values.date,
          startTime: values.startTime,
          endTime: values.endTime,
          allDay: values.allDay,
          location: values.location,
          description: values.description,
          attendanceRequired: values.attendanceRequired,
          allowMaybe: values.allowMaybe,
          requireDeclineReason: values.requireDeclineReason,
        })
        if (!built.ok) {
          out.skipped++
          out.warnings.push(`"${values.title ?? 'EVENT'}" SKIPPED - ${built.error}`)
          continue
        }

        const audiences: { kind: 'DEPARTMENT' | 'SECTION' | 'POSITION'; targetId: string }[] = []
        if (values.audienceName) {
          const kind = values.audienceKind
          const lookup = kind === 'SECTION'
            ? refs.sections
            : kind === 'POSITION'
              ? refs.positions
              : kind === 'DEPARTMENT'
                ? refs.departments
                : null
          let found = lookup ? pickOne(lookup, values.audienceName) : null
          if (!lookup) {
            for (const [candidate, map] of [['DEPARTMENT', refs.departments], ['SECTION', refs.sections], ['POSITION', refs.positions]] as const) {
              const hit = pickOne(map, values.audienceName)
              if (hit && hit !== 'AMBIGUOUS') { found = hit; audiences.push({ kind: candidate, targetId: hit.id }); break }
              if (hit === 'AMBIGUOUS') { found = 'AMBIGUOUS'; break }
            }
          } else if (found && found !== 'AMBIGUOUS') {
            audiences.push({ kind: kind!, targetId: found.id })
          }
          if (!found || found === 'AMBIGUOUS') {
            out.warnings.push(`"${built.value.title}" IMPORTED WITHOUT AN AUDIENCE - "${values.audienceName}" WAS NOT UNIQUE IN THIS VENUE`)
          }
        }

        const created = await tx.staffEvent.create({
          data: {
            ...built.value,
            venueId,
            status: 'DRAFT',
            createdById: session.user.id,
            audiences: audiences.length ? { create: audiences } : undefined,
          },
          select: {
            id: true, venueId: true, title: true, description: true, location: true,
            startsAt: true, endsAt: true, allDay: true, attendanceRequired: true, status: true,
          },
        })
        await materialiseStaffEventInvites(tx, { ...created, audiences })
        out.created++
      }

      return out
    })

    return NextResponse.json(summary)
  } catch (e) {
    console.error('staff event import failed', e)
    return NextResponse.json({ error: 'IMPORT FAILED' }, { status: 500 })
  }
}
