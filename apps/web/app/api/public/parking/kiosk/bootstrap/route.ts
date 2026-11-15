import { NextRequest, NextResponse } from 'next/server'
import { loadKioskBootstrap } from '@/lib/parking-kiosk-bootstrap.server'

// Public, read-only kiosk configuration for the standalone customer site.
// Returns no secrets: no code hash, no contact email, no claim URLs, no members.

export async function GET(req: NextRequest) {
  const venue = req.nextUrl.searchParams.get('venue')
  const result = await loadKioskBootstrap(venue)
  return NextResponse.json(result, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
