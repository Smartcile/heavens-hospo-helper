import type { MetadataRoute } from 'next'

/**
 * Web app manifest — makes "Add to Home Screen" on iOS/Android open HOSPO OPS
 * as a standalone app (no browser chrome), which is how the worker and BEO
 * screens are meant to be used on a phone.
 */
export default function manifest(): MetadataRoute.Manifest {
  const appName = process.env.APP_NAME ?? process.env.NEXT_PUBLIC_APP_NAME ?? 'HOSPO OPS'
  const shortName = appName.length > 12 ? appName.slice(0, 12).trim() : appName

  return {
    name: appName,
    short_name: shortName,
    description: 'Hospitality operations platform',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0A0A0A',
    theme_color: '#0A0A0A',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
