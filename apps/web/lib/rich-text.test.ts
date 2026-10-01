import { describe, it, expect } from 'vitest'
import { isRichTextEmpty, richTextToPlainText, sanitiseRichText } from '@/lib/rich-text'

describe('sanitiseRichText', () => {
  it('keeps the allowed formatting tags', () => {
    const html = '<h1>Title</h1><p>Hello <strong>world</strong> and <em>friends</em></p><ul><li>one</li><li>two</li></ul>'
    expect(sanitiseRichText(html)).toBe(html)
  })

  it('drops script/style blocks including their contents', () => {
    expect(sanitiseRichText('<p>a</p><script>alert(1)</script><style>.x{}</style>')).toBe('<p>a</p>')
    expect(sanitiseRichText('hello<script>evil()</script> world')).toBe('hello world')
  })

  it('strips event-handler attributes', () => {
    expect(sanitiseRichText('<p onclick="steal()">hi</p>')).toBe('<p>hi</p>')
  })

  it('drops unsafe links but keeps safe ones with rel/target', () => {
    expect(sanitiseRichText('<a href="javascript:alert(1)">x</a>')).toBe('<a>x</a>')
    expect(sanitiseRichText('<a href="https://x.com" onclick="y()">x</a>')).toBe(
      '<a href="https://x.com" rel="noopener noreferrer" target="_blank">x</a>',
    )
    expect(sanitiseRichText('<a href="/uploads/a.pdf">file</a>')).toContain('href="/uploads/a.pdf"')
    expect(sanitiseRichText('<a href="mailto:a@b.com">mail</a>')).toContain('href="mailto:a@b.com"')
  })

  it('drops disallowed tags (img/svg) but keeps their surrounding text', () => {
    expect(sanitiseRichText('<img src=x onerror=alert(1)>')).toBe('')
    expect(sanitiseRichText('<p>before <img src=x> after</p>')).toBe('<p>before  after</p>')
  })

  it('folds non-semantic tags onto the allowlist', () => {
    expect(sanitiseRichText('<div>a</div><h4>b</h4><b>c</b><i>d</i>')).toBe(
      '<p>a</p><h3>b</h3><strong>c</strong><em>d</em>',
    )
  })

  it('auto-closes unclosed tags', () => {
    expect(sanitiseRichText('<p>hi <strong>there')).toBe('<p>hi <strong>there</strong></p>')
  })

  it('escapes a lone angle bracket in text', () => {
    expect(sanitiseRichText('a < b')).toBe('a &lt; b')
  })

  it('handles empty input', () => {
    expect(sanitiseRichText(null)).toBe('')
    expect(sanitiseRichText('')).toBe('')
    expect(sanitiseRichText(undefined)).toBe('')
  })
})

describe('richTextToPlainText', () => {
  it('turns block boundaries into newlines and strips tags', () => {
    expect(richTextToPlainText('<h1>A</h1><p>B</p><ul><li>C</li><li>D</li></ul>')).toBe('A\nB\nC\nD')
    expect(richTextToPlainText('one<br>two')).toBe('one\ntwo')
  })

  it('decodes entities', () => {
    expect(richTextToPlainText('<p>Tom &amp; Jerry &lt;3</p>')).toBe('Tom & Jerry <3')
  })

  it('drops script content', () => {
    expect(richTextToPlainText('<p>x</p><script>bad()</script>')).toBe('x')
  })
})

describe('isRichTextEmpty', () => {
  it('treats markup-only content as empty', () => {
    expect(isRichTextEmpty('')).toBe(true)
    expect(isRichTextEmpty(null)).toBe(true)
    expect(isRichTextEmpty('<p></p>')).toBe(true)
    expect(isRichTextEmpty('<p><br></p>')).toBe(true)
    expect(isRichTextEmpty('<p>hi</p>')).toBe(false)
  })
})
