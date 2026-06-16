import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { getWorkerSession } from '@/lib/worker-session'
import { getTodayDate } from '@/lib/utils'
import { checkUntrainedOnCompletion } from '@/lib/followups'
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

  const existing = await prisma.taskCompletion.findFirst({
    where: { taskId: params.id, staffId: session.staffId, scheduledDate: today },
  })

  if (existing) {
    return NextResponse.json({ error: 'TASK ALREADY COMPLETED' }, { status: 409 })
  }

  const contentType = req.headers.get('content-type') ?? ''
  let note: string | null = null
  let photoUrl: string | null = null

  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData()
    note = (form.get('note') as string) || null

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
  }

  const completion = await prisma.taskCompletion.create({
    data: {
      taskId: params.id,
      staffId: session.staffId,
      scheduledDate: today,
      note,
      photoUrl,
    },
  })

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
