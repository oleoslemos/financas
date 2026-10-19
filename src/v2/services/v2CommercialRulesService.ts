import { supabase } from '../../lib/supabaseClient'

export interface CommercialRules {
  margem_minima: number // ex: 20 (%)
  validade_proposta_dias: number // ex: 7 (dias)
  forma_pagamento_padrao: string // ex: 'Pix'
  reservar_estoque_aprovacao: boolean
  exigir_assinatura_cliente: boolean
  permitir_estoque_insuficiente: boolean
  gerar_contas_receber_ao_aprovar: boolean
  adiantamento_ja_baixado: boolean
}

export const DEFAULT_COMMERCIAL_RULES: CommercialRules = {
  margem_minima: 20,
  validade_proposta_dias: 7,
  forma_pagamento_padrao: 'Pix',
  reservar_estoque_aprovacao: true,
  exigir_assinatura_cliente: false,
  permitir_estoque_insuficiente: true,
  gerar_contas_receber_ao_aprovar: true,
  adiantamento_ja_baixado: true,
}

const STORAGE_KEY = 'v2_regras_comerciais_config'
const SUPABASE_TABLE = 'v2_regras_comerciais'

export async function getCommercialRules(): Promise<CommercialRules> {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from(SUPABASE_TABLE)
        .select('*')
        .eq('id', 'global_config')
        .maybeSingle()

      if (!error && data) {
        return {
          margem_minima: Number(data.margem_minima ?? DEFAULT_COMMERCIAL_RULES.margem_minima),
          validade_proposta_dias: Number(data.validade_proposta_dias ?? DEFAULT_COMMERCIAL_RULES.validade_proposta_dias),
          forma_pagamento_padrao: data.forma_pagamento_padrao || DEFAULT_COMMERCIAL_RULES.forma_pagamento_padrao,
          reservar_estoque_aprovacao: Boolean(data.reservar_estoque_aprovacao ?? DEFAULT_COMMERCIAL_RULES.reservar_estoque_aprovacao),
          exigir_assinatura_cliente: Boolean(data.exigir_assinatura_cliente ?? DEFAULT_COMMERCIAL_RULES.exigir_assinatura_cliente),
          permitir_estoque_insuficiente: Boolean(data.permitir_estoque_insuficiente ?? DEFAULT_COMMERCIAL_RULES.permitir_estoque_insuficiente),
          gerar_contas_receber_ao_aprovar: Boolean(data.gerar_contas_receber_ao_aprovar ?? DEFAULT_COMMERCIAL_RULES.gerar_contas_receber_ao_aprovar),
          adiantamento_ja_baixado: Boolean(data.adiantamento_ja_baixado ?? DEFAULT_COMMERCIAL_RULES.adiantamento_ja_baixado),
        }
      }
    } catch {}
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULT_COMMERCIAL_RULES, ...JSON.parse(raw) }
  } catch {}

  return DEFAULT_COMMERCIAL_RULES
}

export async function saveCommercialRules(rules: CommercialRules): Promise<void> {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rules))
  } catch {}

  if (supabase) {
    try {
      await supabase.from(SUPABASE_TABLE).upsert({
        id: 'global_config',
        margem_minima: rules.margem_minima,
        validade_proposta_dias: rules.validade_proposta_dias,
        forma_pagamento_padrao: rules.forma_pagamento_padrao,
        reservar_estoque_aprovacao: rules.reservar_estoque_aprovacao,
        exigir_assinatura_cliente: rules.exigir_assinatura_cliente,
        permitir_estoque_insuficiente: rules.permitir_estoque_insuficiente,
        gerar_contas_receber_ao_aprovar: rules.gerar_contas_receber_ao_aprovar,
        adiantamento_ja_baixado: rules.adiantamento_ja_baixado,
        updated_at: new Date().toISOString(),
      })
    } catch {}
  }
}
