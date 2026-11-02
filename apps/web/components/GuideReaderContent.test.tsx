import { describe, it, expect } from 'vitest'
import { render, fireEvent, screen, waitFor } from '@testing-library/react'
import { GuideReaderContent, type GuideReaderGuide } from './GuideReaderContent'
import type { AnnotationData } from '@/lib/image-annotations'

function layer(text: string): AnnotationData {
  return {
    shapes: [],
    texts: [{ x: 0.1, y: 0.1, text, color: '#EF4444', size: 0.05 }],
  }
}

function loadImages(container: HTMLElement) {
  for (const img of Array.from(container.querySelectorAll('img'))) {
    Object.defineProperty(img, 'naturalWidth', { value: 800, configurable: true })
    Object.defineProperty(img, 'naturalHeight', { value: 600, configurable: true })
    fireEvent.load(img)
  }
}

const guide: GuideReaderGuide = {
  title: 'GRILL SETUP',
  description: null,
  category: null,
  guideType: null,
  bodyHtml: null,
  isTracked: true,
  steps: [
    {
      id: 's1',
      heading: null,
      content: 'Check both sides.',
      imageUrl: null,
      imageUrls: ['/uploads/a.png', '/uploads/b.png'],
      videoUrl: null,
      imageAnnotations: [
        { imageUrl: '/uploads/a.png', data: layer('LEFT SIDE') },
        { imageUrl: '/uploads/b.png', data: layer('RIGHT SIDE') },
      ],
    },
  ],
}

describe('GuideReaderContent annotations', () => {
  it('renders each gallery photo with its matching annotation layer', () => {
    const { container } = render(<GuideReaderContent guide={guide} variant="worker" />)
    loadImages(container)

    const overlays = Array.from(container.querySelectorAll('svg'))
    expect(overlays).toHaveLength(2)
    expect(overlays.map((svg) => svg.querySelector('text')?.textContent)).toEqual(['LEFT SIDE', 'RIGHT SIDE'])
    // Each overlay must use the layer for its own photo, not the first one.
    expect(overlays[1].getAttribute('viewBox')).toBe('0 0 800 600')
  })

  it('renders an annotated step image with no gallery when there is only one photo', () => {
    const single: GuideReaderGuide = {
      ...guide,
      steps: [{
        ...guide.steps[0],
        imageUrls: ['/uploads/a.png'],
        imageAnnotations: [{ imageUrl: '/uploads/a.png', data: layer('ONLY PHOTO') }],
      }],
    }
    const { container } = render(<GuideReaderContent guide={single} variant="worker" />)
    const img = container.querySelector('img') as HTMLImageElement
    Object.defineProperty(img, 'naturalWidth', { value: 640, configurable: true })
    Object.defineProperty(img, 'naturalHeight', { value: 480, configurable: true })
    fireEvent.load(img)

    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    expect(svg!.querySelector('text')?.textContent).toBe('ONLY PHOTO')
  })

  it('carries the annotation into the full-size lightbox', async () => {
    const { container } = render(<GuideReaderContent guide={guide} variant="worker" />)
    loadImages(container)

    fireEvent.click(screen.getByLabelText('View step 1 image 2 full size'))
    const dialog = screen.getByRole('dialog')
    loadImages(dialog)

    await waitFor(() => expect(dialog.querySelector('svg text')?.textContent).toBe('RIGHT SIDE'))
  })
})
