import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

// Create an end-of-day note. If assignGuideId is given, also assign that guide
// to the person (reason = the note category) and link it.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { staffId, shiftDate, category, content, assignGuideId } = body as {
    staffId: string
    shiftDate: string
    category?: string
    content: string
    assignGuideId?: string | null
  }

  if (!staffId || !shiftDate || !content?.trim()) {
    return NextResponse.json({ error: 'staffId, shiftDate and content are required' }, { status: 400 })
  }

  const staff = await prisma.staff.findUnique({
    where: { id: staffId },
    select: { venueId: true },
  })
  if (!staff) return NextResponse.json({ error: 'Staff not found' }, { status: 404 })
  if (session.user.role === 'MANAGER' && staff.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const noteCategory = (category || 'AREA TO WORK ON').toUpperCase().trim()
  let linkedGuideId: string | null = null

  if (assignGuideId) {
    await prisma.guideAssignment.upsert({
      where: { guideId_staffId: { guideId: assignGuideId, staffId } },
      update: { reason: noteCategory, deletedAt: null, assignedById: session.user.id },
      create: { guideId: assignGuideId, staffId, reason: noteCategory, assignedById: session.user.id },
    })
    linkedGuideId = assignGuideId
  }

  const note = await prisma.shiftNote.create({
    data: {
      staffId,
      venueId: staff.venueId,
      authorId: session.user.id,
      shiftDate: new Date(shiftDate),
      category: noteCategory,
      content: content.trim(),
      linkedGuideId,
    },
  })

  return NextResponse.json(note, { status: 201 })
}
