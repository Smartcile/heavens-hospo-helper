// Dependency-free Markdown subset → sanitised HTML, plus a guide-shaped split
// (H1 → title, H2 → steps). Used by the shared importer's GUIDE adapter so a
// manager can paste an existing document instead of JSON.
//
// Everything is passed through `sanitiseRichText` before it is returned, so the
// output is safe to store in `Guide.bodyHtml` / `GuideStep.content` and is
// re-sanitised on read by the existing reader.

import { sanitiseRichText } from '@/lib/rich-text'

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function inline(text: string): string {
  let out = escapeHtml(text)
  // Links before emphasis so the URL text is not mangled.
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/gi, '<a href="$2">$1</a>')
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
  return out
}

/** Strip the markers we emit so a heading can be used as a plain title. */
export function markdownPlainText(text: string): string {
  return text
    .replace(/^#{1,6}\s+/, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Convert the supported Markdown subset to sanitised HTML. */
export function markdownToHtml(markdown: string): string {
  const lines = String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n')
  const out: string[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) { i++; continue }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line)
    if (heading) {
      const level = heading[1].length
      out.push(`<h${level}>${inline(heading[2].trim())}</h${level}>`)
      i++
      continue
    }

    // Unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^\s*[-*]\s+/, '').trim())}</li>`)
        i++
      }
      out.push(`<ul>${items.join('')}</ul>`)
      continue
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(`<li>${inline(lines[i].replace(/^\s*\d+\.\s+/, '').trim())}</li>`)
        i++
      }
      out.push(`<ol>${items.join('')}</ol>`)
      continue
    }

    // Paragraph: consecutive plain lines, joined with a line break.
    const paragraph: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,3})\s+/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i])
    ) {
      paragraph.push(inline(lines[i].trim()))
      i++
    }
    out.push(`<p>${paragraph.join('<br>')}</p>`)
  }

  return sanitiseRichText(out.join('\n'))
}

export interface MarkdownGuideStep {
  heading: string | null
  contentHtml: string
}

export interface MarkdownGuide {
  title: string
  bodyHtml: string
  steps: MarkdownGuideStep[]
}

/**
 * Split a guide document: the first H1 is the title, each H2 starts a step.
 * Text after the H1 and before the first H2 becomes the intro body. If there is
 * no H1, the first non-heading line becomes the title (forgiving paste).
 */
export function splitGuideMarkdown(markdown: string): MarkdownGuide {
  const lines = String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n')

  let title = ''
  let titleIndex = -1
  for (let i = 0; i < lines.length; i++) {
    const m = /^#\s+(.*)$/.exec(lines[i])
    if (m) { title = markdownPlainText(m[1]); titleIndex = i; break }
  }

  let bodyStart = titleIndex >= 0 ? titleIndex + 1 : 0
  if (!title) {
    const first = lines.findIndex((line) => line.trim() && !/^#{1,6}\s+/.test(line))
    if (first >= 0) {
      title = markdownPlainText(lines[first])
      bodyStart = first + 1
    }
  }

  const intro: string[] = []
  const steps: { heading: string; lines: string[] }[] = []
  let current: { heading: string; lines: string[] } | null = null

  for (let i = bodyStart; i < lines.length; i++) {
    const line = lines[i]
    const h2 = /^##\s+(.*)$/.exec(line)
    if (h2) {
      if (current) steps.push(current)
      current = { heading: markdownPlainText(h2[1]), lines: [] }
      continue
    }
    if (current) current.lines.push(line)
    else intro.push(line)
  }
  if (current) steps.push(current)

  return {
    title,
    bodyHtml: markdownToHtml(intro.join('\n')),
    steps: steps
      .map((step) => ({ heading: step.heading || null, contentHtml: markdownToHtml(step.lines.join('\n')) }))
      .filter((step) => step.heading || step.contentHtml),
  }
}
