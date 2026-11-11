import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  sanitisePdfFilename,
  canShareFiles,
  sharePdfFile,
  printPdfUrl,
  downloadPdfUrl,
  isStandaloneApp,
} from './pdf-actions'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('sanitisePdfFilename', () => {
  it('keeps a normal PDF filename', () => {
    expect(sanitisePdfFilename('Gift Card - 0005.pdf')).toBe('Gift Card - 0005.pdf')
  })

  it('strips path segments and illegal characters', () => {
    expect(sanitisePdfFilename('../../etc/pa:ss?wo*rd.pdf')).toBe('password.pdf')
    expect(sanitisePdfFilename('a\\b\\card.pdf')).toBe('card.pdf')
  })

  it('appends .pdf when missing', () => {
    expect(sanitisePdfFilename('gift card')).toBe('gift card.pdf')
  })

  it('falls back when the name is empty', () => {
    expect(sanitisePdfFilename('', 'fallback.pdf')).toBe('fallback.pdf')
    expect(sanitisePdfFilename('   ')).toBe('document.pdf')
  })
})

function fakeNav(overrides: Partial<{ share: unknown; canShare: unknown }> = {}): Navigator {
  return {
    share: overrides.share,
    canShare: overrides.canShare,
  } as unknown as Navigator
}

describe('canShareFiles', () => {
  it('is false when the share API is missing', () => {
    expect(canShareFiles(fakeNav())).toBe(false)
    expect(canShareFiles(null)).toBe(false)
  })

  it('is false when canShare rejects files', () => {
    const nav = fakeNav({ share: vi.fn(), canShare: vi.fn(() => false) })
    expect(canShareFiles(nav)).toBe(false)
  })

  it('is true when canShare accepts a PDF file', () => {
    const nav = fakeNav({ share: vi.fn(), canShare: vi.fn(() => true) })
    expect(canShareFiles(nav)).toBe(true)
  })

  it('swallows a throwing canShare', () => {
    const nav = fakeNav({ share: vi.fn(), canShare: vi.fn(() => { throw new Error('nope') }) })
    expect(canShareFiles(nav)).toBe(false)
  })
})

describe('sharePdfFile', () => {
  const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' })
  const okFetch = vi.fn(async () => ({ ok: true, blob: async () => blob })) as unknown as typeof fetch

  it('shares the PDF file when supported', async () => {
    const share = vi.fn(async () => {})
    const nav = fakeNav({ share, canShare: vi.fn(() => true) })
    const download = vi.fn()

    const result = await sharePdfFile({ url: '/pdf', filename: 'card.pdf', nav, fetchImpl: okFetch, download })

    expect(result).toBe('shared')
    expect(share).toHaveBeenCalledTimes(1)
    const arg = (share as unknown as { mock: { calls: [{ files: File[] }][] } }).mock.calls[0][0]
    expect(arg.files[0].name).toBe('card.pdf')
    expect(arg.files[0].type).toBe('application/pdf')
    expect(download).not.toHaveBeenCalled()
  })

  it('falls back to a download when sharing is unsupported', async () => {
    const nav = fakeNav()
    const download = vi.fn()
    const result = await sharePdfFile({ url: '/pdf', filename: 'card.pdf', nav, download })
    expect(result).toBe('downloaded')
    expect(download).toHaveBeenCalledWith('/pdf', 'card.pdf')
  })

  it('returns cancelled on AbortError and does not download', async () => {
    const share = vi.fn(async () => {
      const err = new Error('cancelled')
      err.name = 'AbortError'
      throw err
    })
    const nav = fakeNav({ share, canShare: vi.fn(() => true) })
    const download = vi.fn()
    const result = await sharePdfFile({ url: '/pdf', filename: 'card.pdf', nav, fetchImpl: okFetch, download })
    expect(result).toBe('cancelled')
    expect(download).not.toHaveBeenCalled()
  })

  it('falls back to a download on other share failures', async () => {
    const share = vi.fn(async () => { throw new Error('boom') })
    const nav = fakeNav({ share, canShare: vi.fn(() => true) })
    const download = vi.fn()
    const result = await sharePdfFile({ url: '/pdf', filename: 'card.pdf', nav, fetchImpl: okFetch, download })
    expect(result).toBe('downloaded')
    expect(download).toHaveBeenCalledWith('/pdf', 'card.pdf')
  })

  it('falls back to a download when the fetch fails', async () => {
    const share = vi.fn()
    const nav = fakeNav({ share, canShare: vi.fn(() => true) })
    const download = vi.fn()
    const failing = vi.fn(async () => ({ ok: false, status: 500 })) as unknown as typeof fetch
    const result = await sharePdfFile({ url: '/pdf', filename: 'card.pdf', nav, fetchImpl: failing, download })
    expect(result).toBe('downloaded')
    expect(share).not.toHaveBeenCalled()
    expect(download).toHaveBeenCalledTimes(1)
  })
})

