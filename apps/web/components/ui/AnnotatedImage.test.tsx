import { describe, it, expect } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { AnnotatedImage } from './AnnotatedImage'
import type { AnnotationData } from '@/lib/image-annotations'

const layer: AnnotationData = {
  shapes: [
    { tool: 'pen', color: '#EF4444', width: 0.01, points: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }] },
    { tool: 'arrow', color: '#22C55E', width: 0.01, points: [{ x: 0.2, y: 0.2 }, { x: 0.8, y: 0.8 }] },
    { tool: 'box', color: '#3B82F6', width: 0.01, points: [{ x: 0.3, y: 0.3 }, { x: 0.6, y: 0.7 }] },
  ],
  texts: [{ x: 0.4, y: 0.4, text: 'CHECK THIS', color: '#F59E0B', size: 0.05 }],
}

function loadImage(container: HTMLElement) {
  const img = container.querySelector('img') as HTMLImageElement
  Object.defineProperty(img, 'naturalWidth', { value: 800 })
  Object.defineProperty(img, 'naturalHeight', { value: 600 })
  fireEvent.load(img)
  return img
}

describe('AnnotatedImage', () => {
  it('draws the layer over the image once it has loaded', () => {
    const { container } = render(<AnnotatedImage src="/a.png" annotations={layer} />)
    expect(container.querySelector('svg')).toBeNull()
    loadImage(container)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('viewBox')).toBe('0 0 800 600')
    expect(svg.querySelector('polyline')).toBeTruthy()
    expect(svg.querySelector('polygon')).toBeTruthy()
    expect(svg.querySelector('rect')).toBeTruthy()
    expect(svg.querySelector('text')?.textContent).toBe('CHECK THIS')
  })

  it('renders no overlay for an empty layer', () => {
    const { container } = render(<AnnotatedImage src="/a.png" annotations={{ shapes: [], texts: [] }} />)
    loadImage(container)
    expect(container.querySelector('svg')).toBeNull()
  })

  it('renders no overlay when annotations are absent', () => {
    const { container } = render(<AnnotatedImage src="/a.png" />)
    loadImage(container)
    expect(container.querySelector('svg')).toBeNull()
  })
})
