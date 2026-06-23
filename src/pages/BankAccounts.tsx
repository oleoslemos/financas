import { useUser } from '@clerk/clerk-react'
import { Pencil, Trash2, Landmark } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '../components/ui/Button'
import { useSupabase } from '../hooks/useSupabase'
import { resolveDataOwnerId } from '../lib/dataOwner'
import { clerkEmailCandidates } from '../lib/clerkEmails'
import { formatBRL, parseMoney } from '../lib/format'
import { toUpperOrNull, toUpperTrim } from '../lib/text'

type Bank = {
  id: string
  name: string
  bank_name: string | null
  agency: string | null
  account_number: string | null
  initial_balance: number
  is_active: boolean
  color: string | null
}

type PrMovement = {
  bank_account_id: string | null
  amount: number
  kind: 'payable' | 'receivable' | 'transfer'
  status: 'open' | 'paid'
}

const colors = [
  { name: 'Azul (Padrão)', hex: '#185FA5' },
  { name: 'Roxo (Nubank)', hex: '#8B5CF6' },
  { name: 'Laranja (Itaú)', hex: '#F97316' },
  { name: 'Verde (Sicredi)', hex: '#10B981' },
  { name: 'Vermelho (Bradesco)', hex: '#EF4444' },
  { name: 'Amarelo (BB)', hex: '#EAB308' },
  { name: 'Rosa (Inter)', hex: '#EC4899' },
  { name: 'Cinza', hex: '#64748B' },
]