interface FakeIframe {
  src: string
  onload: (() => void) | null
  contentWindow: { focus: () => void; print: () => void }
  remove: () => void
  setAttribute: (name: string, value: string) => void
  className: string
}

describe('printPdfUrl', () => {
  it('appends a hidden iframe, prints on load and removes it', () => {
    vi.useFakeTimers()
    const iframe: FakeIframe = {
      src: '',
      onload: null,
      contentWindow: { focus: vi.fn(), print: vi.fn() },
      remove: vi.fn(),
      setAttribute: vi.fn(),
      className: '',
    }
    const body = { appendChild: vi.fn() }
    const doc = {
      createElement: vi.fn(() => iframe),
      body,
      documentElement: body,
    } as unknown as Document

    const cleanup = printPdfUrl('/api/worker/giftcards/1/pdf?inline=1', doc)

    expect(doc.createElement).toHaveBeenCalledWith('iframe')
    expect(iframe.src).toBe('/api/worker/giftcards/1/pdf?inline=1')
    expect(body.appendChild).toHaveBeenCalledWith(iframe)

    iframe.onload?.()
    expect(iframe.contentWindow.focus).toHaveBeenCalledTimes(1)
    expect(iframe.contentWindow.print).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(1000)
    expect(iframe.remove).toHaveBeenCalledTimes(1)

    cleanup()
    expect(iframe.remove).toHaveBeenCalledTimes(1)
  })

  it('does nothing without a document', () => {
    expect(() => printPdfUrl('/pdf', null as unknown as Document)).not.toThrow()
  })
})

interface FakeAnchor {
  href: string
  download: string
  click: () => void
  remove: () => void
}

describe('downloadPdfUrl', () => {
  it('clicks a download anchor and removes it', () => {
    const anchor: FakeAnchor = { href: '', download: '', click: vi.fn(), remove: vi.fn() }
    const body = { appendChild: vi.fn() }
    const doc = {
      createElement: vi.fn(() => anchor),
      body,
      documentElement: body,
    } as unknown as Document

    downloadPdfUrl('/api/admin/gift-cards/1/pdf', 'Gift Card - 1.pdf', doc)

    expect(anchor.href).toBe('/api/admin/gift-cards/1/pdf')
    expect(anchor.download).toBe('Gift Card - 1.pdf')
    expect(body.appendChild).toHaveBeenCalledWith(anchor)
    expect(anchor.click).toHaveBeenCalledTimes(1)
    expect(anchor.remove).toHaveBeenCalledTimes(1)
  })

  it('does nothing without a document', () => {
    expect(() => downloadPdfUrl('/pdf', 'x.pdf', null as unknown as Document)).not.toThrow()
  })
})

describe('isStandaloneApp', () => {
  it('detects navigator.standalone', () => {
    const win = {
      navigator: { standalone: true },
      matchMedia: vi.fn(() => ({ matches: false })),
    } as unknown as Window
    expect(isStandaloneApp(win)).toBe(true)
  })

  it('detects display-mode standalone', () => {
    const win = {
      navigator: {},
      matchMedia: vi.fn((q: string) => ({ matches: q === '(display-mode: standalone)' })),
    } as unknown as Window
    expect(isStandaloneApp(win)).toBe(true)
  })

  it('detects display-mode fullscreen', () => {
    const win = {
      navigator: {},
      matchMedia: vi.fn((q: string) => ({ matches: q === '(display-mode: fullscreen)' })),
    } as unknown as Window
    expect(isStandaloneApp(win)).toBe(true)
  })

  it('is false in a normal browser tab', () => {
    const win = {
      navigator: {},
      matchMedia: vi.fn(() => ({ matches: false })),
    } as unknown as Window
    expect(isStandaloneApp(win)).toBe(false)
  })

  it('is false without a window', () => {
    expect(isStandaloneApp(null as unknown as Window)).toBe(false)
  })
})
