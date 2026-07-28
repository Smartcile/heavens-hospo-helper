// Pure helper for the middleware demo write-block logic.
// Extracted for testability.

export type DemoBlockToken = {
  venueIsDemo?: boolean
  role?: string
}

export function shouldBlockDemoWrite(
  pathname: string,
  method: string,
  token: DemoBlockToken | null,
): boolean {
  if (!pathname.startsWith('/api/admin/')) return false
  const writeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
  if (!writeMethods.has(method)) return false
  if (!token) return false
  return token.venueIsDemo === true && token.role !== 'ADMIN'
}
