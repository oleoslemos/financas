/**
 * Lista de e-mails permitidos via VITE_ALLOWED_EMAILS (separados por vírgula ou ponto e vírgula).
 * Se vazio ou ausente, não há restrição no app (use também o painel do Clerk para bloquear cadastros).
 * Nota: valores VITE_* entram no bundle público — não use para segredos.
 */
export function getAllowedEmailSet(): Set<string> | null {
  const raw = import.meta.env.VITE_ALLOWED_EMAILS?.trim()
  if (!raw) return null
  const parts = raw
    .split(/[,;]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  if (parts.length === 0) return null
  return new Set(parts)
}

export function isEmailAllowed(email: string | undefined | null, allowed: Set<string> | null): boolean {
  if (allowed === null) return true
  if (!email) return false
  return allowed.has(email.trim().toLowerCase())
}
