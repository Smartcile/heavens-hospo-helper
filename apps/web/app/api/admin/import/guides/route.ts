import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { normaliseImportKey } from '@/lib/import/similarity'
import { isGuideType } from '@/lib/guide-types'
import {
  cleanAudiences,
  cleanBodyHtml,
  cleanGuideSteps,
  guideStepsCreate,
  type GuideAudienceInput,
  type GuideLinkInput,
  type GuideStepInput,
} from '@/lib/guides.server'
import type { ImportRowAction, ImportSummary } from '@/lib/import/types'

const MAX_ROWS = 400
const DRAFT_NOTE = 'IMPORTED GUIDES ARE DRAFT - PUBLISH THEM WHEN THEY ARE READY FOR THE FLOOR'

type Tx = Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>

interface RawLink { kind?: unknown; name?: unknown; qty?: unknown; note?: unknown }
interface RawStep { heading?: unknown; content?: unknown; videoUrl?: unknown; links?: unknown }
interface RawAudience { kind?: unknown; name?: unknown }
interface RawValues {
  title?: unknown
  description?: unknown
  category?: unknown
  guideType?: unknown
  bodyHtml?: unknown
  folderName?: unknown
  audiences?: unknown
  isTracked?: unknown
  requiresSignOff?: unknown
  steps?: unknown
  replaceSteps?: unknown
}
interface RawRow { action?: ImportRowAction; targetId?: string; values?: RawValues }

interface RefRow { id: string; name: string }
interface Refs {
  guides: Map<string, RefRow[]>
  folders: Map<string, RefRow[]>
  departments: Map<string, RefRow[]>
  sections: Map<string, RefRow[]>
  positions: Map<string, RefRow[]>
  items: Map<string, RefRow[]>
  tasks: Map<string, RefRow[]>
  checklists: Map<string, RefRow[]>
  recipes: Map<string, RefRow[]>
}

function name(value: unknown): string {
  return normaliseImportKey(value)
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

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const n = Number(value.replace(/[^0-9.\-]/g, ''))
  return Number.isFinite(n) ? n : null
}

