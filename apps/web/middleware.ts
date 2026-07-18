import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { shouldBlockDemoWrite } from '@/lib/demo-block'

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Admin page routes — check NextAuth session
  if (pathname.startsWith('/admin')) {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
    if (!token) {
      const loginUrl = req.nextUrl.clone()
      loginUrl.pathname = '/'
      return NextResponse.redirect(loginUrl)
    }
  }

  // Admin API write routes — block demo-venue managers from mutating demo data
  if (pathname.startsWith('/api/admin/')) {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
    if (shouldBlockDemoWrite(pathname, req.method, token)) {
      return NextResponse.json(
        { error: 'Demo venue is read-only for non-admin users' },
        { status: 403 }
      )
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
}
