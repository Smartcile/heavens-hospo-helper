import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { storageRoot } from '@/lib/storage'

const MAX_BYTES = 25 * 1024 * 1024

// Upload a guide-level PDF (the whole-guide document). Stored in the
// UPLOAD_PATH root and served via /api/upload; the guide save persists the
// returned URL in pdfPath and the guide PDF download merges it.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'training.playbook.edit')
  if (denied) return denied

  const guide = await prisma.guide.findFirst({
    where: { id: params.id, deletedAt: null },
    select: { id: true, venueId: true },
  })
  if (!guide) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.user.role === 'MANAGER' && guide.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'A PDF file is required' }, { status: 400 })
  }
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  if (!isPdf) return NextResponse.json({ error: 'Only PDF files are allowed' }, { status: 400 })
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'PDF is too large (25MB max)' }, { status: 400 })
  }

  const base = file.name.replace(/[^a-z0-9.]/gi, '_').replace(/\.pdf$/i, '') || 'guide'
  const filename = `${crypto.randomUUID()}-${base}.pdf`
  const root = storageRoot()
  await mkdir(root, { recursive: true })
  await writeFile(join(root, filename), Buffer.from(await file.arrayBuffer()))

  return NextResponse.json({ url: `/api/upload/${filename}` })
}
