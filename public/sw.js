// Receives web-push messages for admins (for example a new guest chat message) and shows them,
// even when the admin page is closed.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }
  const title = data.title || 'iConnectHub'
  const options = {
    body: data.body || '',
    icon: data.icon || undefined,
    badge: data.badge || undefined,
    tag: data.tag || undefined,
    data: { url: (data.data && data.data.url) || data.url || '/dashboard/chat' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(event.notification.data?.url || '/dashboard/chat', self.location.origin)
  // Only ever open pages of this app.
  const url = target.origin === self.location.origin ? target.href : self.location.origin + '/dashboard'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(self.location.origin) && 'focus' in c) {
          c.navigate(url).catch(() => undefined)
          return c.focus()
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})
