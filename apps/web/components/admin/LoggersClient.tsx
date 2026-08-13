'use client'

import { getActiveVenueId } from '@/lib/active-venue'

interface LoggersClientProps {
  role: string
  sessionVenueId: string
  defaultVenueId?: string | null
}

// Logger dashboard — manual fridge/freezer logs land in the TASKS tab as
// READING completions; the sensor fleet (ESP32 + DS18B20/SHT nodes,
// /api/sensors/reading, min/max per day, calibration) arrives with the sensor
// phase. This tab exists so the hub's tab bar is stable.
export function LoggersClient({ role, sessionVenueId, defaultVenueId }: LoggersClientProps) {
  const venueId = getActiveVenueId(role, sessionVenueId, defaultVenueId)

  return (
    <div className="border border-grey-mid p-4 space-y-4">
      <h1 className="font-mono text-xl font-bold uppercase tracking-widest">LOGGERS</h1>
      <p className="font-mono text-xs text-grey-light">
        Manual fridge/freezer temperatures are recorded as READING tasks on the TASKS tab. The
        sensor fleet dashboard (ESP32 + DS18B20/SHT nodes, automatic min/max per day, calibration
        tracking) ships with the sensor phase — see ROADMAP.
      </p>
      {!venueId && (
        <p className="font-mono text-xs text-danger">NO VENUE SELECTED — CHOOSE A VENUE IN THE SIDEBAR</p>
      )}
    </div>
  )
}
