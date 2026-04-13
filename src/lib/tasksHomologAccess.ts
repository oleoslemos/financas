const DEFAULT_HOMOLOG_EMAILS = ['leoslemos@gmail.com']

export function getTasksHomologEmailSet(): Set<string> {
  const raw = import.meta.env.VITE_TASKS_HOMOLOG_EMAILS?.trim()
  const source = raw
    ? String(raw)
        .split(/[,;]/)
        .map((s: string) => s.trim().toLowerCase())
        .filter(Boolean)
    : DEFAULT_HOMOLOG_EMAILS
  return new Set(source)
}

export function canAccessTasksHomolog(email: string | undefined | null): boolean {
  if (!email) return false
  return getTasksHomologEmailSet().has(email.trim().toLowerCase())
}
