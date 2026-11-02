import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@hospo-ops/db'
import { venueFromApiKey } from '@/lib/public-api'
import {
  generateWebhookSecret,
  parsePairingPayload,
  webhookDeliveryUrl,
} from '@/lib/woo-pairing'

// ═══════════════════════════════════════════
// WooCommerce pairing — called by the WordPress plugin
// POST   /api/public/woocommerce/connect  → store credentials, return webhook secret
// DELETE /api/public/woocommerce/connect  → disconnect (clear credentials)
// Auth: Bearer API key (the key IS the venue pairing)
// ═══════════════════════════════════════════

async function resolvePairingVenue(req: NextRequest) {
  const venue = await venueFromApiKey(req)
  if (!venue) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const full = await prisma.venue.findUnique({
    where: { id: venue.id },
    select: { id: true, name: true, isDemo: true, sharedWooVenueId: true },
  })
  if (!full) return { error: NextResponse.json({ error: 'Venue not found' }, { status: 404 }) }
  if (full.isDemo) {
    return {
      error: NextResponse.json(
        { error: 'WooCommerce is not available for demo venues' },
        { status: 400 },
      ),
    }
  }
  if (full.sharedWooVenueId) {
    return {
      error: NextResponse.json(
        { error: 'WooCommerce is managed by the shared source venue' },
        { status: 400 },
      ),
    }
  }
  return { venue: full }
}

function appBaseUrl(req: NextRequest): string {
  return process.env.APP_URL || process.env.NEXTAUTH_URL || req.nextUrl.origin
}

export async function POST(req: NextRequest) {
  const resolved = await resolvePairingVenue(req)
  if ('error' in resolved) return resolved.error
  const { venue } = resolved

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = parsePairingPayload(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  // A fresh secret on every connect — re-pairing rotates the webhooks.
  const webhookSecret = generateWebhookSecret()
  const now = new Date()

  await prisma.wooIntegration.upsert({
    where: { venueId: venue.id },
    update: {
      storeUrl: parsed.payload.storeUrl,
      consumerKey: parsed.payload.consumerKey,
      consumerSecret: parsed.payload.consumerSecret,
      webhookSecret,
      isActive: true,
      managedByPlugin: true,
      pairedAt: now,
      deletedAt: null,
    },
    create: {
      venueId: venue.id,
      storeUrl: parsed.payload.storeUrl,
      consumerKey: parsed.payload.consumerKey,
      consumerSecret: parsed.payload.consumerSecret,
      webhookSecret,
      isActive: true,
      managedByPlugin: true,
      pairedAt: now,
    },
  })

  return NextResponse.json({
    venue: { id: venue.id, name: venue.name },
    storeUrl: parsed.payload.storeUrl,
    webhookUrl: webhookDeliveryUrl(appBaseUrl(req)),
    webhookSecret,
    pairedAt: now.toISOString(),
    pluginVersion: parsed.payload.pluginVersion,
  })
}

export async function DELETE(req: NextRequest) {
  const resolved = await resolvePairingVenue(req)
  if ('error' in resolved) return resolved.error
  const { venue } = resolved

  const existing = await prisma.wooIntegration.findFirst({
    where: { venueId: venue.id, deletedAt: null },
  })
  if (!existing || !existing.managedByPlugin) {
    return NextResponse.json({ ok: true, cleared: false })
  }

  // A stale plugin instance (paired before a later re-pair) must not wipe the
  // live credentials — it has to prove it holds the current consumer key.
  let consumerKey = ''
  try {
    const body = await req.json()
    if (body && typeof body.consumerKey === 'string') consumerKey = body.consumerKey.trim()
  } catch {
    // No body — allowed, treated as "no proof required".
  }
  if (consumerKey && consumerKey !== existing.consumerKey) {
    return NextResponse.json({ ok: true, cleared: false })
  }

  await prisma.wooIntegration.update({
    where: { id: existing.id },
    data: {
      consumerKey: '',
      consumerSecret: '',
      webhookSecret: null,
      isActive: false,
      managedByPlugin: false,
      pairedAt: null,
    },
  })

  return NextResponse.json({ ok: true, cleared: true })
}
