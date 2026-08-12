import { redirect } from 'next/navigation'
import { hubUrl, forwardSearch } from './hub-tabs'

/** Server-only helper for the old standalone pages: land on the right hub tab
 *  while preserving any other query params (e.g. ?date= from external links). */
export function hubRedirect(
  base: string,
  tab: string,
  sub?: string | null,
  searchParams?: Record<string, string | string[] | undefined>,
) {
  redirect(hubUrl(base, tab, sub, forwardSearch(searchParams)))
}
