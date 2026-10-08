'use client'

// The media library behind every picker's BROWSE LIBRARY button: a simple
// gallery of the images already uploaded to the system. Pick one to see it
// large, then INSERT (or go BACK) — the same file can be reused in as many
// places as needed; inserting never overwrites the file, so existing links
// elsewhere keep working.

import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'

interface MediaFile {
  name: string
  url: string
  size: number
  mtime: string
}

export function MediaLibraryModal({ onClose, onPick }: { onClose: () => void; onPick: (url: string) => void }) {
  const [files, setFiles] = useState<MediaFile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<MediaFile | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/admin/media')
      .then(async (r) => {
        if (!r.ok) {
          const d = await r.json().catch(() => null)
          throw new Error(d?.error ?? 'COULD NOT LOAD MEDIA')
        }
        return r.json()
      })
      .then((d) => { if (alive) setFiles(Array.isArray(d?.files) ? d.files : []) })
      .catch((e) => { if (alive) setError(String(e?.message ?? 'COULD NOT LOAD MEDIA')) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  return (
    <Modal isOpen onClose={onClose} title="MEDIA LIBRARY" size="xl">
      {selected ? (
        <div className="space-y-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={selected.url}
            alt={selected.name}
            className="mx-auto block max-h-[55vh] w-auto max-w-full border border-grey-mid object-contain"
          />
          <p className="break-all text-center font-mono text-xs text-grey-light">{selected.name}</p>
          <div className="flex items-center justify-center gap-2">
            <Button variant="ghost" onClick={() => setSelected(null)}>← BACK</Button>
            <Button onClick={() => { onPick(selected.url); onClose() }}>INSERT IMAGE</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {loading && <p className="font-mono text-sm text-grey-light loading-cursor">LOADING</p>}
          {error && <p className="font-mono text-xs text-danger">{error}</p>}
          {!loading && !error && files.length === 0 && (
            <p className="font-mono text-xs text-grey-light">NO IMAGES YET — UPLOAD ONE FIRST.</p>
          )}
          <div className="grid max-h-[60vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {files.map((f) => (
              <button key={f.name} type="button" onClick={() => setSelected(f)} className="group text-left">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={f.url}
                  alt={f.name}
                  loading="lazy"
                  className="h-24 w-full border border-grey-mid object-cover transition-colors group-hover:border-white"
                />
                <span className="mt-1 block truncate font-mono text-2xs text-grey-light group-hover:text-white" title={f.name}>
                  {f.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </Modal>
  )
}
