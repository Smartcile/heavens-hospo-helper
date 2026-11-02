import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

declare global {
  var __prisma: PrismaClient | undefined
}

if (!process.env.DATABASE_URL) {
  require('dotenv').config()
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })

export const prisma =
  global.__prisma ??
  new PrismaClient({
    adapter,
    // Query logging is opt-in (PRISMA_QUERY_LOG=1) — in dev it floods the logs
    // with full SQL on every request and slows the dev server noticeably.
    log: process.env.PRISMA_QUERY_LOG === '1' ? ['query', 'error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma
}

export * from '@prisma/client'
