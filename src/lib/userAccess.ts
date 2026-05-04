/** Conta com acesso exclusivo ao módulo Bem Aviv (comercial). */
export const BEM_AVIV_ONLY_EMAIL = 'suelenjalves@gmail.com'

/** Conta que escolhe entre Financeiro (LSH), Bem Aviv e Projetos na entrada. */
export const MULTI_SYSTEM_EMAIL = 'leoslemos@gmail.com'

export const HUB_CHOICE_STORAGE_KEY = 'sistema-financeiro.hubChoice'

export type StoredHubChoice = 'lsh' | 'bem-aviv' | 'projetos'

export function isBemAvivOnlyUser(emails: string[]): boolean {
  return emails.includes(BEM_AVIV_ONLY_EMAIL)
}

export function isMultiSystemUser(emails: string[]): boolean {
  return emails.includes(MULTI_SYSTEM_EMAIL)
}

export function getStoredHubChoice(): StoredHubChoice | null {
  try {
    const v = localStorage.getItem(HUB_CHOICE_STORAGE_KEY)
    if (v === 'lsh' || v === 'bem-aviv' || v === 'projetos') return v
  } catch {
    /* private mode */
  }
  return null
}

export function setStoredHubChoice(choice: StoredHubChoice) {
  try {
    localStorage.setItem(HUB_CHOICE_STORAGE_KEY, choice)
  } catch {
    /* ignore */
  }
}

export function clearStoredHubChoice() {
  try {
    localStorage.removeItem(HUB_CHOICE_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
