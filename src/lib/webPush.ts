import type { SupabaseClient } from '@supabase/supabase-js'

export const DEFAULT_VAPID_PUBLIC_KEY =
  import.meta.env.VITE_VAPID_PUBLIC_KEY ||
  'BMfj1Q3ueoxrWBpj6ivhvD9lnCilu6dBTWYKD1UIp1r5MaaFPrEYexNb1E9edIpUrSw8NCFbq1TgFsLo-kMzWPg'

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export function isPushNotificationSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export function isPwaInstalled(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // @ts-expect-error navigator.standalone exists on iOS Safari
    Boolean(navigator.standalone)
  )
}

export function isIosDevice(): boolean {
  if (typeof window === 'undefined') return false
  const ua = window.navigator.userAgent.toLowerCase()
  return /iphone|ipad|ipod/.test(ua)
}

export function getNotificationPermission(): NotificationPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'default'
  return Notification.permission
}

export async function getExistingPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushNotificationSupported()) return null
  try {
    const registration = await navigator.serviceWorker.ready
    return await registration.pushManager.getSubscription()
  } catch (err) {
    console.warn('Erro ao obter assinatura push existente:', err)
    return null
  }
}

export async function subscribeToPush(
  vapidPublicKey: string = DEFAULT_VAPID_PUBLIC_KEY,
): Promise<PushSubscription> {
  if (!isPushNotificationSupported()) {
    throw new Error('Notificações push não são suportadas neste navegador/dispositivo.')
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('Permissão para notificações foi negada.')
  }

  const registration = await navigator.serviceWorker.ready
  const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey)

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey,
  })

  return subscription
}

export async function unsubscribeFromPush(): Promise<boolean> {
  if (!isPushNotificationSupported()) return false
  const subscription = await getExistingPushSubscription()
  if (!subscription) return true
  return await subscription.unsubscribe()
}

export type PushUserDetails = {
  userId?: string | null
  email?: string | null
  systemSource?: 'v1' | 'v2'
}

export async function savePushSubscriptionToSupabase(
  supabase: SupabaseClient,
  subscription: PushSubscription,
  userDetails: PushUserDetails = {},
): Promise<{ success: boolean; error?: string }> {
  try {
    const json = subscription.toJSON()
    const endpoint = subscription.endpoint
    const p256dh = json.keys?.p256dh || ''
    const auth = json.keys?.auth || ''

    if (!endpoint || !p256dh || !auth) {
      return { success: false, error: 'Chaves da assinatura push incompletas.' }
    }

    const payload = {
      endpoint,
      p256dh,
      auth,
      user_id: userDetails.userId || null,
      user_email: userDetails.email?.toLowerCase().trim() || null,
      system_source: userDetails.systemSource || 'v1',
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(payload, { onConflict: 'endpoint' })

    if (error) {
      console.warn('Falha ao salvar push_subscription no Supabase (verifique se a migration foi aplicada):', error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { success: false, error: msg }
  }
}

export async function removePushSubscriptionFromSupabase(
  supabase: SupabaseClient,
  endpoint: string,
): Promise<void> {
  try {
    await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
  } catch (err) {
    console.warn('Erro ao remover push_subscription do Supabase:', err)
  }
}

export async function sendLocalTestNotification(
  title: string = 'Bem Aviv Hub — Notificação de Teste',
  body: string = 'O sistema de notificações Web Push está funcionando perfeitamente!',
  url: string = '/bem-aviv',
): Promise<void> {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    throw new Error('Permissão de notificação não concedida.')
  }

  const registration = await navigator.serviceWorker.ready
  await registration.showNotification(title, {
    body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: 'test-notification',
    data: { url },
  })
}
