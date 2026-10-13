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

const DEFAULT_CONTAS: ContaBancaria[] = [
  {
    id: 'conta-inter',
    nome: 'Banco Inter',
    instituicao: 'Inter PJ',
    tipo: 'corrente',
    saldoAtual: 42580.0,
    cor: '#F97316',
    ativo: true,
  },
  {
    id: 'conta-caixa',
    nome: 'Caixa Geral / Espécie',
    instituicao: 'Caixa Físico',
    tipo: 'carteira',
    saldoAtual: 3450.0,
    cor: '#10B981',
    ativo: true,
  },
  {
    id: 'conta-bb',
    nome: 'Banco do Brasil',
    instituicao: 'BB Agência Central',
    tipo: 'corrente',
    saldoAtual: 18900.0,
    cor: '#EAB308',
    ativo: true,
  },
  {
    id: 'conta-nubank',
    nome: 'Nubank PJ',
    instituicao: 'Nu Pagamentos',
    tipo: 'corrente',
    saldoAtual: 15320.0,
    cor: '#8B5CF6',
    ativo: true,
  },
]

function readFromStorage(): ContaBancaria[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as ContaBancaria[]
  } catch {}
  return DEFAULT_CONTAS
}

function writeToStorage(list: ContaBancaria[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
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
