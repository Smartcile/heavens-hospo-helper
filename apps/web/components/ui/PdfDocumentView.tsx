'use client'

import { PdfActionBar } from '@/components/ui/PdfActionBar'
import { PdfCanvasViewer } from '@/components/ui/PdfCanvasViewer'
import { cn } from '@/lib/utils'

interface Props {
  url: string
  downloadUrl?: string
  filename: string
  title?: string
  onBack?: () => void
  backLabel?: string
  showOpen?: boolean
  showDownload?: boolean
  className?: string
}

/** A full-height in-app PDF: canvas viewer plus the bottom action bar. */
export function PdfDocumentView({
  url,
  downloadUrl,
  filename,
  title,
  onBack,
  backLabel,
  showOpen,
  showDownload,
  className,
}: Props) {
  return (
    <div
      data-testid="pdf-document-view"
      className={cn('flex flex-1 flex-col min-h-0 h-full bg-black', className)}
    >
      <div className="flex-1 min-h-0 flex flex-col">
        <PdfCanvasViewer url={url} title={title} />
      </div>
      <PdfActionBar
        url={url}
        downloadUrl={downloadUrl}
        filename={filename}
        title={title}
        onBack={onBack}
        backLabel={backLabel}
        showOpen={showOpen}
        showDownload={showDownload}
      />
    </div>
  )
}
