function onlyDigits(value: string): string {
  return value.replace(/\D/g, '')
}

export function normalizePhoneForWhatsapp(rawPhone?: string | null): string | null {
  const digits = onlyDigits(rawPhone ?? '')
  if (!digits) return null

  if (digits.startsWith('55')) {
    if (digits.length < 12 || digits.length > 13) return null
    return digits
  }

  if (digits.length < 10 || digits.length > 11) return null
  return `55${digits}`
}

export function buildWhatsappUrl(rawPhone?: string | null): string | null {
  const normalized = normalizePhoneForWhatsapp(rawPhone)
  if (!normalized) return null
  return `https://wa.me/${normalized}`
}
