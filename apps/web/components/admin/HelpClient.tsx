'use client'

// Heavenly Help reader — used by /admin/help and /w/help. Fetches the seeded
// catalogue, allows search, and opens one article at a time. HTML is sanitised
// on the server and again here before render.

import { useEffect, useMemo, useState } from 'react'
import { sanitiseHelpRichText } from '@/lib/rich-text'
import { groupHelpArticles, searchHelpArticles, type HelpArticleView } from '@/lib/help'

export function HelpClient({ endpoint }: { endpoint: string }) {
  const [articles, setArticles] = useState<HelpArticleView[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [openSlug, setOpenSlug] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetch(endpoint)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => { if (alive) setArticles(Array.isArray(rows) ? rows : []) })
      .catch(() => { if (alive) setArticles([]) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [endpoint])

  const filtered = useMemo(() => searchHelpArticles(articles, query), [articles, query])
  const groups = useMemo(() => groupHelpArticles(filtered), [filtered])
  const open = filtered.find((a) => a.slug === openSlug) ?? null

  if (loading) {
    return <p className="font-mono text-xs uppercase text-grey-light loading-cursor">LOADING</p>
  }

  if (open) {
    return (
      <div className="space-y-4 max-w-3xl">
        <button
          type="button"
          onClick={() => setOpenSlug(null)}
          className="font-mono text-xs uppercase text-grey-light border border-grey-mid px-3 py-1.5 hover:border-white hover:text-white transition-colors"
        >
          ← ALL HELP
        </button>
        <div>
          <p className="font-mono text-2xs uppercase text-grey-light tracking-wider">{open.category}</p>
          <h1 className="font-mono text-lg font-bold uppercase tracking-widest text-white mt-1">{open.title}</h1>
          {open.summary && <p className="font-mono text-xs uppercase text-grey-light mt-1">{open.summary}</p>}
        </div>
        <div
          className="help-body border border-grey-mid p-4 font-mono text-xs text-white space-y-3 [&_h2]:text-sm [&_h2]:font-bold [&_h2]:uppercase [&_h2]:tracking-wider [&_h3]:text-xs [&_h3]:font-bold [&_h3]:uppercase [&_h3]:text-accent [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 [&_p]:leading-relaxed [&_code]:border [&_code]:border-grey-mid [&_code]:px-1 [&_img]:block [&_img]:w-full [&_img]:h-auto [&_img]:my-2 [&_img]:border [&_img]:border-grey-mid"
          dangerouslySetInnerHTML={{ __html: sanitiseHelpRichText(open.bodyHtml ?? '') }}
        />
        <button
          type="button"
          onClick={() => setOpenSlug(null)}
          className="font-mono text-xs uppercase text-grey-light border border-grey-mid px-3 py-1.5 hover:border-white hover:text-white transition-colors"
        >
          ✕ CLOSE
        </button>
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
