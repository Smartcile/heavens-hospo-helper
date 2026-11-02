import { NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { prisma } from '@hospo-ops/db'
import { upsertProductFromWoo, isWebhookPing } from '@/lib/woo-sync'
import { processWooOrder } from '@/lib/woo-orders-sync'
import { isSelfEcho } from '@/lib/woo-push'
import { logSync } from '@/lib/sync-log'

// ═══════════════════════════════════════════
// WooCommerce Webhook Handler
// Receives order.created / order.updated and
// product.created / product.updated / product.deleted events
// Endpoint: POST /api/webhooks/woocommerce
// Auth: HMAC-SHA256 signature verification
// ═══════════════════════════════════════════

export async function POST(req: NextRequest) {
  // ── 1. Capture raw body and signature ──
  const rawBody = await req.text()
  const signature = req.headers.get('x-wc-webhook-signature')
  const topic = req.headers.get('x-wc-webhook-topic') ?? 'unknown'
  const entity = topic.startsWith('product') ? 'PRODUCT' : 'ORDER'

  // ── 1a. Acknowledge WooCommerce's unsigned activation ping ──
  // Sent when a webhook is saved/activated in wp-admin; must get a 2xx or
  // WooCommerce marks the webhook as failed and disables it.
  if (isWebhookPing(rawBody)) {
    await logSync({
      direction: 'WEBHOOK',
      entity,
      status: 'SUCCESS',
      message: `WEBHOOK ACTIVATION PING ACKNOWLEDGED (${rawBody.trim().toUpperCase()})`,
    })
    return NextResponse.json({ message: 'Webhook ping acknowledged' }, { status: 200 })
  }

  if (!signature) {
    await logSync({
      direction: 'WEBHOOK',
      entity,
      status: 'ERROR',
      message: `WEBHOOK REJECTED (${topic.toUpperCase()}) — MISSING SIGNATURE HEADER`,
    })
    return NextResponse.json({ error: 'Missing signature header' }, { status: 401 })
  }

  // ── 2. Resolve venue by trying all active WooIntegration webhook secrets ──
  const integrations = await prisma.wooIntegration.findMany({
    where: { isActive: true, deletedAt: null, webhookSecret: { not: null }, venue: { isDemo: false } },
    include: { venue: true },
  })

  let matched: (typeof integrations)[0] | null = null
  for (const integration of integrations) {
    const computed = createHmac('sha256', integration.webhookSecret!)
      .update(rawBody, 'utf-8')
      .digest('base64')
    if (computed === signature) {
      matched = integration
      break
    }
  }

  if (!matched) {
    await logSync({
      direction: 'WEBHOOK',
      entity,
      status: 'ERROR',
      message: `WEBHOOK REJECTED (${topic.toUpperCase()}) — SIGNATURE DID NOT MATCH ANY VENUE`,
    })
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const venueId = matched.venueId

  // ── 3. Parse payload ──
  let body: any
  try {
    body = JSON.parse(rawBody)
  } catch {
    await logSync({
      venueId,
      direction: 'WEBHOOK',
      entity,
      status: 'ERROR',
      message: `WEBHOOK REJECTED (${topic.toUpperCase()}) — INVALID JSON PAYLOAD`,
    })
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // ── 4. Infinite-loop guard: skip echoes of our own recent pushes ──
  const metaData: any[] = body.meta_data ?? []
  if (isSelfEcho(metaData)) {
    await logSync({
      venueId,
      direction: 'WEBHOOK',
      entity,
      status: 'SKIPPED',
      externalId: String(body.id ?? ''),
      message: `WEBHOOK SKIPPED (${topic.toUpperCase()}) — ECHO OF OUR OWN PUSH`,
    })
    return NextResponse.json({ message: 'Skipped (self-triggered)' }, { status: 200 })
  }

  // ── 5. Product topics: upsert / soft-delete the MenuItem ──
  if (entity === 'PRODUCT') {
    return handleProductWebhook(venueId, matched.id, topic, body)
  }

  // ── 6. Process order via shared logic ──
  const result = await processWooOrder(venueId, matched.id, body, matched.metaFieldMap)

  const wooStatus = body.status ?? 'pending'

  await logSync({
    venueId,
    direction: 'WEBHOOK',
    entity: 'ORDER',
    status: 'SUCCESS',
    externalId: result.wooOrderId,
    message: `ORDER #${result.wooOrderId} SYNCED (${topic.toUpperCase()}) — ${result.lineItems} LINE ITEMS, STATUS ${wooStatus.toUpperCase()}`,
    detail: { topic, status: wooStatus, lineItems: result.lineItems },
  })

  return NextResponse.json({ success: true, orderId: result.orderId, topic })
}

// Handle product.created / product.updated / product.deleted webhooks.
async function handleProductWebhook(venueId: string, integrationId: string, topic: string, body: any) {
  const wooProductId = String(body.id ?? '')
  if (!wooProductId) {
    await logSync({
      venueId,
      direction: 'WEBHOOK',
      entity: 'PRODUCT',
      status: 'ERROR',
      message: `PRODUCT WEBHOOK (${topic.toUpperCase()}) — PAYLOAD HAS NO PRODUCT ID`,
    })
    return NextResponse.json({ error: 'Missing product id' }, { status: 400 })
  }

  try {
    if (topic === 'product.deleted') {
      const existing = await prisma.menuItem.findFirst({
        where: { wooProductId, venueId, deletedAt: null },
      })
      if (existing) {
        await prisma.menuItem.update({
          where: { id: existing.id },
          data: { deletedAt: new Date(), isActive: false },
        })
      }
      await logSync({
        venueId,
        direction: 'WEBHOOK',
        entity: 'PRODUCT',
        status: existing ? 'SUCCESS' : 'SKIPPED',
        externalId: wooProductId,
        message: existing
          ? `PRODUCT #${wooProductId} DELETED IN WOOCOMMERCE — MENU ITEM ${existing.name} SOFT-DELETED`
          : `PRODUCT #${wooProductId} DELETED IN WOOCOMMERCE — NO LOCAL MENU ITEM TO REMOVE`,
      })
      return NextResponse.json({ success: true, topic })
    }

    const outcome = await upsertProductFromWoo(venueId, body)
    await prisma.wooIntegration.update({
      where: { id: integrationId },
      data: { lastSyncAt: new Date() },
    })
    await logSync({
      venueId,
      direction: 'WEBHOOK',
      entity: 'PRODUCT',
      status: 'SUCCESS',
      externalId: wooProductId,
      message: `PRODUCT #${wooProductId} ${body.name ? String(body.name).toUpperCase() : ''} ${outcome.toUpperCase()} FROM WEBHOOK (${topic.toUpperCase()})`.replace(/\s+/g, ' '),
      detail: { topic, outcome },
    })
    return NextResponse.json({ success: true, topic, outcome })
  } catch (e) {
    console.error('Product webhook failed:', e)
    await logSync({
      venueId,
      direction: 'WEBHOOK',
      entity: 'PRODUCT',
      status: 'ERROR',
      externalId: wooProductId,
      message: `PRODUCT WEBHOOK FAILED (${topic.toUpperCase()}) FOR #${wooProductId}`,
      detail: { error: String(e) },
    })
    return NextResponse.json({ error: 'Product sync failed' }, { status: 500 })
  }
}
