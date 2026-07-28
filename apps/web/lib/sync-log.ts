import { prisma } from '@hospo-ops/db'
import type { SyncDirection, SyncEntity, SyncStatus } from '@prisma/client'

// ── Sync activity log ─────────────────────────────────────────────────
// Every WooCommerce pull / push / webhook event writes a SyncLog row so
// the /admin/sync dashboard can show what synced, what didn't, and why.
// Logging is best-effort: a log failure must never break the sync itself.
// ──────────────────────────────────────────────────────────────────────

export interface SyncLogEntry {
  venueId?: string | null
  direction: SyncDirection
  entity: SyncEntity
  status: SyncStatus
  externalId?: string | null
  message: string
  detail?: unknown
}

export async function logSync(entry: SyncLogEntry): Promise<void> {
  try {
    await prisma.syncLog.create({
      data: {
        venueId: entry.venueId ?? null,
        direction: entry.direction,
        entity: entry.entity,
        status: entry.status,
        externalId: entry.externalId ?? null,
        message: entry.message.slice(0, 500),
        detail: entry.detail === undefined ? undefined : JSON.parse(JSON.stringify(entry.detail)),
      },
    })
  } catch (e) {
    console.error('SyncLog write failed (non-blocking):', e)
  }
}