export function BankAccounts() {
  const { user } = useUser()
  const supabase = useSupabase()
  const ownerUserId = resolveDataOwnerId(user?.id, clerkEmailCandidates(user).join(','))
  const [rows, setRows] = useState<Bank[]>([])
  const [movements, setMovements] = useState<PrMovement[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({
    name: '',
    bank_name: '',
    agency: '',
    account_number: '',
    initial_balance: '0',
    is_active: true,
    color: '#185FA5',
  })
  const [editing, setEditing] = useState<Bank | null>(null)

  const load = useCallback(async () => {
    if (!supabase || !ownerUserId) return
    setLoading(true)
    const [{ data: accounts }, { data: prs }] = await Promise.all([
      supabase.from('bank_accounts').select('*').eq('user_id', ownerUserId).order('name'),
      supabase
        .from('payables_receivables')
        .select('bank_account_id, amount, kind, status')
        .eq('user_id', ownerUserId)
        .eq('status', 'paid'),
    ])
    setRows((accounts as Bank[]) ?? [])
    setMovements((prs as PrMovement[]) ?? [])
    setLoading(false)
  }, [ownerUserId, supabase])

  const currentBalanceByBankId = useMemo(() => {
    const map = new Map<string, number>()
    rows.forEach((bank) => {
      map.set(bank.id, Number(bank.initial_balance ?? 0))
    })
    movements.forEach((movement) => {
      if (!movement.bank_account_id) return
      const current = map.get(movement.bank_account_id) ?? 0
      const delta = movement.kind === 'receivable' ? Number(movement.amount) : -Number(movement.amount)
      map.set(movement.bank_account_id, current + delta)
    })
    return map
  }, [rows, movements])

  useEffect(() => {
    void load()
  }, [load])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !ownerUserId) return
    const payload = {
      user_id: ownerUserId,
      name: toUpperTrim(form.name),
      bank_name: toUpperOrNull(form.bank_name),
      agency: toUpperOrNull(form.agency),
      account_number: toUpperOrNull(form.account_number),
      initial_balance: parseMoney(form.initial_balance),
      is_active: form.is_active,
      color: form.color || '#185FA5',
    }
    if (editing) {
      const { error } = await supabase.from('bank_accounts').update(payload).eq('id', editing.id)
      if (error) alert(error.message)
      else {
        setEditing(null)
        resetForm()
        load()
      }
    } else {
      const { error } = await supabase.from('bank_accounts').insert(payload)
      if (error) alert(error.message)
      else {
        resetForm()
        load()
      }
    }
  }

  function resetForm() {
    setForm({
      name: '',
      bank_name: '',
      agency: '',
      account_number: '',
      initial_balance: '0',
      is_active: true,
      color: '#185FA5',
    })
  }

  function startEdit(b: Bank) {
    setEditing(b)
    setForm({
      name: b.name,
      bank_name: b.bank_name ?? '',
      agency: b.agency ?? '',
      account_number: b.account_number ?? '',
      initial_balance: String(b.initial_balance),
      is_active: b.is_active,
      color: b.color ?? '#185FA5',
    })
  }

  async function remove(id: string) {
    if (!supabase || !confirm('Deseja excluir esta conta? Os lançamentos vinculados a ela permanecerão órfãos.')) return
    const { error } = await supabase.from('bank_accounts').delete().eq('id', id)
    if (error) alert(error.message)
    else load()
  }

  if (!supabase) return <p className="text-slate-600">Conectando…</p>

  return (
    <div className="max-w-5xl space-y-8">
      <div>
        <h2 className="flex items-center gap-2 text-2xl font-bold text-slate-800">
          <Landmark className="text-[#185FA5]" size={28} />
          Contas Bancárias
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Cadastre suas contas correntes, poupanças e carteiras de dinheiro para controle de saldo e lançamentos.
        </p>
      </div>

      <form
        onSubmit={submit}
        className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2"
      >
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
            Nome da Conta
          </label>
          <input
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Ex.: Conta Corrente Nubank"
            className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm placeholder:text-slate-400 focus:border-[#185FA5] focus:outline-none focus:ring-1 focus:ring-[#185FA5]"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
            Banco
          </label>
          <input
            value={form.bank_name}
            onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
            placeholder="Ex.: Banco Itaú"
            className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm placeholder:text-slate-400 focus:border-[#185FA5] focus:outline-none focus:ring-1 focus:ring-[#185FA5]"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
            Agência
          </label>
          <input
            value={form.agency}
            onChange={(e) => setForm({ ...form, agency: e.target.value })}
            placeholder="Ex.: 0001"
            className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm placeholder:text-slate-400 focus:border-[#185FA5] focus:outline-none focus:ring-1 focus:ring-[#185FA5]"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
            Número da Conta
          </label>
          <input
            value={form.account_number}
            onChange={(e) => setForm({ ...form, account_number: e.target.value })}
            placeholder="Ex.: 12345-6"
            className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm placeholder:text-slate-400 focus:border-[#185FA5] focus:outline-none focus:ring-1 focus:ring-[#185FA5]"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
            Saldo Inicial
          </label>
          <input
            value={form.initial_balance}
            onChange={(e) => setForm({ ...form, initial_balance: e.target.value })}
            placeholder="0,00"
            className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm placeholder:text-slate-400 focus:border-[#185FA5] focus:outline-none focus:ring-1 focus:ring-[#185FA5]"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
            Cor Identificadora
          </label>
          <div className="flex flex-wrap gap-2.5">
            {colors.map((c) => (
              <button
                key={c.hex}
                type="button"
                onClick={() => setForm({ ...form, color: c.hex })}
                className={`h-8 w-8 rounded-full border-2 transition-all ${
                  form.color === c.hex
                    ? 'border-slate-800 scale-110 shadow-sm ring-2 ring-slate-800/10'
                    : 'border-transparent hover:scale-105'
                }`}
                style={{ backgroundColor: c.hex }}
                title={c.name}
              />
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 py-2">
          <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              className="h-4.5 w-4.5 rounded border-slate-300 text-[#185FA5] focus:ring-[#185FA5]"
            />
            Esta conta está ativa
          </label>
        </div>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button type="submit" variant="primary" className="h-[38px] px-5 font-semibold">
            {editing ? 'Salvar Alterações' : 'Adicionar Conta'}
          </Button>
          {editing && (
            <Button
              type="button"
              variant="secondary"
              className="h-[38px] px-4"
              onClick={() => {
                setEditing(null)
                resetForm()
              }}
            >
              Cancelar
            </Button>
          )}
        </div>
      </form>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <p className="p-6 text-center text-sm text-slate-500">Carregando contas correntes...</p>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-slate-400">
            <Landmark className="mx-auto mb-2 text-slate-300" size={32} />
            <p className="text-sm">Nenhuma conta bancária cadastrada.</p>
          </div>
        ) : (
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/75 text-xs font-bold uppercase tracking-wider text-slate-500">
                <th className="px-6 py-3.5">Nome</th>
                <th className="px-6 py-3.5">Banco</th>
                <th className="px-6 py-3.5">Agência / Conta</th>
                <th className="px-6 py-3.5 text-right">Saldo Inicial</th>
                <th className="px-6 py-3.5 text-right">Saldo Atual</th>
                <th className="px-6 py-3.5 text-center">Status</th>
                <th className="px-6 py-3.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((b) => {
                const currentBalance = currentBalanceByBankId.get(b.id) ?? 0
                return (
                  <tr key={b.id} className="hover:bg-slate-50/50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="h-3 w-3 rounded-full shrink-0 shadow-sm ring-1 ring-black/5"
                          style={{ backgroundColor: b.color || '#64748B' }}
                        />
                        <span className="font-semibold text-slate-800">{b.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-600">{b.bank_name ?? '—'}</td>
                    <td className="px-6 py-4 text-slate-500 font-mono">
                      {b.agency && b.account_number ? `${b.agency} / ${b.account_number}` : b.agency || b.account_number || '—'}
                    </td>
                    <td className="px-6 py-4 text-right text-slate-600">
                      {formatBRL(Number(b.initial_balance))}
                    </td>
                    <td className={`px-6 py-4 text-right font-semibold ${currentBalance >= 0 ? 'text-slate-800' : 'text-red-600'}`}>
                      {formatBRL(currentBalance)}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
                          b.is_active
                            ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {b.is_active ? 'Ativa' : 'Inativa'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          type="button"
                          variant="ghost"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg p-0 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                          title="EDITAR"
                          aria-label="EDITAR"
                          onClick={() => startEdit(b)}
                        >
                          <Pencil size={16} />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg p-0 text-red-500 hover:bg-red-50 hover:text-red-600"
                          title="EXCLUIR"
                          aria-label="EXCLUIR"
                          onClick={() => remove(b.id)}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
