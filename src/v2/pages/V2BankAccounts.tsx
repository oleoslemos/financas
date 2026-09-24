import { useEffect, useState } from 'react'
import { useUser } from '../../hooks/useClerkCompat'
import { useSupabase } from '../../hooks/useSupabase'
import { resolveDataOwnerId } from '../../lib/dataOwner'
import { clerkEmailCandidates } from '../../lib/clerkEmails'
import { formatBRL } from '../../lib/format'
import { Landmark, Plus } from 'lucide-react'

type BankAccount = {
  id: string
  name: string
  initial_balance: number
  color: string | null
  is_active: boolean
}

export function V2BankAccounts() {
  const { user } = useUser()
  const supabase = useSupabase()
  const ownerUserId = resolveDataOwnerId(user?.id, clerkEmailCandidates(user).join(','))

  const [accounts, setAccounts] = useState<BankAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [isAdding, setIsAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newBalance, setNewBalance] = useState('')
  const [newColor, setNewColor] = useState('#6366F1')
  const [saving, setSaving] = useState(false)

  const fetchAccounts = async () => {
    if (!supabase || !ownerUserId) return
    setLoading(true)
    const { data } = await supabase
      .from('bank_accounts')
      .select('*')
      .eq('user_id', ownerUserId)
      .order('name')
    setAccounts((data as BankAccount[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    fetchAccounts()
  }, [supabase, ownerUserId])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabase || !ownerUserId || !newName) return
    setSaving(true)

    try {
      const { error } = await supabase.from('bank_accounts').insert({
        user_id: ownerUserId,
        name: newName,
        initial_balance: parseFloat(newBalance.replace(',', '.')) || 0,
        color: newColor,
        is_active: true,
      })
      if (error) throw error
      setIsAdding(false)
      setNewName('')
      setNewBalance('')
      fetchAccounts()
    } catch (err) {
      console.error(err)
      alert('Erro ao criar conta bancária.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900/60 backdrop-blur-md border border-slate-800/80 rounded-3xl p-6 shadow-xl">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              MÓDULO V2
            </span>
            <span className="text-xs text-slate-400">· Contas & Carteiras</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Contas Bancárias</h2>
        </div>

        <button
          type="button"
          onClick={() => setIsAdding(!isAdding)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-500 hover:to-sky-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/20 transition"
        >
          <Plus className="h-4 w-4" />
          <span>Nova Conta</span>
        </button>
      </div>

      {isAdding && (
        <form onSubmit={handleCreate} className="bg-slate-900 border border-indigo-500/30 rounded-3xl p-6 shadow-xl space-y-4 text-xs">
          <h3 className="text-sm font-bold text-white">Adicionar Conta Bancária</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-400 font-bold mb-1">Nome da Conta / Banco</label>
              <input
                type="text"
                required
                placeholder="Ex: Itaú, Nubank, Banco do Brasil..."
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-bold mb-1">Saldo Inicial (R$)</label>
              <input
                type="text"
                placeholder="0,00"
                value={newBalance}
                onChange={(e) => setNewBalance(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-bold mb-1">Cor Identificadora</label>
              <input
                type="color"
                value={newColor}
                onChange={(e) => setNewColor(e.target.value)}
                className="w-full h-9 bg-slate-950 border border-slate-800 rounded-xl p-1 outline-none cursor-pointer"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-bold"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-xl bg-indigo-600 text-white font-bold"
            >
              {saving ? 'Salvando...' : 'Salvar Conta'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="text-center py-12 text-slate-400 text-xs">Carregando contas bancárias...</div>
      ) : accounts.length === 0 ? (
        <div className="text-center py-12 text-slate-500 text-xs">Nenhuma conta bancária cadastrada.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map((acc) => (
            <div
              key={acc.id}
              className="bg-slate-900/60 backdrop-blur-md border border-slate-800/90 rounded-3xl p-6 shadow-xl relative overflow-hidden group hover:border-slate-700 transition space-y-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="h-10 w-10 rounded-2xl flex items-center justify-center text-white font-bold shadow-md"
                    style={{ backgroundColor: acc.color || '#6366F1' }}
                  >
                    <Landmark className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">{acc.name}</h3>
                    <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                      Conta Ativa
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Saldo Inicial</p>
                <p className="text-2xl font-black text-white">{formatBRL(Number(acc.initial_balance))}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
