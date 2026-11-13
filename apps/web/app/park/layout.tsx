import type { Metadata, Viewport } from 'next'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'PARKING',
  robots: { index: false, follow: false },
}

// The kiosk is a fixed, full-screen surface. iOS still allows pinch-zoom
// (Guided Access is the outer lock), but Android and desktop honour this.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#000000',
}

export default function ParkLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 overflow-hidden bg-black [overscroll-behavior:none] [touch-action:manipulation]">
      {children}
    </div>
  )
}
