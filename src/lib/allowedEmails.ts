/**
 * Lista de e-mails permitidos via VITE_ALLOWED_EMAILS (separados por vírgula ou ponto e vírgula).
 * Opcional: VITE_ALLOWED_EMAILS_BY_HOST — JSON mapa hostname → mesma lista CSV.
 * Se vazio ou ausente, não há restrição no app (use também o painel do Clerk para bloquear cadastros).
 * Nota: valores VITE_* entram no bundle público — não use para segredos.
 */
export function getAllowedEmailSet(): Set<string> | null {
  const raw = import.meta.env.VITE_ALLOWED_EMAILS?.trim()
  if (!raw) return null
  return parseEmailListToSet(raw)
}

function parseEmailListToSet(raw: string): Set<string> | null {
  const parts = raw
    .split(/[,;]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  if (parts.length === 0) return null
  return new Set(parts)
}

/** Host em minúsculas, sem porta (ex.: bemaviv.vercel.app). */
export function normalizeHostname(hostname: string | undefined | null): string {
  if (!hostname) return ''
  const h = hostname.trim().toLowerCase()
  const noPort = h.includes(':') ? h.split(':')[0] ?? h : h
  return noPort
}

/**
 * Conjunto de e-mails permitidos para o host atual (Opção B: um build, regra por host).
 * Ordem: VITE_ALLOWED_EMAILS_BY_HOST[host] → VITE_ALLOWED_EMAILS → sem restrição.
 */
export function getAllowedEmailSetForHostname(hostname: string | undefined | null): Set<string> | null {
  const host = normalizeHostname(hostname)
  const rawMap = (import.meta.env.VITE_ALLOWED_EMAILS_BY_HOST as string | undefined)?.trim()
  if (rawMap && host) {
    try {
      const map = JSON.parse(rawMap) as Record<string, string>
      const entry = map[host] ?? map['*']
      if (typeof entry === 'string' && entry.trim()) {
        const set = parseEmailListToSet(entry)
        if (set) return set
      }
    } catch {
      /* JSON inválido: cai para VITE_ALLOWED_EMAILS */
    }
  }
  return getAllowedEmailSet()
}

export function isEmailAllowed(email: string | undefined | null, allowed: Set<string> | null): boolean {
  if (allowed === null) return true
  if (!email) return false
  return allowed.has(email.trim().toLowerCase())
}
