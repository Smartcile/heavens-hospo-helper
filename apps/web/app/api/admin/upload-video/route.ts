import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { handleVideoUpload } from '@/lib/upload-video.server'

// Admin guide-step video upload: transcodes the clip to a small phone-friendly
// MP4 server-side (see lib/upload-video.server.ts).
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const form = await req.formData()
  const result = await handleVideoUpload(form.get('file') as File | null)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ url: result.url }, { status: 201 })
}
