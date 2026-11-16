import { NextRequest, NextResponse } from 'next/server'
import { loadGuestEntryBootstrap } from '@/lib/ftp-guest-entry.server'

// Public, read-only configuration for the event customer-entry page. Returns
// no secrets: no code/PIN hashes, no claim URLs, no member data.

export async function GET(req: NextRequest) {
  const venue = req.nextUrl.searchParams.get('venue')
  const type = req.nextUrl.searchParams.get('type')
  const result = await loadGuestEntryBootstrap(venue, type)
  return NextResponse.json(result, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
