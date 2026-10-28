import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'iConnectHub Admin',
    short_name: 'iConnectHub',
    description: 'Admin control panel for iConnectHub guest apps.',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#f0f4ff',
    theme_color: '#1a56db',
    icons: [{ src: 'https://assets.cdn.filesafe.space/Sk7XUXxjVtIrJHKp3GhX/media/6a5634ab46ff6bf8017aab21.png', sizes: '512x512', type: 'image/png' }],
  }
}
