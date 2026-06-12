import type { Metadata } from 'next'
import './globals.css'
import { Providers } from '@/components/Providers'

export const metadata: Metadata = {
  title: process.env.APP_NAME ?? 'HOSPO OPS',
  description: 'Hospitality operations platform',
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
