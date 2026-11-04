'use client'

// Photo card for a room setup: label, pax/style, the dressed-room photos and a
// read-only table-plan thumbnail. Shared by the event header and the BEO
// ROOM_SETUP block so both show the same thing.

import { isRoomSetup, roomSetupLabel, type RoomSetupMeta } from '@/lib/room-setup'
import { SetupPlanThumbnail } from '@/components/SetupPlanThumbnail'

export interface RoomSetupOption extends RoomSetupMeta {
  id: string
  floorPlan?: { id: string; name: string; slug?: string } | null
}

export function RoomSetupCard({ setup }: { setup: RoomSetupOption }) {
  const photos = Array.isArray(setup.imageUrls) ? setup.imageUrls : []
  if (!isRoomSetup(setup) && photos.length === 0 && !setup.floorPlan) return null

  return (
    <div className="border border-grey-mid bg-black/40 p-2 space-y-2">
      <div>
        <p className="font-mono text-sm font-bold uppercase text-white tracking-wider">{roomSetupLabel(setup)}</p>
        <p className="font-mono text-xs uppercase text-grey-light">
          {setup.guestCapacity ? `${setup.guestCapacity} PAX` : 'PAX NOT SET'}
          {setup.setupStyle ? ` · ${setup.setupStyle.toUpperCase()}` : ''}
          {setup.floorPlan?.name ? ` · TABLE PLAN: ${setup.floorPlan.name}` : ''}
        </p>
      </div>

      {photos.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          {photos.map((url, i) => (
            <a key={url} href={url} target="_blank" rel="noreferrer" title="Open photo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`${roomSetupLabel(setup)} photo ${i + 1}`}
                className="h-16 w-16 object-cover border border-grey-mid hover:border-white"
              />
            </a>
          ))}
        </div>
      )}

      {setup.floorPlan?.id && (
        <div className="space-y-1">
          <p className="font-mono text-xs uppercase text-grey-light tracking-wider">TABLE PLAN</p>
          <SetupPlanThumbnail planId={setup.floorPlan.id} setupId={setup.id} className="h-40" />
        </div>
      )}
    </div>
  )
}
