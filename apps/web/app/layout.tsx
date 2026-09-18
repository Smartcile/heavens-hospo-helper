import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Providers } from '@/components/Providers'

const appName = process.env.APP_NAME ?? process.env.NEXT_PUBLIC_APP_NAME ?? 'HOSPO OPS'

export const metadata: Metadata = {
  title: appName,
  description: 'Hospitality operations platform',
  applicationName: appName,
  manifest: '/manifest.webmanifest',
  // iOS home-screen behaviour: standalone window, black status bar (matches the
  // dark shell), and the app name under the icon.
  appleWebApp: {
    capable: true,
    title: appName,
    statusBarStyle: 'black',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  // Stop iOS auto-linking phone numbers / dates as links in the UI.
  formatDetection: { telephone: false, date: false, address: false, email: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Draw under the notch/home indicator; the safe-area utilities in globals.css
  // keep fixed bars clear of it.
  viewportFit: 'cover',
  themeColor: '#0A0A0A',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-black text-white font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
