import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: vi.fn(() => ({ promise: Promise.reject(new Error('no pdf')) })),
}))

import { PdfCanvasViewer } from './PdfCanvasViewer'

describe('PdfCanvasViewer', () => {
  it('exposes the source on the container and shows the error state when pdf.js cannot load', async () => {
    render(<PdfCanvasViewer url="/api/admin/gift-cards/card-1/pdf?inline=1" title="GIFT CARD PREVIEW" />)
    const viewer = screen.getByTitle('GIFT CARD PREVIEW')
    expect(viewer.getAttribute('data-pdf-src')).toBe('/api/admin/gift-cards/card-1/pdf?inline=1')
    expect(await screen.findByText('PREVIEW UNAVAILABLE')).toBeTruthy()
  })
})
