import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'
import { discoverPdfFields, proposeFieldMapping } from '@/lib/gift-card-template'
import { writeFile, mkdir } from 'fs/promises'
import { existsSync, readFileSync } from 'fs'
import path from 'path'

const TEMPLATE_DIR = path.join(process.cwd(), 'public', 'uploads', 'gift-cards', 'templates')
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'performance.giftcards.view')
  if (denied) return denied

  const templates = await prisma.giftCardTemplate.findMany({
    where: { venueId: session.user.venueId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
  })

  const withFields = await Promise.all(
    templates.map(async (t) => {
      let fields: { name: string; type: string }[] = []
      if (existsSync(t.filePath)) {
        try {
          fields = await discoverPdfFields(readFileSync(t.filePath))
        } catch (err) {
          fields = []
        }
      }
      return { ...t, fields }
    }),
  )

  return NextResponse.json(withFields)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'performance.giftcards.issue')
  if (denied) return denied

  const form = await req.formData()
  const file = form.get('file') as File | null
  const name = String(form.get('name') || '').trim()

  if (!file || file.size === 0) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: 'PDF must be under 25MB' }, { status: 400 })
  if (!/\.pdf$/i.test(file.name)) return NextResponse.json({ error: 'Only PDF files are allowed' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())

  let fields
  try {
    fields = await discoverPdfFields(buffer)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }
  if (fields.length === 0) {
    return NextResponse.json({ error: 'PDF has no fillable form fields' }, { status: 400 })
  }

  const safeName = file.name.replace(/[^a-z0-9.]/gi, '_')
  const filename = `${crypto.randomUUID()}-${safeName}`
  await mkdir(TEMPLATE_DIR, { recursive: true })
  await writeFile(path.join(TEMPLATE_DIR, filename), buffer)

  const template = await prisma.giftCardTemplate.create({
    data: {
      venueId: session.user.venueId,
      name: name || file.name,
      filePath: path.join(TEMPLATE_DIR, filename),
      fieldMapping: JSON.parse(JSON.stringify(proposeFieldMapping(fields))),
      isActive: false,
    },
  })

  return NextResponse.json({ ...template, fields }, { status: 201 })
}
