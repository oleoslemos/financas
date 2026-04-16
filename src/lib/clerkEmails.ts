/** Retorna e-mails candidatos (primário + verificados), normalizados e sem duplicidade. */
export function clerkEmailCandidates(user: any): string[] {
  const set = new Set<string>()
  const primary = (user?.primaryEmailAddress?.emailAddress ?? '').trim().toLowerCase()
  if (primary) set.add(primary)
  const verified =
    user?.emailAddresses
      ?.filter((a: any) => a?.verification?.status === 'verified')
      .map((a: any) => (a?.emailAddress ?? '').trim().toLowerCase()) ?? []
  for (const e of verified) if (e) set.add(e)
  return [...set]
}

