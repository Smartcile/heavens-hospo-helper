import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { guardAccess } from '@/lib/permissions'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const denied = await guardAccess(session, req, 'customers.customers.view')
  if (denied) return denied

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') || ''
  const venueId = session.user.role === 'MANAGER' ? session.user.venueId : (searchParams.get('venueId') || undefined)

  const where: any = { deletedAt: null }
  if (venueId) where.venueId = venueId
  if (session.user.role === 'MANAGER') where.venueId = session.user.venueId

  const bookings = await prisma.booking.findMany({
    where,
    select: { contactName: true, contactPhone: true, contactEmail: true, date: true, partySize: true },
    orderBy: { date: 'desc' },
  })

  // Group by phone (or name if no phone)
  const customerMap = new Map<string, { name: string; phone: string; email: string | null; dates: string[]; pax: number; count: number }>()

  for (const b of bookings) {
    const key = b.contactPhone || b.contactName.toUpperCase()
    const existing = customerMap.get(key)
    if (existing) {
      existing.count++
      existing.pax += b.partySize
      if (!existing.dates.includes(String(b.date).slice(0, 10))) existing.dates.push(String(b.date).slice(0, 10))
    } else {
      customerMap.set(key, {
        name: b.contactName,
        phone: b.contactPhone || '',
        email: b.contactEmail,
        dates: [String(b.date).slice(0, 10)],
        pax: b.partySize,
        count: 1,
      })
    }
  }

  let customers = Array.from(customerMap.values()).map((c) => ({
    phone: c.phone,
    name: c.name,
    email: c.email,
    lastBooking: c.dates.sort().reverse()[0],
    totalBookings: c.count,
    totalPax: c.pax,
  }))

  if (search) {
    const s = search.toLowerCase()
    customers = customers.filter((c) =>
      c.phone.includes(s) || c.name.toLowerCase().includes(s) || (c.email && c.email.toLowerCase().includes(s))
    )
  }

  // Sort by recent first
  customers.sort((a, b) => b.lastBooking.localeCompare(a.lastBooking))

  return NextResponse.json(customers)
}
