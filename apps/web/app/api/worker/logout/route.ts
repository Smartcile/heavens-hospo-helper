import { NextRequest, NextResponse } from 'next/server'
import { workerCookieSecure } from '@/lib/worker-session'

// Clears the worker session. With `{ all: true }` (an explicit sign-out from
// the worker UI) it also clears the NextAuth admin cookie, so signing out of
// either view signs out of both. The inactivity timers call this without the
// flag and must not end an 8-hour admin session.
export async function POST(req: NextRequest) {
  const response = NextResponse.json({ success: true })
  response.cookies.set('hospo-worker-session', '', {
    httpOnly: true,
    secure: workerCookieSecure,
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  })

  let all = false
  try {
    const body = await req.json()
    all = !!body?.all
  } catch {
    // No body — worker-only logout.
  }

  if (all) {
    for (const name of ['next-auth.session-token', '__Secure-next-auth.session-token']) {
      response.cookies.set(name, '', {
        httpOnly: true,
        secure: name.startsWith('__Secure-'),
        sameSite: 'lax',
        maxAge: 0,
        path: '/',
      })
    }
  }

  return response
}
