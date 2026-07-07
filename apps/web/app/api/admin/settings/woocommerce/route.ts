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

  const existing = await prisma.wooIntegration.findFirst({
    where: { venueId: session.user.venueId, deletedAt: null },
  })

  if (!existing) {
    return NextResponse.json({ wcStoreUrl: '', wcConsumerKey: '', wcConsumerSecret: '', wcWebhookSecret: '', wcActive: false, lastSyncAt: null })
  }

  return NextResponse.json({
    id: existing.id,
    wcStoreUrl: existing.storeUrl,
    wcConsumerKey: maskSecret(existing.consumerKey),
    wcConsumerSecret: maskSecret(existing.consumerSecret),
    wcWebhookSecret: maskSecret(existing.webhookSecret),
    wcActive: existing.isActive,
    lastSyncAt: existing.lastSyncAt,
  })
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
