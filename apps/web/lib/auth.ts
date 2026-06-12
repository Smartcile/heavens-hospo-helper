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
    signIn: '/admin/login',
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
            // Use email as login — map to firstName+lastName combo or swiftPosId
            // For Phase 1, we store admin email in swiftPosId field as login identifier
            swiftPosId: credentials.email.toLowerCase(),
            deletedAt: null,
            isActive: true,
            role: { in: ['ADMIN', 'MANAGER'] },
          },
          include: { venue: true },
        })

        if (!staff) return null

        const isValid = await bcrypt.compare(credentials.password, staff.pin)
        if (!isValid) return null

        return {
          id: staff.id,
          name: `${staff.firstName} ${staff.lastName}`,
          email: credentials.email,
          role: staff.role,
          venueId: staff.venueId,
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
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string
        session.user.role = token.role as string
        session.user.venueId = token.venueId as string
      }
      return session
    },
  },
}
