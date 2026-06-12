import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Admin routes — check NextAuth session
  if (pathname.startsWith('/admin') && !pathname.startsWith('/admin/login')) {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
    if (!token) {
      const loginUrl = req.nextUrl.clone()
      loginUrl.pathname = '/admin/login'
      return NextResponse.redirect(loginUrl)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/((?!login).*)'],
}
