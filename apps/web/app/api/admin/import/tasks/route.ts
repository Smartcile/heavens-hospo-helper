import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { normaliseImportKey } from '@/lib/import/similarity'
import { sanitiseRichText } from '@/lib/rich-text'
import type { ImportRowAction, ImportSummary } from '@/lib/import/types'

const MAX_ROWS = 400
const DRAFT_NOTE = 'IMPORTED TASKS ARE DRAFT - REVIEW AND ACTIVATE THEM BEFORE THEY REACH THE FLOOR'
const MONTHLY_OPTIONS = new Set([
  'FIRST_DAY', 'LAST_DAY', 'FIFTEENTH', 'FIRST_WEEKDAY', 'LAST_WEEKDAY',
  'FIRST_MONDAY', 'LAST_FRIDAY', 'SPECIFIC_DAY',
])
const COMPLETION_TYPES = new Set(['TICK', 'TICK_NOTE', 'TICK_PHOTO'])
const SCHEDULE_TYPES = new Set(['DAILY', 'WEEKLY', 'MONTHLY'])

type Tx = Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>

interface RawValues {
  title?: unknown
  descriptionHtml?: unknown
  departmentName?: unknown
  sectionName?: unknown
  checklistName?: unknown
  completionType?: unknown
  scheduleType?: unknown
  scheduleDays?: unknown
  monthlyOption?: unknown
  monthlyDay?: unknown
}
interface RawRow { action?: ImportRowAction; targetId?: string; values?: RawValues }

interface Refs {
  departments: Map<string, { id: string; name: string }[]>
  sections: Map<string, { id: string; name: string; departmentId: string }[]>
  checklists: Map<string, { id: string; name: string }[]>
}

function name(value: unknown): string {
  return normaliseImportKey(value)
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const n = Number(value.replace(/[^0-9.\-]/g, ''))
  return Number.isFinite(n) ? n : null
}

function pushTo<T extends { name: string }>(map: Map<string, T[]>, row: T) {
  const key = normaliseImportKey(row.name)
  const list = map.get(key) ?? []
  list.push(row)
  map.set(key, list)
}

function pickOne<T>(map: Map<string, T[]>, value: string): T | 'AMBIGUOUS' | null {
  const matches = map.get(name(value)) ?? []
  if (matches.length === 1) return matches[0]
  if (matches.length > 1) return 'AMBIGUOUS'
  return null
}

