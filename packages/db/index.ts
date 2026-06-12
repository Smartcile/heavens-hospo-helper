import { PrismaClient } from '@prisma/client'

declare global {
  var __prisma: PrismaClient | undefined
}

export const prisma =
  global.__prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma
}

export * from '@prisma/client'
