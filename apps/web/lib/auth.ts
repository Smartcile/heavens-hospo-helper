import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from '@hospo-ops/db'

export const authOptions: NextAuthOptions = {
  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60, // 8 hours
  },
  pages: {
    signIn: '/',
  },
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const staff = await prisma.staff.findFirst({
          where: {
            email: credentials.email.toLowerCase().trim(),
            deletedAt: null,
            isActive: true,
            role: { in: ['ADMIN', 'MANAGER'] },
          },
          include: { venue: { select: { isDemo: true, isActive: true } } },
        })

        if (!staff?.password) return null

        // Block manager login when the demo venue is disabled (but allow ADMIN).
        if (staff.role !== 'ADMIN' && staff.venue.isDemo && !staff.venue.isActive) {
          return null
        }

        const isValid = await bcrypt.compare(credentials.password, staff.password)
        if (!isValid) return null

        return {
          id: staff.id,
          name: `${staff.firstName} ${staff.lastName}`,
          email: staff.email ?? credentials.email,
          role: staff.role,
          venueId: staff.venueId,
          defaultVenueId: staff.defaultVenueId ?? undefined,
          venueIsDemo: staff.venue.isDemo,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = user.role
        token.venueId = user.venueId
        token.defaultVenueId = user.defaultVenueId
        token.venueIsDemo = user.venueIsDemo
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string
        session.user.role = token.role as string
        session.user.venueId = token.venueId as string
        session.user.defaultVenueId = (token.defaultVenueId as string) ?? undefined
        session.user.venueIsDemo = (token.venueIsDemo as boolean) ?? false
      }
      return session
    },
  },
}
