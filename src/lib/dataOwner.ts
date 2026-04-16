function parseCsv(v?: string | null): string[] {
  return (v ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

export function resolveDataOwnerId(currentUserId?: string | null, currentUserEmail?: string | null): string | null {
  // Global override (existing behavior).
  const forced = (import.meta.env.VITE_SHARED_DATA_OWNER_ID as string | undefined)?.trim()
  if (forced) return forced

  // Bem Aviv: compartilhar dados por e-mail (ex.: usuário auxiliar enxergar o mesmo cadastro).
  // Configure:
  // - VITE_BEM_AVIV_SHARED_DATA_OWNER_ID=<clerk_user_id do dono dos dados>
  // - VITE_BEM_AVIV_SHARED_EMAILS=email1,email2,...
  const sharedOwner = (import.meta.env.VITE_BEM_AVIV_SHARED_DATA_OWNER_ID as string | undefined)?.trim()
  const sharedEmails = parseCsv(import.meta.env.VITE_BEM_AVIV_SHARED_EMAILS as string | undefined)
  const email = (currentUserEmail ?? '').trim().toLowerCase()
  if (sharedOwner && email && sharedEmails.includes(email)) return sharedOwner

  return currentUserId ?? null
}
