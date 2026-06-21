import { NextResponse } from 'next/server'
import { getWorkerSession } from '@/lib/worker-session'
import { getStaffSops } from '@/lib/training'

export async function GET() {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await getStaffSops(session.staffId)
  if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ items: result.items })
}
