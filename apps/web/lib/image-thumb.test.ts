import { describe, it, expect } from 'vitest'
import { parseThumbWidth, thumbUrl } from '@/lib/image-thumb'

describe('thumbUrl', () => {
  it('appends ?w= to local upload URLs', () => {
    expect(thumbUrl('/api/upload/abc.jpg', 480)).toBe('/api/upload/abc.jpg?w=480')
  })

  it('clamps the width into the servable range', () => {
    expect(thumbUrl('/api/upload/abc.jpg', 5)).toBe('/api/upload/abc.jpg?w=32')
    expect(thumbUrl('/api/upload/abc.jpg', 99999)).toBe('/api/upload/abc.jpg?w=1600')
  })

  it('passes remote and empty URLs through untouched', () => {
    expect(thumbUrl('https://cdn.example.com/a.jpg', 480)).toBe('https://cdn.example.com/a.jpg')
    expect(thumbUrl('', 480)).toBeNull()
    expect(thumbUrl(null, 480)).toBeNull()
    expect(thumbUrl(undefined, 480)).toBeNull()
  })
})

describe('parseThumbWidth', () => {
  it('accepts sane widths only', () => {
    expect(parseThumbWidth('480')).toBe(480)
    expect(parseThumbWidth('32')).toBe(32)
    expect(parseThumbWidth('1600')).toBe(1600)
    expect(parseThumbWidth('31')).toBeNull()
    expect(parseThumbWidth('1601')).toBeNull()
    expect(parseThumbWidth('abc')).toBeNull()
    expect(parseThumbWidth(null)).toBeNull()
  })
})
