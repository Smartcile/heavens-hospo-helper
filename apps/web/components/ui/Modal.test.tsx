import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Modal } from '@/components/ui/Modal'

function renderModal(props: Partial<Parameters<typeof Modal>[0]> = {}) {
  const onClose = vi.fn()
  render(
    <Modal isOpen onClose={onClose} title="EDIT PRODUCT" {...props}>
      <p>BODY</p>
    </Modal>,
  )
  return { onClose }
}

function backdropFor(text = 'BODY'): HTMLElement {
  return screen.getByText(text).closest('.fixed') as HTMLElement
}

describe('Modal unsaved-changes guard', () => {
  it('closes on backdrop and Escape when clean', () => {
    const { onClose } = renderModal()

    fireEvent.click(backdropFor())
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('asks before discarding when dirty, and DISCARD closes', () => {
    const { onClose } = renderModal({ dirty: true })

    fireEvent.click(backdropFor())
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByText('DISCARD CHANGES?')).toBeDefined()

    fireEvent.click(screen.getByText('DISCARD'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('keeps editing when KEEP EDITING is chosen', () => {
    const { onClose } = renderModal({ dirty: true })

    fireEvent.click(backdropFor())
    fireEvent.click(screen.getByText('KEEP EDITING'))

    expect(onClose).not.toHaveBeenCalled()
    expect(screen.queryByText('DISCARD CHANGES?')).toBeNull()
    expect(screen.getByText('BODY')).toBeDefined()
  })

  it('does not prompt on Escape after save marks the form clean', () => {
    const { onClose } = renderModal({ dirty: false })

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes only the confirm on Escape while the confirm is open', () => {
    const { onClose } = renderModal({ dirty: true })

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByText('DISCARD CHANGES?')).toBeDefined()
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByText('DISCARD CHANGES?')).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
  })
})
