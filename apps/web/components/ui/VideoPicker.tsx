'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

// Single-video upload. The server transcodes the clip to a tiny, silent,
// phone-sized MP4, so the value here is the transcoded file's URL.

interface VideoPickerProps {
  value: string | null
  onChange: (url: string | null) => void
  label?: string
  className?: string
  disabled?: boolean
  /** Upload endpoint — admin by default; the worker editor passes /api/worker/upload-video. */
  endpoint?: string
}

export function VideoPicker({ value, onChange, label, className, disabled, endpoint = '/api/admin/upload-video' }: VideoPickerProps) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  async function upload(file: File) {
    if (!file.type.startsWith('video/')) {
      setError('ONLY VIDEO FILES ARE ALLOWED')
      return
    }
    setUploading(true)
    setError('')
    try {
      const form = new FormData()
      form.append('file', file)
      const r = await fetch(endpoint, { method: 'POST', body: form })
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

  return (
    <div className={cn('space-y-2', className)}>
      {label && <span className="font-mono text-xs uppercase text-grey-light tracking-wider">{label}</span>}
      {value && (
        <video src={value} controls muted playsInline className="block w-full max-w-[260px] border border-grey-mid" />
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <label className={cn(
          'cursor-pointer font-mono text-xs uppercase border border-grey-mid px-2 py-1.5 transition-colors',
          disabled ? 'opacity-40 cursor-not-allowed' : 'text-grey-light hover:text-white hover:border-white',
        )}>
          {uploading ? 'COMPRESSING...' : value ? 'REPLACE VIDEO' : '+ ADD VIDEO'}
          <input
            type="file"
            accept="video/*"
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
            className="font-mono text-xs uppercase text-grey-light hover:text-danger transition-colors"
          >
            REMOVE
          </button>
        )}
        {!disabled && <span className="font-mono text-xs text-grey-light/50">UP TO 200MB · COMPRESSED FOR PHONE</span>}
      </div>
      {error && <span className="font-mono text-xs text-danger">{error}</span>}
    </div>
  )
}
