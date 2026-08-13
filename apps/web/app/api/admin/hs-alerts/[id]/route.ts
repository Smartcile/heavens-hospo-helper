import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

interface Params {
  params: { id: string }
}

// Resolve an alert (manager action) or soft-delete it.
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  if (body.action !== 'resolve') {
    return NextResponse.json({ error: 'action must be "resolve"' }, { status: 400 })
  }

  const alert = await prisma.hsAlert.update({
    where: { id: params.id },
    data: {
      status: 'RESOLVED',
      resolvedById: session.user.id,
      resolvedAt: new Date(),
      resolutionNote: body.note ?? null,
    },
  })

  return NextResponse.json(alert)
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await prisma.hsAlert.update({
    where: { id: params.id },
    data: { deletedAt: new Date() },
  })

  return NextResponse.json({ success: true })
}
