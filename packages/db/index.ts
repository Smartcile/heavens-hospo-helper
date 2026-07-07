import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

declare global {
  var __prisma: PrismaClient | undefined
}

if (!process.env.DATABASE_URL) {
  require('dotenv').config()
}

if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL environment variable is required.\n' +
    'When running in Docker ensure DB_USER and DB_PASSWORD are set in your Portainer stack env vars.\n' +
    'For local dev create packages/db/.env with DATABASE_URL=postgresql://...'
  )
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
})

const adapter = new PrismaPg(pool)

export const prisma =
  global.__prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma
}

export * from '@prisma/client'
