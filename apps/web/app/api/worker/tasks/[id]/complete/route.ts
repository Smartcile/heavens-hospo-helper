import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'
import { getTodayDate } from '@/lib/utils'
import { checkUntrainedOnCompletion } from '@/lib/followups'
import { reconcileSectionWork } from '@/lib/section-work.server'
import { readingVerdict, criticalVerdict, readingAlertMessage } from '@/lib/food-safety'
import {
  resolveOutcomePolicyForChecklists,
  outcomeValidationError,
  isTerminalOutcome,
  type TaskOutcome,
} from '@/lib/task-outcomes'
import { applicableChecklistsForStaff } from '@/lib/checklist-applicability.server'
import { writeFile } from 'fs/promises'
import { join } from 'path'

interface Params {
  params: { id: string }
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Stamp the completion against the venue's local calendar day.
  const venue = await prisma.venue.findUnique({
    where: { id: session.venueId },
    select: { timezone: true },
  })
  const today = getTodayDate(venue?.timezone)
  const nowHHmm = new Intl.DateTimeFormat('en-GB', {
    timeZone: venue?.timezone ?? 'Pacific/Auckland',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date())

  // Shared list: a task is done for the whole floor once anyone completes it for
  // the day (checked across all staff, not just this one) — prevents double-ups.
  const existing = await prisma.taskCompletion.findFirst({
    where: { taskId: params.id, scheduledDate: today },
  })

  if (existing) {
    return NextResponse.json({ error: 'TASK ALREADY DONE FOR TODAY' }, { status: 409 })
  }

  const contentType = req.headers.get('content-type') ?? ''
  let note: string | null = null
  let photoUrl: string | null = null
  let value: number | null = null
  let rawOutcome: string | null = null

  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData()
    note = (form.get('note') as string) || null
    rawOutcome = (form.get('outcome') as string) ?? null
    const rawValue = form.get('value') as string | null
    if (rawValue != null && rawValue.trim() !== '') value = Number(rawValue)

    const photo = form.get('photo') as File | null
    if (photo && photo.size > 0) {
      const bytes = await photo.arrayBuffer()
      const buffer = Buffer.from(bytes)
      const filename = `${crypto.randomUUID()}-${photo.name.replace(/[^a-z0-9.]/gi, '_')}`
      const uploadPath = process.env.UPLOAD_PATH ?? '/app/uploads'
      await writeFile(join(uploadPath, filename), buffer)
      photoUrl = `/uploads/${filename}`
    }
  } else {
    const body = await req.json()
    note = body.note ?? null
    rawOutcome = body.outcome ?? null
    if (body.value != null && body.value !== '') value = Number(body.value)
  }

  const task = await prisma.task.findUnique({
    where: { id: params.id },
    select: {
      id: true, title: true, venueId: true, departmentId: true,
      completionType: true, readingUnit: true, readingMin: true, readingMax: true,
      criticalMin: true, criticalMax: true,
      allowedOutcomes: true, overrideOutcomes: true, requireOutcomeReason: true,
    },
  })
  if (!task || task.venueId !== session.venueId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Outcome policy hierarchy: task override → first open checklist → all.
  // Uses the same audience rules as the worker task list, so the outcome the
  // worker saw is always accepted here.
  const { checklists } = await applicableChecklistsForStaff({
    staffId: session.staffId,
    venueId: session.venueId,
    departmentId: session.departmentId,
    taskId: params.id,
  })
  const policy = resolveOutcomePolicyForChecklists(task, checklists, { today, nowHHmm })

  const outcome: TaskOutcome = (rawOutcome || 'DONE') as TaskOutcome
  const invalid = outcomeValidationError({
    outcome,
    allowed: policy.allowed,
    requireReason: policy.requireReason,
    note,
  })
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 })

  // ── PARTIAL: record the in-progress state and keep the task on the floor. ──
  if (!isTerminalOutcome(outcome)) {
    const progress = await prisma.taskProgress.upsert({
      where: { taskId: params.id },
      create: { taskId: params.id, staffId: session.staffId, note, outcome },
      update: { staffId: session.staffId, note, outcome },
    })

    // Performing the task without the required training is still worth a
    // follow-up, even if the job isn't finished yet. Fire-and-forget so a slow
    // follow-up can never hold the worker's save open.
    void checkUntrainedOnCompletion({
      taskId: params.id,
      staffId: session.staffId,
      venueId: session.venueId,
      date: today,
    }).catch(() => { /* ignore */ })

    return NextResponse.json(progress, { status: 200 })
  }

  // ── Terminal outcome: DONE / NOT_REQUIRED / DID_NOT_COMPLETE. ──
  // READING tasks: only a DONE reading is measured against the bands; the other
  // outcomes are "no reading taken" and must not raise out-of-range alerts.
  const valueStatus =
    outcome === 'DONE' && task.completionType === 'READING' && value != null && Number.isFinite(value)
      ? readingVerdict(value, task)
      : 'NA'

  const completion = await prisma.$transaction(async (tx) => {
    const created = await tx.taskCompletion.create({
      data: {
        taskId: params.id,
        staffId: session.staffId,
        scheduledDate: today,
        note,
        photoUrl,
        outcome,
        value,
        valueStatus,
      },
    })
    // A terminal outcome ends any in-progress state for this task.
    await tx.taskProgress.deleteMany({ where: { taskId: params.id } })
    return created
  })

  // Out of range → raise an HsAlert (CRITICAL when past the danger band, which
  // also posts a venue Notice). Best-effort — never block the completion.
  if (outcome === 'DONE' && valueStatus === 'FAIL' && value != null) {
    const critical = criticalVerdict(value, task)
    try {
      const alert = await prisma.hsAlert.create({
        data: {
          venueId: task.venueId,
          taskId: task.id,
          severity: critical ? 'CRITICAL' : 'WARNING',
          kind: 'OUT_OF_RANGE',
          message: readingAlertMessage(task.title, value, task, task.readingUnit),
          value,
        },
      })
      if (critical) {
        await prisma.notice.create({
          data: {
            venueId: task.venueId,
            departmentId: task.departmentId,
            title: `${task.title} — CRITICAL READING`,
            body: `${alert.message}. Logged by ${session.firstName ?? 'a staff member'}. Check and correct immediately.`,
            priority: 'URGENT',
            requiresAck: false,
            pinned: true,
            startsAt: new Date(),
            isActive: true,
            createdById: session.staffId,
          },
        })
      }
    } catch { /* ignore */ }
  }

  // Trigger: completed by someone without the task's required training? Flag it.
  // Best-effort — never let this block the completion response. Only a real
  // completion counts; NOT_REQUIRED / DID_NOT_COMPLETE never did the work.
  if (outcome === 'DONE') {
    // Both are best-effort. Dispatch them without awaiting so a slow query (or
    // a large venue reconcile) can never hold the completion response open.
    void checkUntrainedOnCompletion({
      taskId: params.id,
      staffId: session.staffId,
      venueId: session.venueId,
      date: today,
    }).catch(() => { /* ignore */ })

    // A completed pathway task can flip a MILESTONE to DONE, which raises a
    // section-work review (but never grants the section).
    void reconcileSectionWork(session.staffId).catch(() => { /* ignore */ })
  }

  return NextResponse.json(completion, { status: 201 })
}
