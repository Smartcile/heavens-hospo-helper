import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  useWorkerImmersive: vi.fn(),
  PdfDocumentView: vi.fn(),
}))

vi.mock('@/components/worker/useWorkerImmersive', () => ({
  useWorkerImmersive: mocks.useWorkerImmersive,
}))

vi.mock('@/components/ui/PdfDocumentView', () => ({
  PdfDocumentView: (props: Record<string, unknown>) => {
    mocks.PdfDocumentView(props)
    return null
  },
}))

import { GiftCardPdfView } from './GiftCardPdfView'

beforeEach(() => {
  mocks.useWorkerImmersive.mockReset()
  mocks.PdfDocumentView.mockReset()
})

describe('GiftCardPdfView', () => {
  it('keeps the worker in the in-app viewer: inline URL, BACK, no OPEN or DOWNLOAD', () => {
    const onBack = vi.fn()
    render(<GiftCardPdfView cardId="card-1" number="20260001" onBack={onBack} />)

    expect(mocks.useWorkerImmersive).toHaveBeenCalledWith(true)
    expect(mocks.PdfDocumentView).toHaveBeenCalledTimes(1)

    const props = mocks.PdfDocumentView.mock.calls[0][0]
    expect(props).toMatchObject({
      url: '/api/worker/giftcards/card-1/pdf?inline=1',
      downloadUrl: '/api/worker/giftcards/card-1/pdf',
      filename: 'Gift Card - 20260001.pdf',
      title: 'GIFT CARD 20260001',
      onBack,
      backLabel: 'BACK TO CARD',
      showOpen: false,
      showDownload: false,
    })
  })
})
