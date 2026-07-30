import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'
import { DEFAULT_META_MAP, META_MAP_FIELDS, resolveMetaMap } from '@/lib/woo-meta-map'

function maskSecret(secret: string | null): string | null {
  if (!secret || secret.length <= 4) return secret
  return '•'.repeat(secret.length - 4) + secret.slice(-4)
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Resolve effective venue: ADMIN can pass venueId via query param
  const wcVenueParam = new URL(req.url).searchParams.get('venueId')
  const effectiveVenueId = session.user.role === 'ADMIN' && wcVenueParam
    ? wcVenueParam
    : session.user.venueId

  let wcVenueId = effectiveVenueId
  const venue = await prisma.venue.findUnique({
    where: { id: effectiveVenueId, deletedAt: null },
    select: { sharedWooVenueId: true },
  })
  const sharedSourceId = venue?.sharedWooVenueId ?? null
  if (sharedSourceId) wcVenueId = sharedSourceId

  const existing = await prisma.wooIntegration.findFirst({
    where: { venueId: wcVenueId, deletedAt: null },
  })

  if (!existing) {
    return NextResponse.json({
      wcStoreUrl: '', wcConsumerKey: '', wcConsumerSecret: '', wcWebhookSecret: '',
      wcActive: false, lastSyncAt: null, sharedWooVenueId: sharedSourceId, readOnly: !!sharedSourceId,
      metaFieldMap: DEFAULT_META_MAP, metaFieldDefaults: DEFAULT_META_MAP,
    })
  }

  return NextResponse.json({
    id: existing.id,
    wcStoreUrl: existing.storeUrl,
    wcConsumerKey: maskSecret(existing.consumerKey),
    wcConsumerSecret: maskSecret(existing.consumerSecret),
    wcWebhookSecret: maskSecret(existing.webhookSecret),
    wcActive: existing.isActive,
    lastSyncAt: existing.lastSyncAt,
    sharedWooVenueId: sharedSourceId,
    readOnly: !!sharedSourceId,
    // Effective map (stored merged over defaults) plus the defaults themselves,
    // so the UI can show what a blank field will fall back to.
    metaFieldMap: resolveMetaMap(existing.metaFieldMap),
    metaFieldDefaults: DEFAULT_META_MAP,
  })
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { wcStoreUrl, wcConsumerKey, wcConsumerSecret, wcWebhookSecret, wcActive, venueId, metaFieldMap } = await req.json()

  // ADMIN can specify which venue's WooCommerce to configure
  const effectiveVenueId = session.user.role === 'ADMIN' && venueId
    ? venueId
    : session.user.venueId

  // Venues using a shared Woo source cannot configure their own WooCommerce
  const venue = await prisma.venue.findUnique({
    where: { id: effectiveVenueId, deletedAt: null },
    select: { isDemo: true, sharedWooVenueId: true },
  })
  if (venue?.isDemo) {
    return NextResponse.json({ error: 'WooCommerce is not available for demo venues' }, { status: 400 })
  }
  if (venue?.sharedWooVenueId) {
    return NextResponse.json({ error: 'WooCommerce is managed by the shared source venue' }, { status: 400 })
  }

  const data: Record<string, unknown> = {}
  if (wcStoreUrl !== undefined) data.storeUrl = String(wcStoreUrl).trim()
  if (wcConsumerKey !== undefined) {
    const val = String(wcConsumerKey).trim()
    if (val && val !== '•'.repeat(val.length)) data.consumerKey = val
  }
  if (wcConsumerSecret !== undefined) {
    const val = String(wcConsumerSecret).trim()
    if (val && val !== '•'.repeat(val.length)) data.consumerSecret = val
  }
  if (wcWebhookSecret !== undefined) {
    const val = String(wcWebhookSecret).trim()
    if (val && val !== '•'.repeat(val.length)) data.webhookSecret = val
  }
  if (wcActive !== undefined) data.isActive = wcActive

  // Accept only known fields, each a clean list of non-empty string keys.
  if (metaFieldMap !== undefined && metaFieldMap !== null) {
    const clean: Record<string, string[]> = {}
    for (const field of META_MAP_FIELDS) {
      const raw = (metaFieldMap as Record<string, unknown>)[field]
      const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : []
      clean[field] = list
        .filter((k): k is string => typeof k === 'string')
        .map((k) => k.trim())
        .filter((k) => k !== '')
    }
    data.metaFieldMap = clean
  }

  const integration = await prisma.wooIntegration.upsert({
    where: { venueId: effectiveVenueId },
    update: data,
    create: {
      venueId: effectiveVenueId,
      storeUrl: data.storeUrl?.toString() ?? '',
      consumerKey: data.consumerKey?.toString() ?? '',
      consumerSecret: data.consumerSecret?.toString() ?? '',
      webhookSecret: data.webhookSecret?.toString() ?? null,
      isActive: wcActive ?? true,
    },
  })

  return NextResponse.json({
    id: integration.id,
    wcStoreUrl: integration.storeUrl,
    wcConsumerKey: maskSecret(integration.consumerKey),
    wcConsumerSecret: maskSecret(integration.consumerSecret),
    wcWebhookSecret: maskSecret(integration.webhookSecret),
    wcActive: integration.isActive,
    lastSyncAt: integration.lastSyncAt,
    metaFieldMap: resolveMetaMap(integration.metaFieldMap),
    metaFieldDefaults: DEFAULT_META_MAP,
  })
}
