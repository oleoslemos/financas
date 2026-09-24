import { useEffect, useState } from 'react'
import { useUser } from '../../hooks/useClerkCompat'
import { useSupabase } from '../../hooks/useSupabase'
import { resolveDataOwnerId } from '../../lib/dataOwner'
import { clerkEmailCandidates } from '../../lib/clerkEmails'
import { formatBRL } from '../../lib/format'
import { CreditCard, Plus, Sparkles } from 'lucide-react'

type Card = {
  id: string
  name: string
  credit_limit: number
  closing_day: number
  due_day: number
  color?: string
}

export function V2CreditCardsPage() {
  const { user } = useUser()
  const supabase = useSupabase()
  const ownerUserId = resolveDataOwnerId(user?.id, clerkEmailCandidates(user).join(','))

  const [cards, setCards] = useState<Card[]>([])
  const [loading, setLoading] = useState(true)
  const [isAdding, setIsAdding] = useState(false)
  const [name, setName] = useState('')
  const [limit, setLimit] = useState('')
  const [closingDay, setClosingDay] = useState('1')
  const [dueDay, setDueDay] = useState('10')
  const [saving, setSaving] = useState(false)

  const fetchCards = async () => {
    if (!supabase || !ownerUserId) return
    setLoading(true)
    const { data } = await supabase.from('credit_cards').select('*').eq('user_id', ownerUserId).order('name')
    setCards((data as Card[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    fetchCards()
  }, [supabase, ownerUserId])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabase || !ownerUserId || !name) return
    setSaving(true)

    try {
      const { error } = await supabase.from('credit_cards').insert({
        user_id: ownerUserId,
        name,
        credit_limit: parseFloat(limit.replace(',', '.')) || 0,
        closing_day: parseInt(closingDay),
        due_day: parseInt(dueDay),
      })

      if (error) throw error
      setIsAdding(false)
      setName('')
      setLimit('')
      fetchCards()
    } catch (err) {
      console.error(err)
      alert('Erro ao criar cartão.')
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
            <span className="text-xs text-slate-400">· Cartões & Faturas</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Cartões de Crédito</h2>
        </div>

        <button
          type="button"
          onClick={() => setIsAdding(!isAdding)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-sky-600 hover:from-indigo-500 hover:to-sky-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/20 transition"
        >
          <Plus className="h-4 w-4" />
          <span>Novo Cartão</span>
        </button>
      </div>

      {isAdding && (
        <form onSubmit={handleCreate} className="bg-slate-900 border border-indigo-500/30 rounded-3xl p-6 shadow-xl space-y-4 text-xs">
          <h3 className="text-sm font-bold text-white">Adicionar Novo Cartão</h3>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-slate-400 font-bold mb-1">Nome do Cartão</label>
              <input
                type="text"
                required
                placeholder="Ex: Nubank Violeta, XP Black..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-bold mb-1">Limite (R$)</label>
              <input
                type="text"
                placeholder="5000,00"
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-bold mb-1">Dia Fechamento</label>
              <input
                type="number"
                min="1"
                max="31"
                value={closingDay}
                onChange={(e) => setClosingDay(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-slate-400 font-bold mb-1">Dia Vencimento</label>
              <input
                type="number"
                min="1"
                max="31"
                value={dueDay}
                onChange={(e) => setDueDay(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white outline-none focus:ring-2 focus:ring-indigo-500"
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
              {saving ? 'Salvando...' : 'Salvar Cartão'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="text-center py-12 text-slate-400 text-xs">Carregando cartões...</div>
      ) : cards.length === 0 ? (
        <div className="text-center py-12 text-slate-500 text-xs">Nenhum cartão cadastrado.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {cards.map((card) => (
            <div
              key={card.id}
              className="bg-gradient-to-br from-slate-900 via-indigo-950/50 to-slate-900 border border-slate-800/90 rounded-3xl p-6 shadow-xl relative overflow-hidden group hover:border-indigo-500/50 transition space-y-6"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-2xl bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 flex items-center justify-center font-bold shadow-md">
                    <CreditCard className="h-5 w-5" />
                  </div>
                  <h3 className="text-base font-bold text-white">{card.name}</h3>
                </div>
                <Sparkles className="h-4 w-4 text-indigo-400" />
              </div>

              <div>
                <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Limite Total</p>
                <p className="text-2xl font-black text-white">{formatBRL(Number(card.credit_limit))}</p>
              </div>

              <div className="pt-3 border-t border-slate-800/80 grid grid-cols-2 gap-2 text-xs">
                <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
                  <span className="block text-[10px] text-slate-400 font-bold">Fechamento</span>
                  <span className="font-bold text-slate-200">Dia {card.closing_day}</span>
                </div>
                <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800">
                  <span className="block text-[10px] text-slate-400 font-bold">Vencimento</span>
                  <span className="font-bold text-slate-200">Dia {card.due_day}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
