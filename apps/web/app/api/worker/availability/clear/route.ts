import { NextResponse } from 'next/server'
import { getWorkerSession } from '@/lib/worker-session'

// Clearing a day is a manager action. Workers edit the day (available /
// unavailable) instead; the admin clear route remains the only delete path.
export async function POST() {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  return NextResponse.json(
    { error: 'CLEARING IS A MANAGER ACTION — EDIT THE DAY INSTEAD' },
    { status: 403 },
  )
}
