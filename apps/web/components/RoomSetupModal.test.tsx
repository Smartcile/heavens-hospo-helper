import { useState } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import {
  RoomSetupModal,
  emptyRoomSetupDraft,
  roomSetupPayload,
  type RoomSetupDraft,
  type RoomSetupPayload,
} from '@/components/RoomSetupModal'

function Harness({ initial }: { initial?: RoomSetupDraft }) {
  const [draft, setDraft] = useState<RoomSetupDraft>(initial ?? emptyRoomSetupDraft())
  const [saved, setSaved] = useState<RoomSetupPayload | null>(null)
  return (
    <>
      <RoomSetupModal
        isOpen
        title="NEW ROOM SETUP"
        value={draft}
        onChange={setDraft}
        onClose={() => {}}
        onSave={() => setSaved(roomSetupPayload(draft))}
      />
      <pre data-testid="saved">{saved ? JSON.stringify(saved) : ''}</pre>
    </>
  )
}

describe('roomSetupPayload', () => {
  it('normalises the editor draft for the API', () => {
    expect(
      roomSetupPayload({
        name: ' wedding a ',
        roomName: ' main room ',
        guestCapacity: '22',
        setupStyle: 'sit down',
        notes: '  ',
        imageUrls: ['/api/upload/a.jpg', 'nope'],
      }),
    ).toEqual({
      name: 'WEDDING A',
      roomName: 'MAIN ROOM',
      guestCapacity: 22,
      setupStyle: 'SIT DOWN',
      notes: null,
      imageUrls: ['/api/upload/a.jpg'],
    })
  })
})

describe('RoomSetupModal', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ user: { role: 'STAFF' } }) }),
    ) as unknown as typeof fetch
  })
  afterEach(() => { vi.restoreAllMocks() })

  it('previews the room label as fields are filled in', () => {
    render(<Harness />)

    fireEvent.change(screen.getByPlaceholderText('FUNCTION ROOM'), { target: { value: 'Main Room' } })
    fireEvent.change(screen.getByPlaceholderText('22'), { target: { value: '22' } })
    fireEvent.change(screen.getByPlaceholderText('SIT DOWN / COCKTAIL'), { target: { value: 'Sit Down' } })

    expect(screen.getByText('MAIN ROOM - 22PAX SIT DOWN')).toBeTruthy()
  })

  it('requires a name before saving, then emits the normalised payload', () => {
    render(<Harness />)
    const save = screen.getByRole('button', { name: /SAVE SETUP/i })
    expect(save).toBeDisabled()

    fireEvent.change(screen.getByPlaceholderText('WEDDING A'), { target: { value: ' function setup ' } })
    expect(save).not.toBeDisabled()

    fireEvent.change(screen.getByPlaceholderText('FUNCTION ROOM'), { target: { value: 'Bar' } })
    fireEvent.change(screen.getByPlaceholderText('22'), { target: { value: '40' } })
    fireEvent.click(save)

    expect(JSON.parse(screen.getByTestId('saved').textContent ?? '{}')).toEqual({
      name: 'FUNCTION SETUP',
      roomName: 'BAR',
      guestCapacity: 40,
      setupStyle: null,
      notes: null,
      imageUrls: [],
    })
  })
})
