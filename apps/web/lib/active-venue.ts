export function getActiveVenueId(role: string, sessionVenueId: string, defaultVenueId?: string | null): string {
  if (role === 'MANAGER') return sessionVenueId

  if (typeof document !== 'undefined') {
    for (const entry of document.cookie.split('; ')) {
      if (entry.startsWith('admin-active-venue=')) {
        return entry.substring('admin-active-venue='.length)
      }
    }
  }

  return defaultVenueId ?? ''
}