async function loadRefs(tx: Tx, venueId: string): Promise<Refs> {
  const [guides, folders, departments, sections, positions, items, tasks, checklists, recipes] = [
    await tx.guide.findMany({ where: { venueId, deletedAt: null }, select: { id: true, title: true }, orderBy: { title: 'asc' } }),
    await tx.guideFolder.findMany({ where: { venueId, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    await tx.department.findMany({ where: { venueId, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    await tx.section.findMany({ where: { venueId, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    await tx.position.findMany({ where: { venueId, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    await tx.inventoryItem.findMany({ where: { venueId, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    await tx.task.findMany({ where: { venueId, deletedAt: null }, select: { id: true, title: true }, orderBy: { title: 'asc' } }),
    await tx.checklist.findMany({ where: { venueId, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    await tx.recipe.findMany({ where: { venueId, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ]

  const build = (rows: { id: string; name?: string | null; title?: string | null }[]) => {
    const map = new Map<string, RefRow[]>()
    for (const row of rows) pushTo(map, { id: row.id, name: row.name ?? row.title ?? '' })
    return map
  }

  return {
    guides: build(guides),
    folders: build(folders),
    departments: build(departments),
    sections: build(sections),
    positions: build(positions),
    items: build(items),
    tasks: build(tasks),
    checklists: build(checklists),
    recipes: build(recipes),
  }
}

function audienceMap(kind: string, refs: Refs): Map<string, RefRow[]> {
  return kind === 'DEPARTMENT' ? refs.departments : kind === 'SECTION' ? refs.sections : refs.positions
}

function linkMap(kind: string, refs: Refs): Map<string, RefRow[]> | null {
  switch (kind) {
    case 'ITEM': return refs.items
    case 'TASK': return refs.tasks
    case 'CHECKLIST': return refs.checklists
    case 'GUIDE': return refs.guides
    case 'SECTION': return refs.sections
    case 'RECIPE': return refs.recipes
    default: return null
  }
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'training.playbook.view')
  if (denied) return denied

  const venueId = session.user.role === 'MANAGER'
    ? session.user.venueId
    : req.nextUrl.searchParams.get('venueId') || session.user.venueId
  if (!venueId) return NextResponse.json({ error: 'venueId is required' }, { status: 400 })

  const refs = await loadRefs(prisma as Tx, venueId)
  const flat = (map: Map<string, RefRow[]>) => [...map.values()].flat()
  return NextResponse.json({
    guides: flat(refs.guides),
    folders: flat(refs.folders),
    departments: flat(refs.departments),
    sections: flat(refs.sections),
    positions: flat(refs.positions),
    items: flat(refs.items),
    tasks: flat(refs.tasks),
    checklists: flat(refs.checklists),
    recipes: flat(refs.recipes),
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const deniedCreate = await guardAccess(session, req, 'training.playbook.create')
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
    const deniedEdit = await guardAccess(session, req, 'training.playbook.edit')
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

        const rawType = String(values.guideType ?? 'HOW_TO').toUpperCase()
        if (rawType === 'PRODUCT_REFERENCE') {
          out.skipped++
          out.warnings.push(`"${title}" SKIPPED - PRODUCT REFERENCE GUIDES ARE NOT IMPORTED HERE`)
          continue
        }
        const guideType = isGuideType(rawType) ? rawType : 'HOW_TO'

        // Audiences
        const audiences: GuideAudienceInput[] = []
        let audienceError = ''
        for (const entry of Array.isArray(values.audiences) ? values.audiences : []) {
          const a = (entry ?? {}) as RawAudience
          const kind = String(a.kind ?? '').toUpperCase()
          const targetName = name(a.name)
          if (!['DEPARTMENT', 'SECTION', 'POSITION'].includes(kind) || !targetName) {
            audienceError = `INVALID AUDIENCE "${String((entry as { name?: unknown }).name ?? '')}"`
            break
          }
          const found = pickOne(audienceMap(kind, refs), targetName)
          if (!found || found === 'AMBIGUOUS') {
            audienceError = `${kind} "${targetName}" NOT UNIQUE IN THIS VENUE`
            break
          }
          audiences.push({ kind: kind as GuideAudienceInput['kind'], targetId: found.id })
        }
        if (audienceError) {
          out.skipped++
          out.warnings.push(`"${title}" SKIPPED - ${audienceError}`)
          continue
        }

        // Folder (create when missing — a folder is organisational, not a target)
        let folderId: string | null = null
        if (values.folderName) {
          const folderName = name(values.folderName)
          const found = pickOne(refs.folders, folderName)
          if (found === 'AMBIGUOUS') {
            out.skipped++
            out.warnings.push(`"${title}" SKIPPED - FOLDER "${folderName}" IS NOT UNIQUE`)
            continue
          }
          if (found) folderId = found.id
          else {
            const createdFolder = await tx.guideFolder.create({ data: { venueId, name: folderName }, select: { id: true } })
            folderId = createdFolder.id
            pushTo(refs.folders, { id: folderId, name: folderName })
          }
        }

        // Steps + links
        const steps: GuideStepInput[] = []
        let linkError = ''
        for (const entry of Array.isArray(values.steps) ? values.steps : []) {
          const s = (entry ?? {}) as RawStep
          const links: GuideLinkInput[] = []
          for (const rawLink of Array.isArray(s.links) ? s.links : []) {
            const l = (rawLink ?? {}) as RawLink
            const kind = String(l.kind ?? '').toUpperCase()
            const targetName = name(l.name)
            const map = linkMap(kind, refs)
            if (!map) { linkError = `INVALID LINK KIND "${kind}"`; break }
            const found = pickOne(map, targetName)
            if (!found || found === 'AMBIGUOUS') { linkError = `${kind} "${targetName}" NOT UNIQUE IN THIS VENUE`; break }
            const qty = toNumber(l.qty)
            links.push({
              kind: kind as GuideLinkInput['kind'],
              targetId: found.id,
              qty: qty != null ? Math.max(1, Math.trunc(qty)) : null,
              note: typeof l.note === 'string' && l.note.trim() ? l.note.trim() : null,
            })
          }
          if (linkError) break
          steps.push({
            heading: typeof s.heading === 'string' && s.heading.trim() ? s.heading.trim() : null,
            content: typeof s.content === 'string' ? s.content : '',
            videoUrl: typeof s.videoUrl === 'string' && s.videoUrl.trim() ? s.videoUrl.trim() : null,
            links,
          })
        }
        if (linkError) {
          out.skipped++
          out.warnings.push(`"${title}" SKIPPED - ${linkError}`)
          continue
        }

        const cleanSteps = cleanGuideSteps(steps)
        const cleanAud = cleanAudiences(audiences)
        if (cleanAud.length === 0) {
          out.warnings.push(`"${title}" HAS NO AUDIENCE - NOBODY WILL SEE THIS (DRAFT)`)
        }

        const target = raw.targetId
          ? await tx.guide.findFirst({ where: { id: raw.targetId, venueId }, select: { id: true } })
          : null
        if (raw.targetId && !target) {
          out.skipped++
          out.warnings.push(`"${title}" TARGET NOT FOUND - SKIPPED`)
          continue
        }

        if (target && (action === 'UPDATE' || action === 'REVIVE')) {
          await tx.guide.update({
            where: { id: target.id },
            data: {
              title,
              description: typeof values.description === 'string' && values.description.trim() ? values.description.trim() : null,
              category: values.category ? name(values.category) : null,
              guideType,
              bodyHtml: cleanBodyHtml(values.bodyHtml),
              folderId,
              isTracked: values.isTracked === true,
              requiresSignOff: values.requiresSignOff === true,
              ...(action === 'REVIVE' ? { deletedAt: null, status: 'DRAFT' } : {}),
              audiences: { deleteMany: {}, create: cleanAud },
            },
          })
          if (values.replaceSteps === true) {
            await tx.guideStep.deleteMany({ where: { guideId: target.id } })
            for (const step of cleanSteps) {
              await tx.guideStep.create({ data: { guideId: target.id, ...guideStepsCreate([step])[0] } })
            }
          }
          if (action === 'REVIVE') out.revived++
          else out.updated++
          continue
        }

        const existing = await tx.guide.findFirst({ where: { venueId, title, deletedAt: null }, select: { id: true } })
        if (existing) {
          out.skipped++
          out.warnings.push(`"${title}" ALREADY EXISTS - SKIPPED (CHOOSE UPDATE TO OVERWRITE)`)
          continue
        }

        await tx.guide.create({
          data: {
            venueId,
            title,
            description: typeof values.description === 'string' && values.description.trim() ? values.description.trim() : null,
            category: values.category ? name(values.category) : null,
            guideType,
            bodyHtml: cleanBodyHtml(values.bodyHtml),
            folderId,
            status: 'DRAFT',
            isTracked: values.isTracked === true,
            requiresSignOff: values.requiresSignOff === true,
            audiences: cleanAud.length ? { create: cleanAud } : undefined,
            steps: cleanSteps.length ? { create: guideStepsCreate(cleanSteps) } : undefined,
          },
        })
        out.created++
      }

      return out
    })

    return NextResponse.json(summary)
  } catch (e) {
    console.error('guide import failed', e)
    return NextResponse.json({ error: 'IMPORT FAILED' }, { status: 500 })
  }
}
