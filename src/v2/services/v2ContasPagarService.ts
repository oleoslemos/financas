import { supabase } from '../../lib/supabaseClient'

export type StatusConta = 'aberta' | 'parcial' | 'paga' | 'cancelada' | 'vencida'
export type OrigemConta = 'compra' | 'avulsa' | 'recorrente'

export type ContaPagarParcela = {
  numero: number
  vencimento: string
  valor: number
  status: StatusConta
}

export type ContaPagar = {
  id: string
  descricao: string
  fornecedor: string | null
  origem: OrigemConta
  categoria: string | null
  total: number
  totalPago: number
  status: StatusConta
  parcelas: ContaPagarParcela[]
  created_at: string
  updated_at: string
}

const KEY = 'v2_contas_pagar'
const SUPABASE_TABLE = 'v2_contas_pagar'

export async function listContasPagar(): Promise<ContaPagar[]> {
  let list: ContaPagar[] = []
  if (supabase) {
    try {
      const { data, error } = await supabase.from(SUPABASE_TABLE).select('*').order('created_at', { ascending: false })
      if (!error && data) {
        list = data as ContaPagar[]
      }
    } catch {}
  }
  if (list.length === 0) {
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) list = JSON.parse(raw)
    } catch {}
  }
  return list
}

export async function saveContaPagar(conta: Omit<ContaPagar, 'id' | 'created_at' | 'updated_at'>): Promise<ContaPagar> {
  const current = await listContasPagar()
  
  const newConta: ContaPagar = {
    ...conta,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }

  if (supabase) {
    try {
      await supabase.from(SUPABASE_TABLE).insert([newConta])
    } catch {}
  }

  current.push(newConta)
  localStorage.setItem(KEY, JSON.stringify(current))

  return newConta
}
