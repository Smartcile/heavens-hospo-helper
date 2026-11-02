'use client'

// Client hook: load a venue's resolved BEO block library (built-ins + custom
// defs) from an endpoint. Falls back to the built-ins on any failure so the
// builder always renders. The endpoint differs per surface (admin vs worker),
// so the caller passes the URL.

import { useEffect, useState } from 'react'
import { BEO_BLOCKS, defRowToBlockDef, mergeLibrary, type BlockLibrary } from '@/lib/beo-blocks'

export function useBlockLibrary(url: string | null): BlockLibrary {
  const [library, setLibrary] = useState<BlockLibrary>(BEO_BLOCKS)

  useEffect(() => {
    if (!url) {
      setLibrary(BEO_BLOCKS)
      return
    }
    let alive = true
    ;(async () => {
      try {
        const r = await fetch(url)
        if (!r.ok) {
          if (alive) setLibrary(BEO_BLOCKS)
          return
        }
        const rows = await r.json()
        if (!alive) return
        setLibrary(mergeLibrary(Array.isArray(rows) ? rows.map(defRowToBlockDef) : []))
      } catch {
        if (alive) setLibrary(BEO_BLOCKS)
      }
    })()
    return () => { alive = false }
  }, [url])

  return library
}
