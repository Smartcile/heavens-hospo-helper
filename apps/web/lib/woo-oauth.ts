import { createHmac, randomBytes } from 'crypto'

// ── WooCommerce OAuth 1.0a (one-legged) ───────────────────────────────
// When WordPress sits behind a proxy/tunnel (e.g. Cloudflare) it often
// fails to detect HTTPS (is_ssl() === false). WooCommerce then rejects
// Basic and query-string credentials ("woocommerce_rest_cannot_view")
// and requires OAuth 1.0a signed requests instead. This implements the
// one-legged flow from the WooCommerce REST API docs.
// ──────────────────────────────────────────────────────────────────────

// RFC 3986 percent-encoding (encodeURIComponent misses !'()* )
export function rfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
  )
}

// Build a fully signed URL for a WooCommerce REST request.
// nonce/timestamp are injectable for deterministic tests.
export function oauthSignedUrl(
  method: string,
  url: string,
  consumerKey: string,
  consumerSecret: string,
  nonce: string = randomBytes(16).toString('hex'),
  timestamp: number = Math.floor(Date.now() / 1000),
): string {
  const parsed = new URL(url)

  const params: Record<string, string> = {}
  parsed.searchParams.forEach((value, key) => {
    params[key] = value
  })
  params.oauth_consumer_key = consumerKey
  params.oauth_nonce = nonce
  params.oauth_signature_method = 'HMAC-SHA256'
  params.oauth_timestamp = String(timestamp)

  const baseUrl = `${parsed.protocol}//${parsed.host}${parsed.pathname}`
  const paramString = Object.keys(params)
    .sort()
    .map((key) => `${rfc3986(key)}=${rfc3986(params[key])}`)
    .join('&')

  const baseString = [method.toUpperCase(), rfc3986(baseUrl), rfc3986(paramString)].join('&')
  const signature = createHmac('sha256', `${rfc3986(consumerSecret)}&`)
    .update(baseString)
    .digest('base64')

  const query = Object.keys(params)
    .map((key) => `${rfc3986(key)}=${rfc3986(params[key])}`)
    .join('&')

  return `${baseUrl}?${query}&oauth_signature=${rfc3986(signature)}`
}
