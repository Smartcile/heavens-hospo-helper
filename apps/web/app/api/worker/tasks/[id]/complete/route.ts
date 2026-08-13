import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'
import { getTodayDate } from '@/lib/utils'
import { checkUntrainedOnCompletion } from '@/lib/followups'
import { readingVerdict, criticalVerdict, readingAlertMessage } from '@/lib/food-safety'
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

  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData()
    note = (form.get('note') as string) || null
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
    if (body.value != null && body.value !== '') value = Number(body.value)
  }

  // READING tasks: evaluate the value against the task's bands and denormalise
  // the verdict onto the completion (survives later threshold edits).
  const task = await prisma.task.findUnique({
    where: { id: params.id },
    select: {
      id: true, title: true, venueId: true, departmentId: true,
      completionType: true, readingUnit: true, readingMin: true, readingMax: true,
      criticalMin: true, criticalMax: true,
    },
  })
  const valueStatus =
    task?.completionType === 'READING' && value != null && Number.isFinite(value)
      ? readingVerdict(value, task)
      : 'NA'

  const completion = await prisma.taskCompletion.create({
    data: {
      taskId: params.id,
      staffId: session.staffId,
      scheduledDate: today,
      note,
      photoUrl,
      value,
      valueStatus,
    },
  })

  // Out of range → raise an HsAlert (CRITICAL when past the danger band, which
  // also posts a venue Notice). Best-effort — never block the completion.
  if (task && valueStatus === 'FAIL' && value != null) {
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
  // Best-effort — never let this block the completion response.
  try {
    await checkUntrainedOnCompletion({
      taskId: params.id,
      staffId: session.staffId,
      venueId: session.venueId,
      date: today,
    })
  } catch { /* ignore */ }

  return NextResponse.json(completion, { status: 201 })
}
