import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'ops.inventory.edit')
  if (denied) return denied

  const supplier = await prisma.supplier.findFirst({
    where: { id: params.id, deletedAt: null },
    select: { id: true, venueId: true },
  })
  if (!supplier) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.user.role === 'MANAGER' && supplier.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { name, contact, email, phone, notes, dropOffGuideId } = await req.json()
  const data: Record<string, unknown> = {}
  if (name !== undefined) data.name = String(name).toUpperCase().trim()
  if (contact !== undefined) data.contact = contact || null
  if (email !== undefined) data.email = email || null
  if (phone !== undefined) data.phone = phone || null
  if (notes !== undefined) data.notes = notes || null

  // A supplier may only point at a live SUPPLIER_INFO guide in its own venue.
  // DRAFT is allowed on purpose — the supplier screen warns "PUBLISH TO SHOW
  // WORKERS" and the worker delivery screen hides it until published.
  if (dropOffGuideId !== undefined) {
    if (dropOffGuideId) {
      const guide = await prisma.guide.findFirst({
        where: {
          id: String(dropOffGuideId),
          venueId: supplier.venueId,
          deletedAt: null,
          guideType: 'SUPPLIER_INFO',
        },
        select: { id: true },
      })
      if (!guide) {
        return NextResponse.json(
          { error: 'DROP-OFF GUIDE MUST BE A LIVE SUPPLIER INFO GUIDE IN THIS VENUE' },
          { status: 400 },
        )
      }
      data.dropOffGuideId = guide.id
    } else {
      data.dropOffGuideId = null
    }
  }

  const updated = await prisma.supplier.update({
    where: { id: params.id },
    data,
    include: { dropOffGuide: { select: { id: true, title: true, status: true, guideType: true } } },
  })
  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, _req, 'ops.inventory.delete')
  if (denied) return denied

  const supplier = await prisma.supplier.findFirst({
    where: { id: params.id, deletedAt: null },
    select: { id: true, venueId: true },
  })
  if (!supplier) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (session.user.role === 'MANAGER' && supplier.venueId !== session.user.venueId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.supplier.update({ where: { id: params.id }, data: { deletedAt: new Date() } })
  return NextResponse.json({ success: true })
}
