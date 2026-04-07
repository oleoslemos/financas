export function resolveDataOwnerId(currentUserId?: string | null): string | null {
  const forced = (import.meta.env.VITE_SHARED_DATA_OWNER_ID as string | undefined)?.trim()
  if (forced) return forced
  return currentUserId ?? null
}
