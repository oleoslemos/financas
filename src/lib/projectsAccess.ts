const DEFAULT_PROJECTS_EMAILS = ['leoslemos@gmail.com', 'llemos@rbdata.company']

export function getProjectsEmailSet(): Set<string> {
  const raw = import.meta.env.VITE_PROJECTS_EMAILS?.trim()
  const source = raw
    ? String(raw)
        .split(/[,;]/)
        .map((s: string) => s.trim().toLowerCase())
        .filter(Boolean)
    : DEFAULT_PROJECTS_EMAILS
  return new Set(source)
}

export function canAccessProjects(email: string | undefined | null): boolean {
  if (!email) return false
  return getProjectsEmailSet().has(email.trim().toLowerCase())
}
