// Server-only data access for venue-authored BEO block definitions. Kept out of
// `lib/beo-blocks.ts` so the pure library (and the client bundle) never pulls in
// Prisma — the same split as `events.server.ts` / `beo-blocks.ts`.

import { prisma } from '@hospo-ops/db'
import {
  BUILT_IN_BLOCK_TYPES,
  CUSTOM_BLOCK_GROUP,
  defRowToBlockDef,
  mergeLibrary,
  sanitiseFields,
  type BlockLibrary,
} from '@/lib/beo-blocks'
import { decorateLibrary } from '@/lib/beo-links'
import { loadBlockLinks } from '@/lib/beo-links.server'

/** The key format a custom block must use: uppercase, digits and underscores. */
export const CUSTOM_KEY_PATTERN = /^[A-Z0-9_]{2,40}$/

/** All live custom defs for a venue, in display order. */
export async function loadCustomDefRows(venueId: string) {
  return prisma.beoBlockDef.findMany({
    where: { venueId, deletedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
  })
}

/**
 * The resolved block library for a venue: the built-ins plus its live custom
 * defs. Every builder, PDF and share view loads its library through this.
 */
export async function loadBlockLibrary(venueId: string): Promise<BlockLibrary> {
  const [rows, links] = await Promise.all([loadCustomDefRows(venueId), loadBlockLinks(venueId)])
  return decorateLibrary(mergeLibrary(rows.map((r) => defRowToBlockDef(r))), links)
}

function str(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined
  const s = String(v).trim()
  return s === '' ? undefined : s
}

/**
 * Map a request body onto writable `BeoBlockDef` columns. `requireKey` is set on
 * create; on update the key is immutable and ignored. Returns an `error` for a
 * bad key/label/collision. The data is a loose record so a route can cast it to
 * the Prisma input — the same shape `buildEventData` returns.
 */
export function buildCustomDefData(
  body: Record<string, unknown>,
  opts: { requireKey: boolean },
): { data: Record<string, unknown>; error?: string } {
  const data: Record<string, unknown> = {}

  if (body.key !== undefined || opts.requireKey) {
    const key = str(body.key)?.toUpperCase()
    if (!key) return { data, error: 'Key is required' }
    if (!CUSTOM_KEY_PATTERN.test(key)) {
      return { data, error: 'Key must be 2–40 uppercase letters, digits or underscores' }
    }
    if (BUILT_IN_BLOCK_TYPES.includes(key)) {
      return { data, error: `${key} is a built-in block key` }
    }
    data.key = key
  }

  if (body.label !== undefined || opts.requireKey) {
    const label = str(body.label)
    if (!label) return { data, error: 'Label is required' }
    data.label = label.toUpperCase()
  }

  if (body.group !== undefined) data.group = str(body.group)?.toUpperCase() ?? CUSTOM_BLOCK_GROUP
  if (body.description !== undefined) data.description = str(body.description) ?? null
  if (body.defaultConfig !== undefined) {
    if (body.defaultConfig === null || typeof body.defaultConfig !== 'object' || Array.isArray(body.defaultConfig)) {
      return { data, error: 'defaultConfig must be an object' }
    }
    data.defaultConfig = body.defaultConfig as Record<string, unknown>
  }
  if (body.fields !== undefined) data.fields = sanitiseFields(body.fields)
  if (body.sortOrder !== undefined) data.sortOrder = Math.round(Number(body.sortOrder) || 0)
  if (body.isActive !== undefined) data.isActive = !!body.isActive

  return { data }
}
