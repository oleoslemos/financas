function parseCsv(v?: string | null): string[] {
  return (v ?? '')
    .split(/[,;]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

export function resolveDataOwnerId(currentUserId?: string | null, currentUserEmail?: string | null): string | null {
  // Global override (existing behavior): when VITE_SHARED_DATA_OWNER_ID is set,
  // you can optionally restrict it to a list of e-mails via VITE_SHARED_EMAILS.
  const forced = (import.meta.env.VITE_SHARED_DATA_OWNER_ID as string | undefined)?.trim()
  const emailCandidates = parseCsv(currentUserEmail)
  const sharedEmails = parseCsv(import.meta.env.VITE_SHARED_EMAILS as string | undefined)
  const allowedEmails = parseCsv(import.meta.env.VITE_ALLOWED_EMAILS as string | undefined)
  if (forced) {
    // Backward compatible: if no list is provided, force for everyone.
    if (sharedEmails.length === 0) return forced
    if (emailCandidates.some((e) => sharedEmails.includes(e))) return forced
    // Defensive fallback: in setups where VITE_SHARED_EMAILS is stale/missing for
    // an authorized account, allow shared owner for e-mails already allowed in app.
    if (allowedEmails.length > 0 && emailCandidates.some((e) => allowedEmails.includes(e))) return forced
  }

  return currentUserId ?? null
}
