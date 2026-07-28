export function getActiveVenueId(role: string, sessionVenueId: string, defaultVenueId?: string | null): string {
  if (role === 'MANAGER') return sessionVenueId

  if (typeof document !== 'undefined') {
    const cookie = document.cookie
      .split('; ')
      .find((r) => r.startsWith('admin-active-venue='))
      ?.split('=')[1]
    if (cookie) return cookie
  }

  return defaultVenueId ?? ''
}
