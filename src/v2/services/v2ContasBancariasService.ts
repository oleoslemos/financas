import { supabase } from '../../lib/supabaseClient'

export type ContaBancaria = {
  id: string
  nome: string
  instituicao?: string
  tipo: 'corrente' | 'carteira' | 'poupanca' | 'investimento'
  saldoAtual: number
  cor?: string
  ativo: boolean
  created_at?: string
}

const STORAGE_KEY = 'v2_contas_bancarias'
// Versão do schema das contas – incrementar força reset do localStorage
const STORAGE_VERSION = 'v2'

const DEFAULT_CONTAS: ContaBancaria[] = [
  {
    id: 'conta-mercadopago',
    nome: 'MercadoPago',
    instituicao: 'Mercado Pago',
    tipo: 'carteira',
    saldoAtual: 0,
    cor: '#009EE3',
    ativo: true,
  },
  {
    id: 'conta-comissao-ls-mp',
    nome: 'Comissão LS - MercadoPago',
    instituicao: 'Mercado Pago',
    tipo: 'carteira',
    saldoAtual: 0,
    cor: '#0064A6',
    ativo: true,
  },
  {
    id: 'conta-impostos-mp',
    nome: 'Impostos - MercadoPago',
    instituicao: 'Mercado Pago',
    tipo: 'carteira',
    saldoAtual: 0,
    cor: '#C92A2A',
    ativo: true,
  },
  {
    id: 'conta-contabilidade-mp',
    nome: 'Contabilidade - MercadoPago',
    instituicao: 'Mercado Pago',
    tipo: 'carteira',
    saldoAtual: 0,
    cor: '#6741D9',
    ativo: true,
  },
]

function readFromStorage(): ContaBancaria[] {
  try {
    // Se a versão do storage mudou, reseta para o novo padrão
    const storedVersion = localStorage.getItem(STORAGE_KEY + '_version')
    if (storedVersion !== STORAGE_VERSION) {
      localStorage.removeItem(STORAGE_KEY)
      localStorage.setItem(STORAGE_KEY + '_version', STORAGE_VERSION)
      return DEFAULT_CONTAS
    }
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as ContaBancaria[]
  } catch {}
  return DEFAULT_CONTAS
}

function writeToStorage(list: ContaBancaria[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
    localStorage.setItem(STORAGE_KEY + '_version', STORAGE_VERSION)
  } catch {}
}

export async function listContasBancarias(): Promise<ContaBancaria[]> {
  const current = readFromStorage()

  // Se houver conexão com supabase e tabela bank_accounts, sincroniza se necessário
  if (supabase) {
    try {
      const { data, error } = await supabase.from('bank_accounts').select('*')
      if (!error && data && data.length > 0) {
        // Mapeia registros do Supabase
        const remoteMapped: ContaBancaria[] = data.map((b) => ({
          id: b.id,
          nome: b.name || b.bank_name || 'Conta Bancária',
          instituicao: b.bank_name || undefined,
          tipo: 'corrente',
          saldoAtual: Number(b.initial_balance || 0),
          cor: b.color || '#185FA5',
          ativo: b.is_active ?? true,
        }))

        // Une com as do localStorage sem duplicar por ID
        const merged = [...current]
        remoteMapped.forEach((rm) => {
          if (!merged.some((m) => m.id === rm.id)) {
            merged.push(rm)
          }
        })
        writeToStorage(merged)
        return merged
      }
    } catch {}
  }

  // Se não foi salvo ainda no storage, grava os defaults
  if (!localStorage.getItem(STORAGE_KEY)) {
    writeToStorage(current)
  }

  return current
}

export async function getContaBancaria(id: string): Promise<ContaBancaria | undefined> {
  const list = await listContasBancarias()
  return list.find((c) => c.id === id)
}

export async function saveContaBancaria(conta: Omit<ContaBancaria, 'id'>): Promise<ContaBancaria> {
  const current = readFromStorage()
  const nova: ContaBancaria = {
    ...conta,
    id: `conta-${crypto.randomUUID()}`,
    created_at: new Date().toISOString(),
  }
  current.push(nova)
  writeToStorage(current)
  return nova
}

export async function updateSaldoContaBancaria(
  id: string,
  delta: number
): Promise<ContaBancaria | null> {
  const current = readFromStorage()
  const idx = current.findIndex((c) => c.id === id)
  if (idx === -1) return null

  const target = current[idx]
  const novoSaldo = Math.round((target.saldoAtual + delta) * 100) / 100
  const updated: ContaBancaria = {
    ...target,
    saldoAtual: novoSaldo,
  }

  current[idx] = updated
  writeToStorage(current)
  return updated
}
