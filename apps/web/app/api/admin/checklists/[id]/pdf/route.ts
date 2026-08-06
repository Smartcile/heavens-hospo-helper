import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { generateChecklistPdf, checklistPdfToBuffer } from '@/lib/checklist-pdf'

interface Params {
  params: { id: string }
}

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const checklist = await prisma.checklist.findFirst({
    where: {
      id: params.id,
      deletedAt: null,
      ...(session.user.role === 'MANAGER' ? { venueId: session.user.venueId } : {}),
    },
    include: {
      venue: { select: { name: true } },
      tasks: {
        orderBy: { sortOrder: 'asc' },
        include: {
          task: {
            select: { id: true, title: true, deletedAt: true, section: { select: { name: true } } },
          },
        },
      },
    },
  })
  if (!checklist) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const doc = generateChecklistPdf({
    venueName: checklist.venue.name,
    name: checklist.name,
    description: checklist.description,
    appearFromTime: checklist.appearFromTime,
    tasks: checklist.tasks
      .filter((ct) => ct.task && !ct.task.deletedAt)
      .map((ct) => ({ title: ct.task!.title, sectionName: ct.task!.section?.name ?? null })),
  })

  return new NextResponse(checklistPdfToBuffer(doc), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="Checklist - ${checklist.name}.pdf"`,
    },
  })
}
