// Reliable client-side file download. `window.open` on an authenticated API
// route is flaky — some browsers show the response in a tab instead of
// downloading it, or the popup is blocked. Fetching the body and handing a
// Blob to an <a download> always saves the file.

/** Pull the filename out of a Content-Disposition header, if present. */
export function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null
  const utf8 = header.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8) {
    try {
      return decodeURIComponent(utf8[1].trim())
    } catch {
      return utf8[1].trim()
    }
  }
  const quoted = header.match(/filename="([^"]+)"/i)
  if (quoted) return quoted[1]
  const bare = header.match(/filename=([^;]+)/i)
  return bare ? bare[1].trim() : null
}

/** Fetch a URL and save the response as a file. Throws on a non-OK response. */
export async function downloadFile(url: string, fallbackName?: string): Promise<void> {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`Download failed (${r.status})`)
  const blob = await r.blob()
  const name = filenameFromDisposition(r.headers.get('content-disposition')) ?? fallbackName ?? 'download'
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(objectUrl)
}
