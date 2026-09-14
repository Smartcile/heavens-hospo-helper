'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

// Image upload with CHOOSE + PASTE (CTRL+V) — paste a copied image anywhere
// inside the picker and it uploads. Used for every single-image field across
// the app (gift card product photos, guide step photos, recipe images, …).

interface ImagePickerProps {
  value: string | null
  onChange: (url: string | null) => void
  label?: string
  className?: string
  disabled?: boolean
}

export function ImagePicker({ value, onChange, label, className, disabled }: ImagePickerProps) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  async function upload(file: File) {
    if (!file || !file.type.startsWith('image/')) return
    setUploading(true)
    setError('')
    try {
      const form = new FormData()
      form.append('file', file)
      const r = await fetch('/api/admin/upload', { method: 'POST', body: form })
      if (r.ok) {
        const data = await r.json()
        if (data?.url) onChange(data.url)
        else setError('UPLOAD FAILED')
      } else {
        const d = await r.json().catch(() => null)
        setError(d?.error ?? 'UPLOAD FAILED')
      }
    } catch {
      setError('UPLOAD FAILED')
    } finally {
      setUploading(false)
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    if (disabled) return
    const items = e.clipboardData?.items
    if (!items) return
    for (const it of items) {
      if (it.kind === 'file' && it.type.startsWith('image/')) {
        const file = it.getAsFile()
        if (file) {
          e.preventDefault()
          upload(file)
          return
        }
      }
    }
  }

  return (
    <div className={cn('flex items-center gap-3 flex-wrap', className)} onPaste={handlePaste}>
      {label && (
        <span className="font-mono text-[10px] uppercase text-grey-light tracking-wider">{label}</span>
      )}
      {value ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={value}
          alt="uploaded preview"
          title="OPEN FULL SIZE"
          className="h-10 w-10 object-cover border border-grey-mid cursor-pointer hover:border-white transition-colors"
          onClick={() => window.open(value, '_blank')}
        />
      ) : null}
      <div className="flex items-center gap-2 flex-wrap">
        <label className={cn(
          'cursor-pointer font-mono text-[10px] uppercase border border-grey-mid px-2 py-1.5 transition-colors',
          disabled ? 'opacity-40 cursor-not-allowed' : 'text-grey-light hover:text-white hover:border-white',
        )}>
          {uploading ? 'UPLOADING...' : value ? 'REPLACE IMAGE' : 'ADD IMAGE'}
          <input
            type="file"
            accept="image/*"
            disabled={disabled}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) upload(f)
            }}
          />
        </label>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="font-mono text-[10px] uppercase text-grey-light hover:text-danger transition-colors"
          >
            REMOVE
          </button>
        )}
        {!disabled && (
          <span className="font-mono text-[9px] text-grey-light/50 hidden sm:inline">OR PASTE (CTRL+V)</span>
        )}
      </div>
      {error && <span className="font-mono text-[10px] text-danger">{error}</span>}
    </div>
  )
}
