import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import QRCode from 'qrcode'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const venueId = searchParams.get('venueId')

  const where = {
    deletedAt: null,
    ...(venueId ? { venueId } : {}),
    ...(session.user.role === 'MANAGER' ? { venueId: session.user.venueId } : {}),
  }

  const codes = await prisma.qRCode.findMany({
    where,
    include: {
      venue: { select: { id: true, name: true } },
      department: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  const appUrl = process.env.APP_URL ?? 'http://localhost:3000'

  const codesWithUrls = await Promise.all(
    codes.map(async (code) => {
      const url = `${appUrl}/w/login?token=${code.token}`
      const qrDataUrl = await QRCode.toDataURL(url, {
        width: 300,
        margin: 2,
        color: { dark: '#0A0A0A', light: '#F5F5F5' },
      })
      return { ...code, url, qrDataUrl }
    })
  )

  return NextResponse.json(codesWithUrls)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { venueId, departmentId, label } = body

  if (!venueId || !label?.trim()) {
    return NextResponse.json({ error: 'venueId and label are required' }, { status: 400 })
  }

  const code = await prisma.qRCode.create({
    data: {
      venueId,
      departmentId: departmentId ?? null,
      label: String(label).toUpperCase().trim(),
    },
  })

  const appUrl = process.env.APP_URL ?? 'http://localhost:3000'
  const url = `${appUrl}/w/login?token=${code.token}`
  const qrDataUrl = await QRCode.toDataURL(url, {
    width: 300,
    margin: 2,
    color: { dark: '#0A0A0A', light: '#F5F5F5' },
  })

  return NextResponse.json({ ...code, url, qrDataUrl }, { status: 201 })
}
