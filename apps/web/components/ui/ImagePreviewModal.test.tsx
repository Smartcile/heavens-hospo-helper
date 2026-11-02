import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ImagePreviewModal } from './ImagePreviewModal'
import type { AnnotationData } from '@/lib/image-annotations'

const layer: AnnotationData = {
  shapes: [{ tool: 'pen', color: '#EF4444', width: 0.008, points: [{ x: 0.1, y: 0.1 }, { x: 0.4, y: 0.4 }] }],
  texts: [],
}

const mockResponse = (data: unknown, ok = true) => ({ ok, json: async () => data } as Response)

describe('ImagePreviewModal', () => {
  let putBody: Record<string, unknown> | null = null

  beforeEach(() => {
    putBody = null
    vi.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/admin/image-annotations') && init?.method === 'PUT') {
        putBody = JSON.parse(String(init.body))
        return mockResponse({ ok: true })
      }
      return mockResponse({}, false)
    })
  })

  afterEach(() => { vi.restoreAllMocks() })

  it('shows ANNOTATE for an admin usage and saves an empty layer when REMOVE LAYER is clicked', async () => {
    const onAnnotationSaved = vi.fn()
    render(
      <ImagePreviewModal
        imageUrl="/api/upload/a.png"
        usageKey="guide-step:s1"
        canEdit
        annotation={layer}
        onClose={() => {}}
        onAnnotationSaved={onAnnotationSaved}
      />,
    )
    expect(screen.getByText('✎ EDIT LAYER')).toBeTruthy()
    fireEvent.click(screen.getByText('REMOVE LAYER'))

    await waitFor(() => expect(putBody).toBeTruthy())
    expect(putBody).toMatchObject({
      usageKey: 'guide-step:s1',
      imageUrl: '/api/upload/a.png',
      data: { shapes: [], texts: [] },
    })
    expect(onAnnotationSaved).toHaveBeenCalledWith({ shapes: [], texts: [] })
  })

  it('hides the layer actions for a non-admin', () => {
    render(<ImagePreviewModal imageUrl="/api/upload/a.png" usageKey="guide-step:s1" canEdit={false} annotation={layer} onClose={() => {}} />)
    expect(screen.queryByText('✎ EDIT LAYER')).toBeNull()
    expect(screen.queryByText('✎ ANNOTATE')).toBeNull()
    expect(screen.queryByText('REMOVE LAYER')).toBeNull()
  })

  it('opens the annotator and returns to the preview after saving', async () => {
    render(<ImagePreviewModal imageUrl="/api/upload/a.png" usageKey="guide-step:s1" canEdit annotation={null} onClose={() => {}} />)
    fireEvent.click(screen.getByText('✎ ANNOTATE'))
    expect(screen.getByText('SAVE LAYER')).toBeTruthy()
    fireEvent.click(screen.getByText('SAVE LAYER'))
    await waitFor(() => expect(putBody).toBeTruthy())
    await waitFor(() => expect(screen.queryByText('SAVE LAYER')).toBeNull())
  })
})
