import { NextResponse } from 'next/server'
import { getWorkerSession } from '@/lib/worker-session'
import { getStaffTraining } from '@/lib/training'

export async function GET() {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await getStaffTraining(session.staffId)
  if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ firstName: session.firstName, items: result.items })
}
