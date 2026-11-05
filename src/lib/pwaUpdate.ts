import { registerSW } from 'virtual:pwa-register'

type UpdateCallback = (hasUpdate: boolean) => void
const listeners = new Set<UpdateCallback>()
let needRefreshState = false

export const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    console.log('[PWA] Nova versão do aplicativo detectada.')
    needRefreshState = true
    listeners.forEach((fn) => {
      try {
        fn(true)
      } catch {}
    })
  },
  onOfflineReady() {
    console.log('[PWA] Aplicativo pronto para uso offline.')
  },
})

// Quando o novo Service Worker ativa e assume o controle, recarrega a página automaticamente
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    console.log('[PWA] Service Worker atualizado. Recarregando aplicativo...')
    window.location.reload()
  })
}

export function subscribeToUpdate(cb: UpdateCallback): () => void {
  listeners.add(cb)
  cb(needRefreshState)
  return () => {
    listeners.delete(cb)
  }
}

/**
 * Força verificação e atualização completa do Service Worker e caches locais.
 * Útil para smartphones/PWAs onde o cache pode reter scripts antigos.
 */
export async function forceAppUpdate(): Promise<void> {
  try {
    if (typeof window !== 'undefined') {
      // 1. Dispara atualização de todos os service workers registrados
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations()
        for (const reg of registrations) {
          try {
            await reg.update()
            if (reg.waiting) {
              reg.waiting.postMessage({ type: 'SKIP_WAITING' })
            }
          } catch {}
        }
      }

      // 2. Limpa caches de runtime do navegador para puxar a versão nova da Vercel
      if ('caches' in window) {
        try {
          const keys = await caches.keys()
          await Promise.all(keys.map((k) => caches.delete(k)))
        } catch {}
      }
    }
  } catch (e) {
    console.warn('[PWA] Erro ao atualizar aplicativo:', e)
  }

  // 3. Recarrega a página ignorando cache
  if (typeof window !== 'undefined') {
    window.location.reload()
  }
}
