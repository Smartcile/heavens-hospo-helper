import { createHash, randomBytes } from 'node:crypto'
import { NextRequest } from 'next/server'
import { prisma } from '@hospo-ops/db'

/** Only the hash of a key is stored — the raw key is shown once at creation. */
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

export function generateApiKey(): string {
  return `ho_${randomBytes(24).toString('hex')}`
}

export interface PublicVenue {
  id: string
  name: string
  timezone: string
}

/**
 * Resolves the venue from an API key in the Authorization header
 * (`Bearer <key>`) or `x-hospo-api-key`. Returns null when the key is
 * missing, unknown, revoked, or soft-deleted.
 */
export async function venueFromApiKey(req: NextRequest): Promise<PublicVenue | null> {
  const header = req.headers.get('authorization')
  const key = header?.startsWith('Bearer ') ? header.slice(7).trim() : req.headers.get('x-hospo-api-key')
  if (!key) return null

  const apiKey = await prisma.apiKey.findFirst({
    where: { keyHash: hashApiKey(key), isActive: true, deletedAt: null },
    include: { venue: { select: { id: true, name: true, timezone: true } } },
  })
  if (!apiKey) return null

  prisma.apiKey
    .update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {})
  return apiKey.venue
}
