import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: vi.fn(() => ({ promise: Promise.reject(new Error('no pdf')) })),
}))

vi.mock('@/lib/pdf-actions', () => ({
  canShareFiles: () => false,
  isStandaloneApp: () => false,
  printPdfUrl: vi.fn(),
  downloadPdfUrl: vi.fn(),
  sharePdfFile: vi.fn(),
}))

import { PdfDocumentView } from './PdfDocumentView'

describe('PdfDocumentView', () => {
  it('renders the viewer and the action bar together', async () => {
    render(
      <PdfDocumentView
        url="/api/admin/gift-cards/card-1/pdf?inline=1"
        downloadUrl="/api/admin/gift-cards/card-1/pdf"
        filename="Gift Card - 0001.pdf"
        title="GIFT CARD 0001"
        onBack={() => {}}
      />,
    )

    expect(screen.getByTestId('pdf-document-view')).toBeTruthy()
    expect(screen.getByTitle('GIFT CARD 0001').getAttribute('data-pdf-src')).toBe(
      '/api/admin/gift-cards/card-1/pdf?inline=1',
    )
    expect(screen.getByTestId('pdf-action-bar')).toBeTruthy()
    expect(screen.getByTestId('pdf-back')).toBeTruthy()
    expect(screen.getByTestId('pdf-print')).toBeTruthy()
    expect(screen.getByTestId('pdf-download')).toBeTruthy()
    expect(screen.getByTestId('pdf-open')).toBeTruthy()
    expect(await screen.findByText('PREVIEW UNAVAILABLE')).toBeTruthy()
  })
})
