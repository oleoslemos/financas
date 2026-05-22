/** Confirmação da empresa ativa na sessão do navegador (aba). Com 2+ vínculos, exige escolha antes do hub. */

export function companyPickerSessionKey(userId: string | undefined): string {
  return userId ? `sistema-financeiro.companyPickerConfirmed.${userId}` : ''
}

export function isCompanyPickerConfirmed(userId: string | undefined): boolean {
  if (!userId) return false
  try {
    return sessionStorage.getItem(companyPickerSessionKey(userId)) === '1'
  } catch {
    return false
  }
}

export function markCompanyPickerConfirmed(userId: string | undefined): void {
  if (!userId) return
  try {
    sessionStorage.setItem(companyPickerSessionKey(userId), '1')
  } catch {
    /* ignore */
  }
}

export function clearCompanyPickerConfirmed(userId: string | undefined): void {
  if (!userId) return
  try {
    sessionStorage.removeItem(companyPickerSessionKey(userId))
  } catch {
    /* ignore */
  }
}
