import { NextRequest, NextResponse } from 'next/server'
import { getWorkerSession } from '@/lib/worker-session'
import { handleVideoUpload } from '@/lib/upload-video.server'

// Worker-side guide-step video upload — mirrors the admin route but
// authenticates with the worker JWT session.
export async function POST(req: NextRequest) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const form = await req.formData()
  const result = await handleVideoUpload(form.get('file') as File | null)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ url: result.url }, { status: 201 })
}
