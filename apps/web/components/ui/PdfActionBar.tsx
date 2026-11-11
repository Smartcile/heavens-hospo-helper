'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import {
  canShareFiles,
  downloadPdfUrl,
  isStandaloneApp,
  printPdfUrl,
  sharePdfFile,
} from '@/lib/pdf-actions'

interface Props {
  url: string
  downloadUrl?: string
  filename: string
  title?: string
  onBack?: () => void
  backLabel?: string
  className?: string
}

const BACK_LABEL = 'BACK'

/**
 * Bottom action bar for an in-app PDF. Keeps the document inside the app: BACK
 * always returns, PRINT uses a same-origin iframe, SHARE uses the OS sheet with
 * the actual PDF file (prefetched so iOS keeps the user gesture), DOWNLOAD saves
 * and OPEN is the desktop escape hatch.
 */
export function PdfActionBar({ url, downloadUrl, filename, title, onBack, backLabel, className }: Props) {
  const [status, setStatus] = useState('')
  const [statusTone, setStatusTone] = useState<'info' | 'error'>('info')
  const shareBlobRef = useRef<Blob | null>(null)
  const shareSupported = canShareFiles()
  const canBack = Boolean(onBack) || isStandaloneApp()

  // Prefetch once so a SHARE tap can build the File synchronously inside the
  // gesture (Safari refuses navigator.share after an await).
  useEffect(() => {
    let cancelled = false
    shareBlobRef.current = null
    if (!shareSupported) return
    fetch(url, { credentials: 'same-origin' })
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => {
        if (!cancelled && blob) shareBlobRef.current = blob
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [url, shareSupported])

  function setInfo(text: string) {
    setStatusTone('info')
    setStatus(text)
  }

  function setError(text: string) {
    setStatusTone('error')
    setStatus(text)
  }

  function handleBack() {
    if (onBack) onBack()
    else if (typeof window !== 'undefined') window.history.back()
  }

  function handlePrint() {
    setInfo('PRINTING…')
    printPdfUrl(url)
  }

  async function handleShare() {
    setStatus('')
    const nav = typeof navigator !== 'undefined' ? navigator : null
    const blob = shareBlobRef.current

    if (blob && nav && typeof nav.share === 'function' && typeof File !== 'undefined') {
      try {
        const file = new File([blob], filename, { type: 'application/pdf' })
        await nav.share({ files: [file], title })
        setInfo('SHARED')
        return
      } catch (err) {
        if (typeof err === 'object' && err !== null && (err as { name?: string }).name === 'AbortError') {
          setInfo('SHARE CANCELLED')
          return
        }
        downloadPdfUrl(downloadUrl ?? url, filename)
        setInfo('DOWNLOADED INSTEAD')
        return
      }
    }

    setInfo('PREPARING…')
    const result = await sharePdfFile({ url, filename, title, nav })
    if (result === 'shared') setInfo('SHARED')
    else if (result === 'cancelled') setInfo('SHARE CANCELLED')
    else if (result === 'downloaded') setInfo('DOWNLOADED INSTEAD')
    else setError('SHARE UNAVAILABLE')
  }

  function handleDownload() {
    downloadPdfUrl(downloadUrl ?? url, filename)
    setInfo('DOWNLOADED')
  }

  function handleOpen() {
    if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener')
  }

  return (
    <div
      data-testid="pdf-action-bar"
      className={cn(
        'border-t border-grey-mid bg-black/95 p-2 flex flex-nowrap overflow-x-auto items-center gap-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]',
        className,
      )}
    >
      {canBack && (
        <Button
          size="sm"
          variant="ghost"
          aria-label="Back"
          data-testid="pdf-back"
          className="min-h-11 shrink-0"
          onClick={handleBack}
        >
          {backLabel ?? BACK_LABEL}
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        aria-label="Print"
        data-testid="pdf-print"
        className="min-h-11 shrink-0"
        onClick={handlePrint}
      >
        PRINT
      </Button>
      {shareSupported && (
        <Button
          size="sm"
          variant="ghost"
          aria-label="Share"
          data-testid="pdf-share"
          className="min-h-11 shrink-0"
          onClick={handleShare}
        >
          SHARE
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        aria-label="Download"
        data-testid="pdf-download"
        className="min-h-11 shrink-0"
        onClick={handleDownload}
      >
        DOWNLOAD
      </Button>
      <Button
        size="sm"
        variant="ghost"
        aria-label="Open in new tab"
        data-testid="pdf-open"
        className="min-h-11 shrink-0"
        onClick={handleOpen}
      >
        OPEN
      </Button>
      {status && (
        <span
          data-testid="pdf-status"
          className={cn(
            'shrink-0 font-mono text-xs uppercase',
            statusTone === 'error' ? 'text-danger' : 'text-grey-light',
          )}
        >
          {status}
        </span>
      )}
    </div>
  )
}
