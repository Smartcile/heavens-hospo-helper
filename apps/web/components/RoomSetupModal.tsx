'use client'

// Shared room-setup editor used by the admin floor-plan editor and the worker
// floor plan. A room setup is a FloorPlanSetup with presentation metadata:
// room, pax, service style and photos. The table plan is the layout geometry and
// is edited on the canvas, never here.

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { MultiImagePicker } from '@/components/ui/MultiImagePicker'
import { normaliseRoomSetupInput, roomSetupLabel } from '@/lib/room-setup'

export interface RoomSetupDraft {
  name: string
  roomName: string
  guestCapacity: string
  setupStyle: string
  notes: string
  imageUrls: string[]
}

export function emptyRoomSetupDraft(): RoomSetupDraft {
  return { name: '', roomName: '', guestCapacity: '', setupStyle: '', notes: '', imageUrls: [] }
}

export function roomSetupDraftFrom(row: {
  name: string
  roomName?: string | null
  guestCapacity?: number | null
  setupStyle?: string | null
  notes?: string | null
  imageUrls?: string[] | null
}): RoomSetupDraft {
  return {
    name: row.name ?? '',
    roomName: row.roomName ?? '',
    guestCapacity: row.guestCapacity == null ? '' : String(row.guestCapacity),
    setupStyle: row.setupStyle ?? '',
    notes: row.notes ?? '',
    imageUrls: Array.isArray(row.imageUrls) ? row.imageUrls : [],
  }
}

export interface RoomSetupPayload {
  name: string
  roomName: string | null
  guestCapacity: number | null
  setupStyle: string | null
  notes: string | null
  imageUrls: string[]
}

export function roomSetupPayload(draft: RoomSetupDraft): RoomSetupPayload {
  return {
    name: draft.name.trim().toUpperCase(),
    notes: draft.notes.trim() || null,
    ...normaliseRoomSetupInput(draft),
  }
}

const fieldClass =
  'w-full bg-black border border-grey-mid text-white font-mono text-xs px-2 py-1.5 outline-none focus:border-white placeholder:text-grey-light'

export function RoomSetupModal({
  isOpen,
  title,
  value,
  onChange,
  onClose,
  onSave,
  saving,
  error,
  uploadEndpoint = '/api/admin/upload',
}: {
  isOpen: boolean
  title: string
  value: RoomSetupDraft
  onChange: (draft: RoomSetupDraft) => void
  onClose: () => void
  onSave: () => void
  saving?: boolean
  error?: string
  uploadEndpoint?: string
}) {
  function patch(p: Partial<RoomSetupDraft>) {
    onChange({ ...value, ...p })
  }

  const preview = roomSetupLabel({
    name: value.name || 'SETUP',
    roomName: value.roomName,
    guestCapacity: Number(value.guestCapacity) || null,
    setupStyle: value.setupStyle,
  })

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="lg">
      <div className="space-y-3">
        <p className="font-mono text-xs uppercase text-grey-light">
          THE TABLE PLAN IS THE LAYOUT ON THE CANVAS. THIS DESCRIBES THE DRESSED ROOM.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input
            label="Setup name"
            value={value.name}
            placeholder="WEDDING A"
            onChange={(e) => patch({ name: e.target.value })}
          />
          <Input
            label="Room"
            value={value.roomName}
            placeholder="FUNCTION ROOM"
            onChange={(e) => patch({ roomName: e.target.value })}
          />
          <Input
            label="Pax"
            type="number"
            min={0}
            value={value.guestCapacity}
            placeholder="22"
            onChange={(e) => patch({ guestCapacity: e.target.value })}
          />
          <Input
            label="Style"
            value={value.setupStyle}
            placeholder="SIT DOWN / COCKTAIL"
            onChange={(e) => patch({ setupStyle: e.target.value })}
          />
        </div>

        <div className="border border-grey-mid bg-black/40 px-3 py-2">
          <span className="font-mono text-xs uppercase text-grey-light">LABEL</span>
          <p className="font-mono text-sm text-white uppercase">{preview}</p>
        </div>

        <div>
          <label className="block font-mono text-xs uppercase text-grey-light mb-1">Setup notes</label>
          <textarea
            value={value.notes}
            rows={3}
            onChange={(e) => patch({ notes: e.target.value })}
            className={`${fieldClass} resize-y`}
            placeholder="WHAT CHANGES FOR THIS SETUP"
          />
        </div>

        <MultiImagePicker
          label="Photos of the setup"
          value={value.imageUrls}
          onChange={(imageUrls) => patch({ imageUrls })}
          endpoint={uploadEndpoint}
        />

        {error && <p className="font-mono text-xs uppercase text-danger">{error}</p>}

        <div className="flex justify-end gap-2 border-t border-grey-mid pt-3">
          <Button size="sm" variant="ghost" onClick={onClose} disabled={saving}>CANCEL</Button>
          <Button size="sm" onClick={onSave} loading={saving} disabled={!value.name.trim()}>SAVE SETUP</Button>
        </div>
      </div>
    </Modal>
  )
}
