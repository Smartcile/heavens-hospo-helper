import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { orderedIds } = body as { orderedIds: string[] }

  if (!Array.isArray(orderedIds)) {
    return NextResponse.json({ error: 'orderedIds must be an array' }, { status: 400 })
  }

  await Promise.all(
    orderedIds.map((id, index) =>
      prisma.task.update({ where: { id }, data: { sortOrder: index } })
    )
  )

  return NextResponse.json({ success: true })
}
