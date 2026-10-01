import { NextRequest, NextResponse } from 'next/server'
import { getWorkerSession } from '@/lib/worker-session'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'

// Worker-side image upload (guide step photos and similar). Mirrors the admin
// upload route but authenticates with the worker JWT session instead of NextAuth.
export async function POST(req: NextRequest) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const form = await req.formData()
  const file = form.get('file') as File | null
  if (!file || file.size === 0) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'Only image files are allowed' }, { status: 400 })
  }

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)
  const uploadPath = process.env.UPLOAD_PATH ?? '/app/uploads'
  await mkdir(uploadPath, { recursive: true })

  const safeName = file.name.replace(/[^a-z0-9.]/gi, '_')
  const filename = `${crypto.randomUUID()}-${safeName}`
  await writeFile(join(uploadPath, filename), buffer)

  return NextResponse.json({ url: `/api/upload/${filename}` }, { status: 201 })
}
