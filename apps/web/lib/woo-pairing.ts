import { randomBytes } from 'node:crypto'

// Pure helpers for the WordPress plugin's CONNECT flow. The plugin mints the
// WooCommerce REST API credentials locally (the WC REST API cannot create its
// own keys) and pushes them here; the app answers with a fresh webhook secret
// and the delivery URL the plugin must write into its webhooks.

export interface PairingPayload {
  storeUrl: string
  consumerKey: string
  consumerSecret: string
  pluginVersion: string | null
}

export type PairingParseResult =
  | { ok: true; payload: PairingPayload }
  | { ok: false; error: string }

/** Trailing slashes stripped, http(s) only — null when unusable. */
export function normaliseStoreUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim().replace(/\/+$/, '')
  if (!trimmed) return null
  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return trimmed
  } catch {
    return null
  }
}

export function parsePairingPayload(body: unknown): PairingParseResult {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid request body' }
  const raw = body as Record<string, unknown>

  const storeUrl = normaliseStoreUrl(raw.storeUrl)
  if (!storeUrl) return { ok: false, error: 'storeUrl must be a valid http(s) URL' }

  const consumerKey = typeof raw.consumerKey === 'string' ? raw.consumerKey.trim() : ''
  const consumerSecret = typeof raw.consumerSecret === 'string' ? raw.consumerSecret.trim() : ''
  if (!consumerKey || !consumerSecret) {
    return { ok: false, error: 'consumerKey and consumerSecret are required' }
  }

  const version = typeof raw.pluginVersion === 'string' ? raw.pluginVersion.trim() : ''
  return {
    ok: true,
    payload: { storeUrl, consumerKey, consumerSecret, pluginVersion: version || null },
  }
}

export function webhookDeliveryUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/api/webhooks/woocommerce`
}

export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(32).toString('hex')}`
}
