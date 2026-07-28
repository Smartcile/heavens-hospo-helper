import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@hospo-ops/db'

function maskSecret(secret: string | null): string | null {
  if (!secret || secret.length <= 4) return secret
  return '•'.repeat(secret.length - 4) + secret.slice(-4)
}

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Resolve shared Woo source venue
  let wcVenueId = session.user.venueId
  const venue = await prisma.venue.findUnique({
    where: { id: session.user.venueId, deletedAt: null },
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
  })
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Venues using a shared Woo source cannot configure their own WooCommerce
  const venue = await prisma.venue.findUnique({
    where: { id: session.user.venueId, deletedAt: null },
    select: { isDemo: true, sharedWooVenueId: true },
  })
  if (venue?.isDemo) {
    return NextResponse.json({ error: 'WooCommerce is not available for demo venues' }, { status: 400 })
  }
  if (venue?.sharedWooVenueId) {
    return NextResponse.json({ error: 'WooCommerce is managed by the shared source venue' }, { status: 400 })
  }

  const { wcStoreUrl, wcConsumerKey, wcConsumerSecret, wcWebhookSecret, wcActive } = await req.json()

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

  const integration = await prisma.wooIntegration.upsert({
    where: { venueId: session.user.venueId },
    update: data,
    create: {
      venueId: session.user.venueId,
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
  })
}
