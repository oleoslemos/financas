/** Slug da empresa padrão por host (alinhado a public.companies.slug). */
const BUILT_IN_DEFAULT_SLUG_BY_HOST: Record<string, string> = {
  'bemaviv.vercel.app': 'bem-aviv',
  'distribuidoreko7.vercel.app': 'comfortcare',
  localhost: 'bem-aviv',
}

function parseSlugByHostFromEnv(): Record<string, string> | null {
  const raw = (import.meta.env.VITE_DEFAULT_COMPANY_SLUG_BY_HOST as string | undefined)?.trim()
  if (!raw) return null
  try {
    const o = JSON.parse(raw) as Record<string, unknown>
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === 'string' && v.trim()) out[k.trim().toLowerCase()] = v.trim().toLowerCase()
    }
    return Object.keys(out).length ? out : null
  } catch {
    return null
  }
}

export function getDefaultCompanySlugForHostname(hostname: string | undefined | null): string {
  const host = (hostname ?? '').trim().toLowerCase().split(':')[0] ?? ''
  const fromEnv = parseSlugByHostFromEnv()
  if (fromEnv && host) {
    const s = fromEnv[host] ?? fromEnv['*']
    if (s) return s
  }
  return BUILT_IN_DEFAULT_SLUG_BY_HOST[host] ?? 'bem-aviv'
}
