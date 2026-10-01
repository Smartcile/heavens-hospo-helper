// Minimal, dependency-free rich-text helpers for guide "document" bodies.
//
// The editor produces simple HTML (headings, paragraphs, lists, inline marks).
// This module is the single authority on what survives: it runs on write (server
// sanitisation) and again on render (defence in depth). Prisma-free and safe to
// import from client components.

const ALLOWED_TAGS = new Set([
  'p', 'h1', 'h2', 'h3', 'blockquote',
  'strong', 'em', 'u', 's',
  'ul', 'ol', 'li', 'br', 'a',
])

// Non-semantic tags the browser emits are folded onto the allowed set.
const NORMALISE_TAG: Record<string, string> = {
  div: 'p',
  b: 'strong',
  i: 'em',
  strike: 's',
  del: 's',
  h4: 'h3',
  h5: 'h3',
  h6: 'h3',
}

const VOID_TAGS = new Set(['br'])

// Tags whose entire contents (not just the tag) are removed.
const DROP_WITH_CONTENT = [
  'script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'noscript', 'template',
]

function escapeText(text: string): string {
  return text.replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Only absolute http(s)/mailto/tel links and site-relative paths survive. */
function safeHref(raw: string): string | null {
  const href = raw.trim()
  if (!href) return null
  if (!/^(https?:\/\/|mailto:|tel:|\/)/i.test(href)) return null
  return href.replace(/"/g, '&quot;')
}

/** Strip everything except a small allowlist of formatting tags/attributes. */
export function sanitiseRichText(html: string | null | undefined): string {
  if (!html) return ''
  let input = String(html)
  // Comments and dangerous blocks go entirely (tag and contents).
  input = input.replace(/<!--[\s\S]*?-->/g, '')
  for (const tag of DROP_WITH_CONTENT) {
    input = input.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi'), '')
    input = input.replace(new RegExp(`<${tag}\\b[^>]*\\/?>`, 'gi'), '')
  }

  const out: string[] = []
  const stack: string[] = []
  const tokenRe = /<[^>]*>|[^<]+|</g
  let m: RegExpExecArray | null

  const closeTo = (name: string) => {
    const idx = stack.lastIndexOf(name)
    if (idx === -1) return
    for (let i = stack.length - 1; i >= idx; i--) out.push(`</${stack[i]}>`)
    stack.length = idx
  }

  while ((m = tokenRe.exec(input)) !== null) {
    const token = m[0]
    if (!token.startsWith('<')) {
      out.push(escapeText(token))
      continue
    }

    const closing = /^<\s*\//.test(token)
    const nameMatch = token.match(/^<\s*\/?\s*([a-zA-Z][a-zA-Z0-9]*)/)
    if (!nameMatch) {
      out.push(escapeText(token))
      continue
    }
    const name = NORMALISE_TAG[nameMatch[1].toLowerCase()] ?? nameMatch[1].toLowerCase()

    if (closing) {
      if (ALLOWED_TAGS.has(name)) closeTo(name)
      continue
    }

    if (!ALLOWED_TAGS.has(name)) continue // drop the tag, keep any inner text

    if (VOID_TAGS.has(name)) {
      out.push(`<${name}>`)
      continue
    }

    if (name === 'a') {
      const hrefMatch = token.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i)
      const href = safeHref(hrefMatch?.[1] ?? hrefMatch?.[2] ?? hrefMatch?.[3] ?? '')
      out.push(href ? `<a href="${href}" rel="noopener noreferrer" target="_blank">` : '<a>')
    } else {
      out.push(`<${name}>`)
    }
    stack.push(name)
  }

  for (let i = stack.length - 1; i >= 0; i--) out.push(`</${stack[i]}>`)
  return out.join('')
}

const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
}

function decodeEntities(text: string): string {
  return text.replace(/&(nbsp|amp|lt|gt|quot|#39|apos);/g, (full) => ENTITIES[full] ?? full)
}

/** Plain text for PDFs, excerpts and emptiness checks. */
export function richTextToPlainText(html: string | null | undefined): string {
  if (!html) return ''
  let s = String(html)
  s = s.replace(/<!--[\s\S]*?-->/g, '')
  for (const tag of DROP_WITH_CONTENT) {
    s = s.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi'), '')
  }
  s = s.replace(/<\/(p|h1|h2|h3|li|blockquote|div)>/gi, '\n')
  s = s.replace(/<br\s*\/?>/gi, '\n')
  s = s.replace(/<[^>]+>/g, '')
  s = decodeEntities(s)
  return s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

export function isRichTextEmpty(html: string | null | undefined): boolean {
  return richTextToPlainText(html).length === 0
}
