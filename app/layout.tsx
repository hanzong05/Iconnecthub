import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import { preconnect } from 'react-dom'
import './globals.css'

// DM Sans (variable, weights 100-1000, SIL Open Font License) is served from this project: no request to Google,
// no render-blocking stylesheet, and the build works offline. The file is preloaded by Next.
const dmSans = localFont({ src: './fonts/dm-sans-latin-wght-normal.woff2', weight: '100 1000', display: 'swap', variable: '--font-dm-sans' })

const ICON = 'https://assets.cdn.filesafe.space/Sk7XUXxjVtIrJHKp3GhX/media/6a5634ab46ff6bf8017aab21.png'
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, '')

export const metadata: Metadata = {
  ...(SITE_URL ? { metadataBase: new URL(SITE_URL), alternates: { canonical: '/' } } : {}),
  title: { default: 'iConnectHub Admin – Sign in', template: '%s – iConnectHub Admin' },
  description: 'Sign in to the iConnectHub admin control panel to manage your campground or RV resort hub: announcements, events, guest chat, newsletters and settings.',
  applicationName: 'iConnectHub Admin',
  icons: { icon: ICON, apple: ICON },
  openGraph: {
    type: 'website',
    siteName: 'iConnectHub Admin',
    title: 'iConnectHub Admin',
    description: 'The admin control panel for iConnectHub guest apps. Powered by BlueSpot.',
    images: [{ url: ICON, width: 512, height: 512, alt: 'iConnectHub' }],
  },
  twitter: { card: 'summary', title: 'iConnectHub Admin', description: 'The admin control panel for iConnectHub guest apps.', images: [ICON] },
  // The sign-in page may be found by its name; everything behind it is kept out (see app/robots.ts and the dashboard layout).
  robots: { index: true, follow: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1a56db',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Open the connections the first screen needs while the HTML is still arriving.
  preconnect('https://assets.cdn.filesafe.space')
  preconnect('https://wsrv.nl')
  return (
    <html lang="en" className={dmSans.variable}>
      <body>{children}</body>
    </html>
  )
}
