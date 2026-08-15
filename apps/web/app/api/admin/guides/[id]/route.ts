import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { postRetrainNotice } from '@/lib/retrain'
import { STEP_LINK_KINDS, type StepLinkKind } from '@/lib/guide-links'
import { resolveStepLinks } from '@/lib/guide-links.server'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'

interface Params {
  params: { id: string }
}

interface IncomingLink {
  kind: StepLinkKind
  targetId: string
  qty?: number | null
  note?: string | null
}

interface IncomingStep {
  id?: string | null // present for steps that already exist — keeps step ids stable
  heading?: string | null
  content: string
  imageUrl?: string | null
  videoUrl?: string | null
  links?: IncomingLink[]
}

interface IncomingTaskGuide {
  taskId: string
  isRequiredForCompetency: boolean
}

interface IncomingAudience {
  kind: 'DEPARTMENT' | 'SECTION' | 'POSITION'
  targetId: string
}

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, _req, 'training.playbook.view')
  if (denied) return denied

  const guide = await prisma.guide.findUnique({
    where: { id: params.id },
    include: {
      steps: { orderBy: { order: 'asc' }, include: { links: true } },
      taskGuides: { select: { id: true, taskId: true, isRequiredForCompetency: true } },
      audiences: { select: { kind: true, targetId: true } },
      department: { select: { id: true, name: true } },
    },
  })
  if (!guide || guide.deletedAt) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // One batched resolve for the whole guide rather than per step.
  const allLinks = guide.steps.flatMap((s) => s.links)
  const resolved = await resolveStepLinks(allLinks)
  const byId = new Map(resolved.map((l) => [l.id, l]))

  return NextResponse.json({
    ...guide,
    steps: guide.steps.map((s) => ({
      ...s,
      links: s.links.map((l) => byId.get(l.id)).filter(Boolean),
    })),
  })
}

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'training.playbook.edit')
  if (denied) return denied

  const existing = await prisma.guide.findUnique({ where: { id: params.id } })
  if (!existing || existing.deletedAt) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (session.user.role === 'MANAGER' && existing.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const updates: Record<string, unknown> = {}

  if (body.title !== undefined) updates.title = String(body.title).toUpperCase().trim()
  if (body.description !== undefined) updates.description = body.description?.trim() || null
  if (body.category !== undefined)
    updates.category = body.category ? String(body.category).toUpperCase().trim() : null
  if (body.departmentId !== undefined) updates.departmentId = body.departmentId || null
  if (body.isTracked !== undefined) updates.isTracked = !!body.isTracked
  if (body.isOnboarding !== undefined) updates.isOnboarding = !!body.isOnboarding
  if (body.requiresSignOff !== undefined) updates.requiresSignOff = !!body.requiresSignOff

  // Steps are diffed by id rather than deleted and recreated, so step ids stay
  // stable across saves. Anything hanging off a step (links, completions) would
  // otherwise be orphaned by an unrelated edit.
  let cleanSteps: IncomingStep[] | null = null
  if (body.steps !== undefined) {
    cleanSteps = (body.steps as IncomingStep[]).filter((s) => s.content?.trim() || s.heading?.trim())
    const existingIds = (
      await prisma.guideStep.findMany({ where: { guideId: params.id }, select: { id: true } })
    ).map((s) => s.id)
    const incomingIds = new Set(
      cleanSteps.map((s) => s.id).filter((id): id is string => !!id),
    )

    const fields = (s: IncomingStep, i: number) => ({
      order: i,
      heading: s.heading?.trim() || null,
      content: s.content?.trim() ?? '',
      imageUrl: s.imageUrl || null,
      videoUrl: s.videoUrl?.trim() || null,
    })

    updates.steps = {
      deleteMany: { id: { in: existingIds.filter((id) => !incomingIds.has(id)) } },
      update: cleanSteps
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => s.id && existingIds.includes(s.id))
        .map(({ s, i }) => ({ where: { id: s.id! }, data: fields(s, i) })),
      create: cleanSteps
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => !s.id || !existingIds.includes(s.id))
        .map(({ s, i }) => fields(s, i)),
    }
  }

  if (body.taskGuides !== undefined) {
    const tgs: IncomingTaskGuide[] = Array.isArray(body.taskGuides) ? body.taskGuides : []
    updates.taskGuides = {
      deleteMany: {},
      create: tgs.map((tg) => ({ taskId: tg.taskId, isRequiredForCompetency: tg.isRequiredForCompetency })),
    }
  }

  // Audiences carry no children, so replacing them wholesale is safe (unlike
  // steps, which own links).
  if (body.audiences !== undefined) {
    const raw: IncomingAudience[] = Array.isArray(body.audiences) ? body.audiences : []
    const seen = new Set<string>()
    const rows = raw.filter((a) => {
      if (!a?.targetId || !['DEPARTMENT', 'SECTION', 'POSITION'].includes(a.kind)) return false
      const key = `${a.kind}:${a.targetId}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    updates.audiences = {
      deleteMany: {},
      create: rows.map((a) => ({ kind: a.kind, targetId: a.targetId })),
    }
  }

  // "Significant change" → bump version + post a re-train notice to the group.
  const requireRetrain = !!body.requireRetrain
  if (requireRetrain) updates.version = { increment: 1 }

  const guide = await prisma.guide.update({
    where: { id: params.id },
    data: updates,
    include: { steps: { orderBy: { order: 'asc' } }, taskGuides: true },
  })

  // Links are synced after the step diff, because a newly created step has no id
  // until it exists. Steps come back ordered 0..n-1 matching cleanSteps, so index
  // is a safe join. Links themselves are replaced wholesale — nothing hangs off
  // a link, so there is no id to preserve.
  if (cleanSteps) {
    const saved = guide.steps
    await prisma.$transaction([
      prisma.guideStepLink.deleteMany({ where: { stepId: { in: saved.map((s) => s.id) } } }),
      ...saved.flatMap((step, i) => {
        const seen = new Set<string>()
        const rows = (cleanSteps![i]?.links ?? [])
          .filter((l) => {
            if (!l?.targetId || !STEP_LINK_KINDS.includes(l.kind)) return false
            const key = `${l.kind}:${l.targetId}`
            if (seen.has(key)) return false
            seen.add(key)
            return true
          })
          .map((l, order) => ({
            stepId: step.id,
            kind: l.kind,
            targetId: l.targetId,
            qty: typeof l.qty === 'number' ? l.qty : null,
            note: l.note?.trim() || null,
            order,
          }))
        return rows.length ? [prisma.guideStepLink.createMany({ data: rows })] : []
      }),
    ])
  }

  if (requireRetrain) {
    try {
      await postRetrainNotice({
        venueId: guide.venueId,
        departmentId: guide.departmentId,
        title: guide.title,
        summary: body.changeSummary ?? null,
        createdById: session.user.id,
      })
    } catch { /* never block the save */ }
  }

  return NextResponse.json(guide)
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, _req, 'training.playbook.delete')
  if (denied) return denied

  const existing = await prisma.guide.findUnique({
    where: { id: params.id },
    select: { venueId: true, deletedAt: true },
  })
  if (!existing || existing.deletedAt) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (session.user.role === 'MANAGER' && existing.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.guide.update({
    where: { id: params.id },
    data: { deletedAt: new Date() },
  })

  return NextResponse.json({ success: true })
}
