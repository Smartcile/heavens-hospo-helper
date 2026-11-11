import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  canShareFiles: vi.fn(),
  isStandaloneApp: vi.fn(),
  printPdfUrl: vi.fn(),
  downloadPdfUrl: vi.fn(),
  sharePdfFile: vi.fn(),
}))

vi.mock('@/lib/pdf-actions', () => mocks)

import { PdfActionBar } from './PdfActionBar'

function baseProps() {
  return {
    url: '/api/admin/gift-cards/card-1/pdf?inline=1',
    downloadUrl: '/api/admin/gift-cards/card-1/pdf',
    filename: 'Gift Card - 0001.pdf',
    title: 'GIFT CARD 0001',
  }
}

beforeEach(() => {
  mocks.canShareFiles.mockReturnValue(false)
  mocks.isStandaloneApp.mockReturnValue(false)
  mocks.sharePdfFile.mockResolvedValue('shared')
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('PdfActionBar', () => {
  it('renders PRINT / DOWNLOAD / OPEN and wires the actions', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    render(<PdfActionBar {...baseProps()} />)

    expect(screen.queryByTestId('pdf-back')).toBeNull()
    expect(screen.queryByTestId('pdf-share')).toBeNull()

    fireEvent.click(screen.getByTestId('pdf-print'))
    expect(mocks.printPdfUrl).toHaveBeenCalledWith('/api/admin/gift-cards/card-1/pdf?inline=1')
    expect(screen.getByTestId('pdf-status').textContent).toBe('PRINTING…')

    fireEvent.click(screen.getByTestId('pdf-download'))
    expect(mocks.downloadPdfUrl).toHaveBeenCalledWith(
      '/api/admin/gift-cards/card-1/pdf',
      'Gift Card - 0001.pdf',
    )
    expect(screen.getByTestId('pdf-status').textContent).toBe('DOWNLOADED')

    fireEvent.click(screen.getByTestId('pdf-open'))
    expect(open).toHaveBeenCalledWith('/api/admin/gift-cards/card-1/pdf?inline=1', '_blank', 'noopener')
  })

  it('owns BACK when onBack is supplied', () => {
    const onBack = vi.fn()
    render(<PdfActionBar {...baseProps()} onBack={onBack} backLabel="BACK TO CARD" />)

    const back = screen.getByTestId('pdf-back')
    expect(back.textContent).toBe('BACK TO CARD')
    fireEvent.click(back)
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('shows BACK in a standalone app and uses history.back', () => {
    mocks.isStandaloneApp.mockReturnValue(true)
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    render(<PdfActionBar {...baseProps()} />)

    fireEvent.click(screen.getByTestId('pdf-back'))
    expect(back).toHaveBeenCalledTimes(1)
  })

  it('uses thumb-sized buttons and keeps the safe-area clearance', () => {
    mocks.canShareFiles.mockReturnValue(true)
    render(<PdfActionBar {...baseProps()} onBack={() => {}} />)

    const bar = screen.getByTestId('pdf-action-bar')
    expect(bar.className).toContain('env(safe-area-inset-bottom)')
    expect(bar.className).toContain('flex-nowrap')
    for (const id of ['pdf-back', 'pdf-print', 'pdf-share', 'pdf-download', 'pdf-open']) {
      expect(screen.getByTestId(id).className).toContain('min-h-11')
    }
  })

  it('shows SHARE when files can be shared and reports SHARED', async () => {
    mocks.canShareFiles.mockReturnValue(true)
    render(<PdfActionBar {...baseProps()} />)

    fireEvent.click(screen.getByTestId('pdf-share'))
    expect(await screen.findByText('SHARED')).toBeTruthy()
    expect(mocks.sharePdfFile).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/admin/gift-cards/card-1/pdf?inline=1',
        filename: 'Gift Card - 0001.pdf',
        title: 'GIFT CARD 0001',
      }),
    )
  })

  it('reports a cancelled share', async () => {
    mocks.canShareFiles.mockReturnValue(true)
    mocks.sharePdfFile.mockResolvedValue('cancelled')
    render(<PdfActionBar {...baseProps()} />)

    fireEvent.click(screen.getByTestId('pdf-share'))
    expect(await screen.findByText('SHARE CANCELLED')).toBeTruthy()
  })

  it('reports a download fallback', async () => {
    mocks.canShareFiles.mockReturnValue(true)
    mocks.sharePdfFile.mockResolvedValue('downloaded')
    render(<PdfActionBar {...baseProps()} />)

    fireEvent.click(screen.getByTestId('pdf-share'))
    await waitFor(() => expect(screen.getByTestId('pdf-status').textContent).toBe('DOWNLOADED INSTEAD'))
  })
})
