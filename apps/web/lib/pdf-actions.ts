// Client-safe helpers for the in-app PDF action bar. No Prisma, no React — the
// browser state (navigator / document / window) is always injectable so the
// pure logic can be unit-tested in the node environment.

const ILLEGAL_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g

/** Strip path separators + characters that break a download, and ensure `.pdf`. */
export function sanitisePdfFilename(name: string, fallback = 'document.pdf'): string {
  function clean(input: string): string {
    return (input ?? '')
      .split(/[\\/]/)
      .pop()!
      .replace(ILLEGAL_FILENAME_CHARS, '')
      .replace(/\s+/g, ' ')
      .replace(/^\.+/, '')
      .replace(/[. ]+$/, '')
      .trim()
  }

  let result = clean(name)
  if (!result) result = clean(fallback) || 'document'
  if (!/\.pdf$/i.test(result)) result += '.pdf'
  return result
}

/** True only when the OS/browser can share PDF files via the share sheet. */
export function canShareFiles(nav?: Navigator | null): boolean {
  const n = nav ?? (typeof navigator !== 'undefined' ? navigator : null)
  if (!n || typeof n.share !== 'function' || typeof n.canShare !== 'function') return false
  if (typeof File === 'undefined') return false
  try {
    const probe = new File([''], 'probe.pdf', { type: 'application/pdf' })
    return n.canShare({ files: [probe] })
  } catch {
    return false
  }
}

function isAbortError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { name?: string }).name === 'AbortError'
}

export interface SharePdfOptions {
  url: string
  filename: string
  title?: string
  text?: string
  nav?: Navigator | null
  fetchImpl?: typeof fetch
  download?: (url: string, filename: string) => void
}

/**
 * Fetch the PDF, hand it to the OS share sheet as a File, and fall back to a
 * download when sharing is unavailable or fails. Cancelling the sheet is not a
 * failure — it returns `cancelled` and does not download.
 */
export async function sharePdfFile(
  opts: SharePdfOptions,
): Promise<'shared' | 'cancelled' | 'downloaded' | 'unsupported'> {
  const { url, filename, title, text, nav, fetchImpl, download } = opts
  const n = nav ?? (typeof navigator !== 'undefined' ? navigator : null)
  const doDownload = download ?? downloadPdfUrl

  if (!canShareFiles(n)) {
    doDownload(url, filename)
    return 'downloaded'
  }

  try {
    const doFetch = fetchImpl ?? fetch
    const res = await doFetch(url, { credentials: 'same-origin' })
    if (!res.ok) throw new Error(`PDF fetch failed (${res.status})`)
    const blob = await res.blob()
    const file = new File([blob], filename, { type: 'application/pdf' })
    await n!.share({ files: [file], title, text })
    return 'shared'
  } catch (err) {
    if (isAbortError(err)) return 'cancelled'
    doDownload(url, filename)
    return 'downloaded'
  }
}

/** Render a PDF in a hidden same-origin iframe and print it. Returns cleanup. */
export function printPdfUrl(url: string, doc?: Document): () => void {
  const d = doc ?? (typeof document !== 'undefined' ? document : null)
  if (!d) return () => {}

  const iframe = d.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.setAttribute('title', 'PDF print')
  iframe.className = 'absolute w-0 h-0 border-0 opacity-0 pointer-events-none'
  iframe.src = url

  let removed = false
  let timer: ReturnType<typeof setTimeout> | null = null

  const cleanup = () => {
    if (removed) return
    removed = true
    if (timer) clearTimeout(timer)
    try {
      iframe.remove()
    } catch {
      /* already detached */
    }
  }

  iframe.onload = () => {
    try {
      const win = iframe.contentWindow
      if (win) {
        win.focus()
        win.print()
      }
    } catch {
      /* cross-origin / blocked — nothing more we can do */
    }
    timer = setTimeout(cleanup, 1000)
  }

  const parent = d.body ?? d.documentElement
  parent.appendChild(iframe)
  return cleanup
}

/** Trigger a browser download for a PDF URL without leaving the app. */
export function downloadPdfUrl(url: string, filename: string, doc?: Document): void {
  const d = doc ?? (typeof document !== 'undefined' ? document : null)
  if (!d) return
  const a = d.createElement('a')
  a.href = url
  a.download = filename
  const parent = d.body ?? d.documentElement
  parent.appendChild(a)
  a.click()
  a.remove()
}

/** True when the page is running as an installed/standalone app. */
export function isStandaloneApp(win?: Window): boolean {
  const w = win ?? (typeof window !== 'undefined' ? window : null)
  if (!w) return false
  const nav = w.navigator as (Navigator & { standalone?: boolean }) | undefined
  if (nav?.standalone) return true
  try {
    if (typeof w.matchMedia === 'function') {
      if (w.matchMedia('(display-mode: standalone)').matches) return true
      if (w.matchMedia('(display-mode: fullscreen)').matches) return true
    }
  } catch {
    /* matchMedia unsupported */
  }
  return false
}
