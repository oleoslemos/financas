import type { SupabaseClient } from '@supabase/supabase-js'

/** Nome fixo da categoria para faturas de cartão e itens (despesa). */
export const CREDIT_CARD_INVOICE_CATEGORY_NAME = 'CARTÃO DE CRÉDITO'

/** Garante categoria de despesa para o usuário; retorna o id ou null se falhar. */
export async function ensureCreditCardExpenseCategory(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data: existing } = await supabase
    .from('categories')
    .select('id')
    .eq('user_id', userId)
    .eq('name', CREDIT_CARD_INVOICE_CATEGORY_NAME)
    .maybeSingle()
  if (existing && 'id' in existing) return (existing as { id: string }).id

  const { data: created, error } = await supabase
    .from('categories')
    .insert({
      user_id: userId,
      name: CREDIT_CARD_INVOICE_CATEGORY_NAME,
      type: 'expense',
    })
    .select('id')
    .single()
  if (error) return null
  return (created as { id: string }).id
}
