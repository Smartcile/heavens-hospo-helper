import { describe, it, expect } from 'vitest'
import { markdownToHtml, markdownPlainText, splitGuideMarkdown } from './markdown'

describe('markdownToHtml', () => {
  it('renders headings, paragraphs and line breaks', () => {
    const html = markdownToHtml('# TITLE\n\nFirst line\nSecond line\n\n## STEP')
    expect(html).toContain('<h1>TITLE</h1>')
    expect(html).toContain('<p>First line<br>Second line</p>')
    expect(html).toContain('<h2>STEP</h2>')
  })

  it('renders unordered and ordered lists', () => {
    const html = markdownToHtml('- one\n- two\n\n1. first\n2. second')
    expect(html).toContain('<ul><li>one</li><li>two</li></ul>')
    expect(html).toContain('<ol><li>first</li><li>second</li></ol>')
  })

  it('renders bold, italic and safe links', () => {
    const html = markdownToHtml('**bold** and *italic* and [site](https://example.com)')
    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('<em>italic</em>')
    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('>site</a>')
  })

  it('escapes raw HTML and drops dangerous tags', () => {
    const html = markdownToHtml('Hello <script>alert(1)</script> <b>world</b>')
    expect(html).not.toContain('<script')
    expect(html).not.toContain('<b>')
    expect(html).toContain('&lt;b&gt;')
  })

  it('returns empty string for empty input', () => {
    expect(markdownToHtml('')).toBe('')
  })
})

describe('markdownPlainText', () => {
  it('strips heading markers, links and emphasis', () => {
    expect(markdownPlainText('## **BOLD** [link](https://x.test)')).toBe('BOLD link')
  })
})

describe('splitGuideMarkdown', () => {
  it('maps H1 to the title and H2 to steps', () => {
    const guide = splitGuideMarkdown(
      '# MAKING COFFEE\n\nHow we do it.\n\n## GRIND\n\n- Set the grinder\n\n## BREW\n\nPour slowly.',
    )
    expect(guide.title).toBe('MAKING COFFEE')
    expect(guide.bodyHtml).toBe('<p>How we do it.</p>')
    expect(guide.steps).toHaveLength(2)
    expect(guide.steps[0].heading).toBe('GRIND')
    expect(guide.steps[0].contentHtml).toContain('<li>Set the grinder</li>')
    expect(guide.steps[1].heading).toBe('BREW')
    expect(guide.steps[1].contentHtml).toContain('Pour slowly.')
  })

  it('uses the first plain line as the title when there is no H1', () => {
    const guide = splitGuideMarkdown('CLOSING CHECKLIST\n\n## LOCK UP\n\nLock the doors.')
    expect(guide.title).toBe('CLOSING CHECKLIST')
    expect(guide.steps).toHaveLength(1)
    expect(guide.steps[0].heading).toBe('LOCK UP')
  })

  it('keeps an H3 inside the step content', () => {
    const guide = splitGuideMarkdown('# T\n\n## STEP\n\n### Detail\n\nText')
    expect(guide.steps[0].contentHtml).toContain('<h3>Detail</h3>')
  })
})
