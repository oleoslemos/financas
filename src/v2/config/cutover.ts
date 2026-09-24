export const V2_STORAGE_KEY = 'lsh_v2_active_default'

export function isV2DefaultActive(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(V2_STORAGE_KEY) === 'true'
}

export function setV2DefaultActive(active: boolean): void {
  if (typeof window === 'undefined') return
  if (active) {
    localStorage.setItem(V2_STORAGE_KEY, 'true')
  } else {
    localStorage.removeItem(V2_STORAGE_KEY)
  }
}
