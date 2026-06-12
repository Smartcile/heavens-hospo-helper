import { NextResponse } from 'next/server'
import { workerCookieSecure } from '@/lib/worker-session'

export async function POST() {
  const response = NextResponse.json({ success: true })
  response.cookies.set('hospo-worker-session', '', {
    httpOnly: true,
    secure: workerCookieSecure,
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  })
  return response
}