async function loadRefs(tx: Tx, venueId: string): Promise<Refs> {
  const departments = await tx.department.findMany({
    where: { venueId, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' },
  })
  const sections = await tx.section.findMany({
    where: { venueId, deletedAt: null }, select: { id: true, name: true, departmentId: true }, orderBy: { name: 'asc' },
  })
  const checklists = await tx.checklist.findMany({
    where: { venueId, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' },
  })
  const departmentMap = new Map<string, { id: string; name: string }[]>()
  for (const row of departments) pushTo(departmentMap, row)
  const sectionMap = new Map<string, { id: string; name: string; departmentId: string }[]>()
  for (const row of sections) pushTo(sectionMap, row)
  const checklistMap = new Map<string, { id: string; name: string }[]>()
  for (const row of checklists) pushTo(checklistMap, row)
  return { departments: departmentMap, sections: sectionMap, checklists: checklistMap }
}

function cleanDays(raw: unknown): number[] {
  const values = Array.isArray(raw) ? raw : []
  return [...new Set(values
    .map((value) => (typeof value === 'string' ? Number(value) : value))
    .filter((value): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 6))]
    .sort((a, b) => a - b)
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'execution.tasks.view')
  if (denied) return denied

  const venueId = session.user.role === 'MANAGER'
    ? session.user.venueId
    : req.nextUrl.searchParams.get('venueId') || session.user.venueId
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })

  const refs = await loadRefs(prisma as Tx, venueId)
  const tasks = await prisma.task.findMany({
    where: { venueId, deletedAt: null }, select: { id: true, title: true }, orderBy: { title: 'asc' },
  })
  return NextResponse.json({
    departments: [...refs.departments.values()].flat(),
    sections: [...refs.sections.values()].flat(),
    checklists: [...refs.checklists.values()].flat(),
    tasks: tasks.map((task) => ({ id: task.id, name: task.title })),
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const deniedCreate = await guardAccess(session, req, 'execution.tasks.create')
  if (deniedCreate) return deniedCreate

  const body = await req.json().catch(() => null) as { venueId?: string; rows?: RawRow[] } | null
  const venueId = session.user.role === 'MANAGER' ? session.user.venueId : body?.venueId || session.user.venueId
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })
  if (!Array.isArray(body?.rows) || body.rows.length === 0) {
    return NextResponse.json({ error: 'NO ROWS TO IMPORT' }, { status: 400 })
  }
  if (body.rows.length > MAX_ROWS) {
    return NextResponse.json({ error: `TOO MANY ROWS - MAX ${MAX_ROWS}` }, { status: 400 })
  }

  const touchesExisting = body.rows.some((row) => row.action === 'UPDATE' || row.action === 'REVIVE')
  if (touchesExisting) {
    const deniedEdit = await guardAccess(session, req, 'execution.tasks.edit')
    if (deniedEdit) return deniedEdit
  }

  try {
    const summary = await prisma.$transaction(async (tx): Promise<ImportSummary> => {
      const out: ImportSummary = { created: 0, updated: 0, revived: 0, skipped: 0, warnings: [DRAFT_NOTE] }
      const refs = await loadRefs(tx, venueId)

      for (const raw of body.rows ?? []) {
        const values = (raw.values ?? {}) as RawValues
        const title = name(values.title)
        if (!title) { out.skipped++; continue }
        const action = raw.action ?? 'CREATE'
        if (action === 'SKIP') { out.skipped++; continue }

        const rawSchedule = String(values.scheduleType ?? 'DAILY').toUpperCase()
        const scheduleType = (SCHEDULE_TYPES.has(rawSchedule) ? rawSchedule : 'DAILY') as 'DAILY' | 'WEEKLY' | 'MONTHLY'
        const scheduleDays = cleanDays(values.scheduleDays)
        if (scheduleType === 'WEEKLY' && scheduleDays.length === 0) {
          out.skipped++
          out.warnings.push(`"${title}" SKIPPED - WEEKLY TASK HAS NO VALID DAYS`)
          continue
        }
        const rawMonthly = values.monthlyOption ? String(values.monthlyOption).toUpperCase() : null
        if (scheduleType === 'MONTHLY' && (!rawMonthly || !MONTHLY_OPTIONS.has(rawMonthly))) {
          out.skipped++
          out.warnings.push(`"${title}" SKIPPED - INVALID MONTHLY OPTION`)
          continue
        }
        const monthlyDay = rawMonthly === 'SPECIFIC_DAY' ? Math.min(31, Math.max(1, Math.trunc(toNumber(values.monthlyDay) ?? 1))) : null

        const rawCompletion = String(values.completionType ?? 'TICK').toUpperCase()
        const completionType = (COMPLETION_TYPES.has(rawCompletion) ? rawCompletion : 'TICK') as 'TICK' | 'TICK_NOTE' | 'TICK_PHOTO'

        // Resolve department / section / checklist by name.
        let departmentId: string | null = null
        if (values.departmentName) {
          const found = pickOne(refs.departments, String(values.departmentName))
          if (!found || found === 'AMBIGUOUS') {
            out.skipped++
            out.warnings.push(`"${title}" SKIPPED - DEPARTMENT "${String(values.departmentName)}" NOT UNIQUE IN THIS VENUE`)
            continue
          }
          departmentId = found.id
        }
        let sectionId: string | null = null
        if (values.sectionName) {
          const found = pickOne(refs.sections, String(values.sectionName))
          if (!found || found === 'AMBIGUOUS') {
            out.skipped++
            out.warnings.push(`"${title}" SKIPPED - SECTION "${String(values.sectionName)}" NOT UNIQUE IN THIS VENUE`)
            continue
          }
          sectionId = found.id
          departmentId = found.departmentId
        }
        let checklistId: string | null = null
        if (values.checklistName) {
          const found = pickOne(refs.checklists, String(values.checklistName))
          if (!found || found === 'AMBIGUOUS') {
            out.skipped++
            out.warnings.push(`"${title}" SKIPPED - CHECKLIST "${String(values.checklistName)}" NOT UNIQUE IN THIS VENUE`)
            continue
          }
          checklistId = found.id
        }

        const description = values.descriptionHtml
          ? (sanitiseRichText(String(values.descriptionHtml)) || null)
          : null

        const scalar = {
          description,
          departmentId,
          sectionId,
          completionType,
          scheduleType,
          scheduleDays,
          intervalMonths: 1,
          customCron: null,
          monthlyOption: scheduleType === 'MONTHLY' ? rawMonthly : null,
          monthlyDay,
        }

        const target = raw.targetId
          ? await tx.task.findFirst({ where: { id: raw.targetId, venueId }, select: { id: true } })
          : null
        if (raw.targetId && !target) {
          out.skipped++
          out.warnings.push(`"${title}" TARGET NOT FOUND - SKIPPED`)
          continue
        }

        if (target && (action === 'UPDATE' || action === 'REVIVE')) {
          await tx.task.update({
            where: { id: target.id },
            data: {
              title,
              ...scalar,
              // A live task stays live on UPDATE; a revived task starts DRAFT.
              ...(action === 'REVIVE' ? { deletedAt: null, status: 'DRAFT' } : {}),
              ...(sectionId ? { sections: { deleteMany: {}, create: [{ sectionId }] } } : { sections: { deleteMany: {} } }),
            },
          })
          if (checklistId) await linkChecklist(tx, checklistId, target.id)
          if (action === 'REVIVE') out.revived++
          else out.updated++
          continue
        }

        const existing = await tx.task.findFirst({ where: { venueId, title, deletedAt: null }, select: { id: true } })
        if (existing) {
          out.skipped++
          out.warnings.push(`"${title}" ALREADY EXISTS - SKIPPED (CHOOSE UPDATE TO OVERWRITE)`)
          continue
        }

        const maxSort = await tx.task.findFirst({
          where: { venueId, departmentId, deletedAt: null },
          orderBy: { sortOrder: 'desc' },
          select: { sortOrder: true },
        })
        const created = await tx.task.create({
          data: {
            venueId,
            title,
            ...scalar,
            sortOrder: (maxSort?.sortOrder ?? -1) + 1,
            status: 'DRAFT',
            isActive: true,
            sections: sectionId ? { create: [{ sectionId }] } : undefined,
          },
          select: { id: true },
        })
        if (checklistId) await linkChecklist(tx, checklistId, created.id)
        out.created++
      }

      return out
    })

    return NextResponse.json(summary)
  } catch (e) {
    console.error('task import failed', e)
    return NextResponse.json({ error: 'IMPORT FAILED' }, { status: 500 })
  }
}

async function linkChecklist(tx: Tx, checklistId: string, taskId: string) {
  const maxSort = await tx.checklistTask.findFirst({
    where: { checklistId },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  })
  await tx.checklistTask.upsert({
    where: { checklistId_taskId: { checklistId, taskId } },
    create: { checklistId, taskId, sortOrder: (maxSort?.sortOrder ?? -1) + 1 },
    update: {},
  })
}
