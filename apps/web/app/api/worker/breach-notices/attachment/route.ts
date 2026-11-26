import { NextRequest, NextResponse } from 'next/server'
import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { getWorkerSession } from '@/lib/worker-session'
import { saveImageUpload } from '@/lib/upload-image.server'
import { BREACH_ATTACHMENT_MAX_BYTES } from '@/lib/breach-notices'
import { storageRoot } from '@/lib/storage'

// A breach notice needs photos AND the ticket PDF, so this is deliberately
// separate from /api/worker/upload (image-only). Files land in the storage
// root and are served by the existing /api/upload/[filename] route.
export async function POST(req: NextRequest) {
  const session = await getWorkerSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'NO FILE PROVIDED' }, { status: 400 })
  }

  const isImage = file.type.startsWith('image/')
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  if (!isImage && !isPdf) {
    return NextResponse.json({ error: 'ONLY PHOTOS OR PDF FILES ARE ALLOWED' }, { status: 400 })
  }
  if (file.size > BREACH_ATTACHMENT_MAX_BYTES) {
    return NextResponse.json({ error: 'FILE IS TOO LARGE (MAX 25MB)' }, { status: 413 })
  }

  if (isImage) {
    const filename = await saveImageUpload(file)
    return NextResponse.json({ url: `/api/upload/${filename}` }, { status: 201 })
  }

  const base = file.name.replace(/[^a-z0-9.]/gi, '_').replace(/\.pdf$/i, '') || 'ticket'
  const filename = `${crypto.randomUUID()}-${base}.pdf`
  const root = storageRoot()
  await mkdir(root, { recursive: true })
  await writeFile(join(root, filename), Buffer.from(await file.arrayBuffer()))
  return NextResponse.json({ url: `/api/upload/${filename}` }, { status: 201 })
}
