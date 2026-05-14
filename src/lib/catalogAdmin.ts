const CATALOG_FULL_ADMIN_EMAIL = 'leoslemos@gmail.com'

export function isCatalogFullAdminEmail(email: string | undefined | null): boolean {
  if (!email) return false
  return email.trim().toLowerCase() === CATALOG_FULL_ADMIN_EMAIL
}

/** Qualquer e-mail verificado ou primário do Clerk bater com o administrador do catálogo. */
export function isCatalogFullAdminUser(emails: string[]): boolean {
  return emails.some((e) => isCatalogFullAdminEmail(e))
}
