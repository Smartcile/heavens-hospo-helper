import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const mocks = vi.hoisted(() => ({ useWorkerImmersive: vi.fn() }))

vi.mock('@/components/worker/useWorkerImmersive', () => ({
  useWorkerImmersive: mocks.useWorkerImmersive,
}))

// The canvas renderer needs pdf.js; the action bar is the part under test here.
vi.mock('@/components/ui/PdfCanvasViewer', () => ({
  PdfCanvasViewer: () => null,
}))

import { PdfViewerModal, type PdfViewerTarget } from '@/components/ui/PdfViewerModal'

const TARGET: PdfViewerTarget = {
  url: '/api/admin/tips/t1/pdf?inline=1',
  downloadUrl: '/api/admin/tips/t1/pdf',
  filename: 'Tips distribution.pdf',
  title: 'TIPS DISTRIBUTION',
}

beforeEach(() => {
  mocks.useWorkerImmersive.mockReset()
  document.body.style.overflow = ''
})

describe('PdfViewerModal', () => {
  it('renders the in-app viewer and action bar', () => {
    render(<PdfViewerModal target={TARGET} onClose={vi.fn()} />)
    expect(screen.getByTestId('pdf-viewer-modal')).toBeTruthy()
    expect(screen.getByTestId('pdf-document-view')).toBeTruthy()
    expect(screen.getByTestId('pdf-action-bar')).toBeTruthy()
    expect(mocks.useWorkerImmersive).toHaveBeenCalledWith(true)
  })

  it('BACK calls onClose', () => {
    const onClose = vi.fn()
    render(<PdfViewerModal target={TARGET} onClose={onClose} />)
    fireEvent.click(screen.getByTestId('pdf-back'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Escape calls onClose', () => {
    const onClose = vi.fn()
    render(<PdfViewerModal target={TARGET} onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders nothing for a null target', () => {
    const { container } = render(<PdfViewerModal target={null} onClose={vi.fn()} />)
    expect(container.firstChild).toBeNull()
    expect(mocks.useWorkerImmersive).toHaveBeenCalledWith(false)
  })

  it('forwards showOpen / showDownload to the action bar', () => {
    const { rerender } = render(
      <PdfViewerModal target={{ ...TARGET, showOpen: false, showDownload: false }} onClose={vi.fn()} />,
    )
    expect(screen.queryByTestId('pdf-open')).toBeNull()
    expect(screen.queryByTestId('pdf-download')).toBeNull()

    rerender(<PdfViewerModal target={TARGET} onClose={vi.fn()} />)
    expect(screen.getByTestId('pdf-open')).toBeTruthy()
    expect(screen.getByTestId('pdf-download')).toBeTruthy()
  })

  it('locks body scroll while open and restores it on close', () => {
    document.body.style.overflow = 'auto'
    const { unmount } = render(<PdfViewerModal target={TARGET} onClose={vi.fn()} />)
    expect(document.body.style.overflow).toBe('hidden')
    unmount()
    expect(document.body.style.overflow).toBe('auto')
  })
})
