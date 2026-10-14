/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { NetworkOnly } from 'workbox-strategies'

declare let self: ServiceWorkerGlobalScope

// Limpa caches antigos do Workbox
cleanupOutdatedCaches()

// Precache dos assets gerados pelo build do Vite
precacheAndRoute(self.__WB_MANIFEST || [])

// Evita que o SW intercepte chamadas externas para o Supabase ou Clerk
// Previne erros de CORS ou "Failed to fetch" em chamadas autenticadas
registerRoute(/^https:\/\/.*\.supabase\.(co|in)\/.*/i, new NetworkOnly())
registerRoute(/^https:\/\/.*\.clerk\..*/i, new NetworkOnly())

// ── Listener de Push Notification ──────────────────────────────
self.addEventListener('push', (event: PushEvent) => {
  if (!event.data) return

  try {
    const payload = event.data.json()
    const title = payload.title || 'Bem Aviv Hub'
    const options: NotificationOptions = {
      body: payload.body || 'Nova notificação do sistema',
      icon: payload.icon || '/pwa-192x192.png',
      badge: payload.badge || '/pwa-192x192.png',
      tag: payload.tag || 'bem-aviv-notification',
      data: payload.data || { url: payload.url || '/' },
    }

    event.waitUntil(self.registration.showNotification(title, options))
  } catch {
    const rawText = event.data.text()
    event.waitUntil(
      self.registration.showNotification('Bem Aviv Hub', {
        body: rawText,
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        data: { url: '/' },
      }),
    )
  }
})

// ── Ciclo de Vida do SW ─────────────────────────────────────────
self.addEventListener('install', () => {
  void self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// ── Listener de Clique na Notificação ──────────────────────────
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close()

  const rawUrl = event.notification.data?.url || '/'
  const targetUrl = new URL(rawUrl, self.location.origin).href

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clientList) => {
      // 1. Procura aba/janela aberta no mesmo domínio
      for (const client of clientList) {
        if ('focus' in client) {
          await client.focus()
          if ('navigate' in client && client.url !== targetUrl) {
            await client.navigate(targetUrl)
          }
          return
        }
      }
      // 2. Se nenhuma janela estiver aberta, abre uma nova
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl)
      }
    }),
  )
})

// Permite ao app solicitar skipWaiting
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    void self.skipWaiting()
  }
})
