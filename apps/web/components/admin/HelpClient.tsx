'use client'

// Heavenly Help reader — used by /admin/help and /w/help. Fetches the seeded
// catalogue, allows search, and opens one article at a time. HTML is sanitised
// on the server and again here before render. Screenshots in an article open in
// a full-screen lightbox (click / Escape closes).

import { useEffect, useMemo, useRef, useState } from 'react'
import { sanitiseHelpRichText } from '@/lib/rich-text'
import { groupHelpArticles, searchHelpArticles, type HelpArticleView } from '@/lib/help'

interface LightboxImage {
  src: string
  alt: string
}

// Sanitised help HTML emits plain `<img src alt>`; make each screenshot a
// focusable button so keyboard users can open the lightbox too.
function enhanceHelpImages(html: string): string {
  return html.replace(/<img\b([^>]*)>/gi, (_tag, attrs: string) => {
    const altMatch = attrs.match(/\balt="([^"]*)"/i)
    const alt = altMatch?.[1] ?? ''
    const label = alt ? `Open image: ${alt}` : 'Open image'
    return `<img${attrs} tabindex="0" role="button" aria-label="${label}">`
  })
}

export function HelpClient({ endpoint }: { endpoint: string }) {
  const [articles, setArticles] = useState<HelpArticleView[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [openSlug, setOpenSlug] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<LightboxImage | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    let alive = true
    fetch(endpoint)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => { if (alive) setArticles(Array.isArray(rows) ? rows : []) })
      .catch(() => { if (alive) setArticles([]) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [endpoint])

  useEffect(() => {
    if (!lightbox) return
    const previous = restoreFocusRef.current
    closeButtonRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setLightbox(null)
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
  }, [lightbox])

  const filtered = useMemo(() => searchHelpArticles(articles, query), [articles, query])
  const groups = useMemo(() => groupHelpArticles(filtered), [filtered])
  const open = filtered.find((a) => a.slug === openSlug) ?? null

  if (loading) {
    return <p className="font-mono text-xs uppercase text-grey-light loading-cursor">LOADING</p>
  }

  function openLightbox(target: HTMLElement) {
    if (target.tagName !== 'IMG') return
    const img = target as HTMLImageElement
    restoreFocusRef.current = img
    setLightbox({ src: img.getAttribute('src') ?? '', alt: img.getAttribute('alt') ?? '' })
  }

  function handleBodyClick(event: React.MouseEvent<HTMLDivElement>) {
    openLightbox(event.target as HTMLElement)
  }

  function handleBodyKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Enter' && event.key !== ' ') return
    const target = event.target as HTMLElement | null
    if (!target || target.tagName !== 'IMG') return
    event.preventDefault()
    openLightbox(target)
  }

  if (open) {
    return (
      <div className="w-full space-y-4">
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-grey-mid bg-black/95 py-2 backdrop-blur">
          <button
            type="button"
            onClick={() => setOpenSlug(null)}
            aria-label="Back to all help"
            className="font-mono text-xs uppercase text-grey-light border border-grey-mid px-3 py-1.5 hover:border-white hover:text-white transition-colors"
          >
            ← ALL HELP
          </button>
          <span className="font-mono text-2xs uppercase tracking-wider text-grey-light">
            {open.category}
          </span>
        </div>

        <div className="border border-grey-mid bg-grey-dark/20 p-5">
          <p className="font-mono text-2xs uppercase text-grey-light tracking-wider">{open.category}</p>
          <h1 className="font-mono text-xl font-bold uppercase tracking-widest text-white mt-1">{open.title}</h1>
          {open.summary && <p className="font-mono text-sm uppercase text-grey-light mt-2">{open.summary}</p>}
        </div>

        <div
          onClick={handleBodyClick}
          onKeyDown={handleBodyKeyDown}
          className="help-body w-full border border-grey-mid bg-grey-dark/10 p-5 font-mono text-sm text-white space-y-4 [&_h2]:border [&_h2]:border-grey-mid [&_h2]:bg-grey-dark [&_h2]:px-4 [&_h2]:py-2 [&_h2]:text-base [&_h2]:font-bold [&_h2]:uppercase [&_h2]:tracking-wider [&_h2]:mt-6 [&_h3]:border-l-2 [&_h3]:border-gold [&_h3]:pl-3 [&_h3]:text-sm [&_h3]:font-bold [&_h3]:uppercase [&_h3]:text-accent [&_h3]:mt-5 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1.5 [&_li]:leading-relaxed [&_p]:leading-relaxed [&_a]:text-gold [&_a]:underline [&_code]:border [&_code]:border-grey-mid [&_code]:px-1 [&_img]:block [&_img]:w-full [&_img]:h-auto [&_img]:my-3 [&_img]:border [&_img]:border-grey-mid [&_img]:cursor-zoom-in [&_img]:focus-visible:outline [&_img]:focus-visible:outline-2 [&_img]:focus-visible:outline-white"
          dangerouslySetInnerHTML={{ __html: enhanceHelpImages(sanitiseHelpRichText(open.bodyHtml ?? '')) }}
        />

        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setOpenSlug(null)}
            className="font-mono text-xs uppercase text-grey-light border border-grey-mid px-3 py-1.5 hover:border-white hover:text-white transition-colors"
          >
            ✕ CLOSE
          </button>
        </div>

        {lightbox && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label={lightbox.alt || 'Screenshot'}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          >
            <button
              ref={closeButtonRef}
              type="button"
              onClick={() => setLightbox(null)}
              aria-label="Close image"
              className="absolute inset-0 h-full w-full cursor-zoom-out"
            />
            <figure className="relative flex max-h-full max-w-6xl flex-col items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- user-shipped help screenshot */}
              <img
                src={lightbox.src}
                alt={lightbox.alt}
                onClick={() => setLightbox(null)}
                className="max-h-[85vh] w-auto max-w-full cursor-zoom-out border border-grey-mid object-contain"
              />
              {lightbox.alt && (
                <figcaption className="font-mono text-xs text-grey-light">{lightbox.alt}</figcaption>
              )}
            </figure>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="font-mono text-lg font-bold uppercase tracking-widest text-white flex items-center gap-2">
          <span className="text-danger">✕</span> HEAVENLY HELP
        </h1>
        <p className="font-mono text-xs uppercase text-grey-light mt-1">
          HOW TO USE THE APP, FROM FIRST SETUP TO EVERYDAY OPERATIONS.
        </p>
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="SEARCH HELP..."
        aria-label="Search help"
        className="w-full bg-black border border-grey-mid text-white font-mono text-xs px-3 py-2 outline-none focus:border-white placeholder:text-grey-light"
      />

      {groups.length === 0 ? (
        <div className="border border-grey-mid p-8 text-center">
          <p className="font-mono text-xs uppercase text-grey-light">
            {articles.length === 0 ? 'NO HELP ARTICLES YET.' : 'NO MATCHES.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <div key={group.category} className="border border-grey-mid">
              <div className="px-3 py-1.5 bg-grey-mid/20 border-b border-grey-mid font-mono text-2xs uppercase tracking-wider text-grey-light">
                {group.category}
              </div>
              <div className="divide-y divide-grey-mid">
                {group.articles.map((article) => (
                  <button
                    key={article.slug}
                    type="button"
                    onClick={() => setOpenSlug(article.slug)}
                    className="w-full text-left px-3 py-2 hover:bg-grey-mid/10 transition-colors"
                  >
                    <span className="font-mono text-xs uppercase text-white">{article.title}</span>
                    {article.summary && (
                      <span className="block font-mono text-2xs uppercase text-grey-light mt-0.5">{article.summary}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
