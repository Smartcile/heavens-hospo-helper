import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { discoverPdfFields, proposeFieldMapping, GiftCardFieldMapping } from '@/lib/gift-card-template'
import { writeFile, mkdir, unlink } from 'fs/promises'
import { existsSync } from 'fs'
import { storageDir } from '@/lib/storage'
import path from 'path'

const TEMPLATE_DIR = storageDir('gift-cards', 'templates')
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'performance.giftcards.issue')
  if (denied) return denied

  const template = await prisma.giftCardTemplate.findFirst({
    where: { id: params.id, venueId: session.user.venueId, deletedAt: null },
  })
  if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const form = await req.formData()
  const file = form.get('file') as File | null
  if (!file || file.size === 0) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: 'PDF must be under 25MB' }, { status: 400 })
  if (!/\.pdf$/i.test(file.name)) return NextResponse.json({ error: 'Only PDF files are allowed' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  let fields: { name: string; type: string }[]
  try {
    fields = await discoverPdfFields(buffer)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
  if (fields.length === 0) {
    return NextResponse.json({ error: 'PDF has no fillable form fields' }, { status: 400 })
  }

  // Write the replacement next to the old one, then drop the old file.
  const safeName = file.name.replace(/[^a-z0-9.]/gi, '_')
  const filename = `${crypto.randomUUID()}-${safeName}`
  await mkdir(TEMPLATE_DIR, { recursive: true })
  const newPath = path.join(TEMPLATE_DIR, filename)
  await writeFile(newPath, buffer)

  // Keep every mapping row whose field still exists on the replacement file,
  // and auto-suggest rows for brand-new fields (name/active are untouched).
  const existing = (template.fieldMapping as unknown as GiftCardFieldMapping[]) ?? []
  const fieldNames = new Set(fields.map((f) => f.name))
  const kept = existing.filter((m) => fieldNames.has(m.pdfField))
  const proposed = proposeFieldMapping(fields).filter((m) => !kept.some((k) => k.pdfField === m.pdfField))
  const fieldMapping = [...kept, ...proposed]

  const updated = await prisma.giftCardTemplate.update({
    where: { id: params.id },
    data: { filePath: newPath, fieldMapping: JSON.parse(JSON.stringify(fieldMapping)) },
  })

  // DB now points at the new file — only then remove the old one.
  if (template.filePath && template.filePath !== newPath && existsSync(template.filePath)) {
    await unlink(template.filePath).catch(() => {})
  }

  return NextResponse.json({ ...updated, fields })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'performance.giftcards.issue')
  if (denied) return denied

  const template = await prisma.giftCardTemplate.findFirst({
    where: { id: params.id, venueId: session.user.venueId, deletedAt: null },
  })
  if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Unlink the stored PDF. Cards issued after this fall back to the built-in
  // design until a replacement file is uploaded; already-issued card PDFs are
  // self-contained files and are unaffected.
  if (template.filePath && existsSync(template.filePath)) {
    await unlink(template.filePath).catch(() => {})
  }
  const updated = await prisma.giftCardTemplate.update({
    where: { id: params.id },
    data: { filePath: null },
  })

  return NextResponse.json(updated)
}
