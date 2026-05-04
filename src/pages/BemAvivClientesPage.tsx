import { useUser } from '@clerk/clerk-react'
import { ArrowDown, ArrowUp, ArrowUpDown, CalendarPlus, MessageCircle, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { useSupabase } from '../hooks/useSupabase'
import { resolveDataOwnerId } from '../lib/dataOwner'
import { clerkEmailCandidates } from '../lib/clerkEmails'
import { toUpperTrim } from '../lib/text'
import { buildWhatsappUrl } from '../lib/whatsapp'

type Cliente = {
  id: string
  full_name: string
  cpf: string
  birth_date: string | null
  phone_1: string | null
  phone_2: string | null
  cep: string | null
  address_street: string | null
  address_number: string | null
  address_complement: string | null
  address_district: string | null
  address_city: string | null
  address_state: string | null
  email: string | null
  client_status: string | null
}

type SortKey = 'full_name' | 'cpf' | 'phones' | 'email' | 'client_status'

function onlyDigits(v: string) {
  return v.replace(/\D/g, '')
}

function formatPhone(v?: string | null) {
  const d = onlyDigits(v ?? '')
  if (!d) return ''
  if (d.length <= 2) return `(${d}`
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 11) return `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(d.length - 4)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7, 11)}`
}

function formatCpf(v?: string | null) {
  const d = onlyDigits(v ?? '').slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

function formatCep(v?: string | null) {
  const d = onlyDigits(v ?? '').slice(0, 8)
  if (d.length <= 5) return d
  return `${d.slice(0, 5)}-${d.slice(5)}`
}

function phonesSortValue(r: Cliente) {
  return `${onlyDigits(r.phone_1 ?? '')}${onlyDigits(r.phone_2 ?? '')}`
}

function clientMatchesSearch(r: Cliente, raw: string) {
  const needle = raw.trim()
  if (!needle) return true
  const upper = needle.toUpperCase()
  const digits = onlyDigits(needle)
  if ((r.full_name ?? '').toUpperCase().includes(upper)) return true
  if ((r.email ?? '').toUpperCase().includes(upper)) return true
  if (digits.length > 0) {
    if (onlyDigits(r.cpf).includes(digits)) return true
    if (onlyDigits(r.phone_1 ?? '').includes(digits)) return true
    if (onlyDigits(r.phone_2 ?? '').includes(digits)) return true
  }
  return false
}

const emptyForm = {
  full_name: '',
  cpf: '',
  birth_date: '',
  phone_1: '',
  phone_2: '',
  cep: '',
  address_street: '',
  address_number: '',
  address_complement: '',
  address_district: '',
  address_city: '',
  address_state: '',
  email: '',
  client_status: 'PROSPECÇÃO',
}

export function BemAvivClientesPage() {
  const { user } = useUser()
  const supabase = useSupabase()
  const navigate = useNavigate()
  const ownerUserId = resolveDataOwnerId(user?.id, clerkEmailCandidates(user).join(','))

  const [rows, setRows] = useState<Cliente[]>([])
  const [editing, setEditing] = useState<Cliente | null>(null)
  const [loading, setLoading] = useState(true)
  const [clientModalOpen, setClientModalOpen] = useState(false)
  const [cepLoading, setCepLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'TODOS' | string>('TODOS')
  const [sortKey, setSortKey] = useState<SortKey>('full_name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [form, setForm] = useState(emptyForm)

  const load = useCallback(async () => {
    if (!supabase || !ownerUserId) return
    setLoading(true)
    const { data } = await supabase.from('bem_aviv_clients').select('*').eq('user_id', ownerUserId).order('full_name')
    setRows((data as Cliente[]) ?? [])
    setLoading(false)
  }, [ownerUserId, supabase])

  useEffect(() => {
    void load()
  }, [load])

  const statusFilterOptions = useMemo(() => {
    const unique = new Set<string>()
    for (const r of rows) {
      unique.add((r.client_status || 'PROSPECÇÃO').trim() || 'PROSPECÇÃO')
    }
    return Array.from(unique).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [rows])

  const displayedRows = useMemo(() => {
    const filtered = rows.filter((r) => {
      if (!clientMatchesSearch(r, search)) return false
      if (statusFilter === 'TODOS') return true
      const st = (r.client_status || 'PROSPECÇÃO').trim() || 'PROSPECÇÃO'
      return st === statusFilter
    })
    const mul = sortDir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'full_name':
          cmp = (a.full_name ?? '').localeCompare(b.full_name ?? '', 'pt-BR')
          break
        case 'cpf':
          cmp = onlyDigits(a.cpf).localeCompare(onlyDigits(b.cpf), 'pt-BR', { numeric: true })
          break
        case 'phones':
          cmp = phonesSortValue(a).localeCompare(phonesSortValue(b), 'pt-BR', { numeric: true })
          break
        case 'email':
          cmp = (a.email ?? '').toLowerCase().localeCompare((b.email ?? '').toLowerCase(), 'pt-BR')
          break
        case 'client_status':
          cmp = (a.client_status ?? '').localeCompare(b.client_status ?? '', 'pt-BR')
          break
        default:
          cmp = 0
      }
      return cmp * mul
    })
  }, [rows, search, statusFilter, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (sortKey !== key) {
      setSortKey(key)
      setSortDir('asc')
    } else {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    }
  }

  function openNewClientModal() {
    setEditing(null)
    setForm(emptyForm)
    setClientModalOpen(true)
  }

  function openEditClientModal(r: Cliente) {
    setEditing(r)
    setForm({
      full_name: r.full_name ?? '',
      cpf: r.cpf ?? '',
      birth_date: r.birth_date ?? '',
      phone_1: r.phone_1 ?? '',
      phone_2: r.phone_2 ?? '',
      cep: r.cep ?? '',
      address_street: r.address_street ?? '',
      address_number: r.address_number ?? '',
      address_complement: r.address_complement ?? '',
      address_district: r.address_district ?? '',
      address_city: r.address_city ?? '',
      address_state: r.address_state ?? '',
      email: r.email ?? '',
      client_status: r.client_status ?? 'PROSPECÇÃO',
    })
    setClientModalOpen(true)
  }

  function closeClientModal() {
    setClientModalOpen(false)
    setEditing(null)
    setForm(emptyForm)
  }

  function goToFollowupSchedule(client: Cliente) {
    navigate('/bem-aviv/follow-up', { state: { bemAvivClientFocus: { id: client.id, mode: 'schedule' as const } } })
  }

  function openWhatsapp(client: Cliente) {
    const url = buildWhatsappUrl(client.phone_1) ?? buildWhatsappUrl(client.phone_2)
    if (!url) {
      alert('Cliente sem telefone válido para WhatsApp.')
      return
    }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !ownerUserId) return
    const fullAddress = [
      form.address_street,
      form.address_number,
      form.address_complement,
      form.address_district,
      form.address_city,
      form.address_state,
      form.cep ? `CEP ${onlyDigits(form.cep)}` : '',
    ]
      .map((v) => toUpperTrim(v))
      .filter(Boolean)
      .join(' - ')
    const payload = {
      user_id: ownerUserId,
      full_name: toUpperTrim(form.full_name),
      cpf: onlyDigits(form.cpf),
      birth_date: form.birth_date || null,
      phone_1: onlyDigits(form.phone_1),
      phone_2: onlyDigits(form.phone_2),
      cep: onlyDigits(form.cep),
      address_street: toUpperTrim(form.address_street),
      address_number: toUpperTrim(form.address_number),
      address_complement: toUpperTrim(form.address_complement),
      address_district: toUpperTrim(form.address_district),
      address_city: toUpperTrim(form.address_city),
      address_state: toUpperTrim(form.address_state),
      full_address: fullAddress,
      email: toUpperTrim(form.email),
      client_status: editing ? toUpperTrim(editing.client_status ?? 'PROSPECÇÃO') : 'PROSPECÇÃO',
    }
    if (editing) {
      const { error } = await supabase.from('bem_aviv_clients').update(payload).eq('id', editing.id)
      if (error) alert(error.message)
    } else {
      const { error } = await supabase.from('bem_aviv_clients').insert(payload)
      if (error) alert(error.message)
    }
    closeClientModal()
    await load()
  }

  async function lookupCep() {
    const cep = onlyDigits(form.cep)
    if (cep.length !== 8) {
      alert('INFORME UM CEP COM 8 DÍGITOS.')
      return
    }
    setCepLoading(true)
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`)
      const data = (await res.json()) as {
        erro?: boolean
        logradouro?: string
        bairro?: string
        localidade?: string
        uf?: string
      }
      if (data.erro) {
        alert('CEP NÃO ENCONTRADO.')
        return
      }
      setForm((prev) => ({
        ...prev,
        address_street: data.logradouro ?? prev.address_street,
        address_district: data.bairro ?? prev.address_district,
        address_city: data.localidade ?? prev.address_city,
        address_state: data.uf ?? prev.address_state,
      }))
    } finally {
      setCepLoading(false)
    }
  }

  async function remove(id: string) {
    if (!supabase || !confirm('EXCLUIR CLIENTE?')) return
    const { error } = await supabase.from('bem_aviv_clients').delete().eq('id', id)
    if (error) alert(error.message)
    else void load()
  }

  function SortHeader({ label, column }: { label: string; column: SortKey }) {
    const active = sortKey === column
    return (
      <th scope="col" className="whitespace-nowrap">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 text-left font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900"
          onClick={() => toggleSort(column)}
          aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
        >
          {label}
          {active ? (
            sortDir === 'asc' ? (
              <ArrowUp size={14} className="shrink-0 text-emerald-700" aria-hidden />
            ) : (
              <ArrowDown size={14} className="shrink-0 text-emerald-700" aria-hidden />
            )
          ) : (
            <ArrowUpDown size={14} className="shrink-0 text-slate-400" aria-hidden />
          )}
        </button>
      </th>
    )
  }

  if (!supabase) return <p className="text-slate-600">CONECTANDO...</p>

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">CADASTRO DE CLIENTES</h2>

      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
        <Button type="button" variant="primary" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2" onClick={openNewClientModal}>
          <Plus size={18} aria-hidden />
          Cadastrar cliente
        </Button>
        <div className="min-w-0 flex-1 lg:max-w-md">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Pesquisa</label>
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              className="w-full pl-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nome, telefone, CPF ou e-mail"
              aria-label="Pesquisar clientes"
            />
          </div>
        </div>
        <div className="w-full min-w-0 sm:w-auto sm:min-w-[11rem]">
          <label htmlFor="client-status-filter" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Status
          </label>
          <select
            id="client-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filtrar por status do cliente"
          >
            <option value="TODOS">Todos</option>
            {statusFilterOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="table-wrap">
        {loading ? (
          <p className="p-4 text-slate-500">CARREGANDO...</p>
        ) : (
          <table>
            <thead>
              <tr>
                <SortHeader label="NOME" column="full_name" />
                <SortHeader label="CPF" column="cpf" />
                <SortHeader label="TELEFONES" column="phones" />
                <SortHeader label="E-MAIL" column="email" />
                <SortHeader label="STATUS" column="client_status" />
                <th className="text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {displayedRows.map((r) => (
                <tr key={r.id}>
                  <td>{r.full_name}</td>
                  <td>{formatCpf(r.cpf)}</td>
                  <td>{[formatPhone(r.phone_1), formatPhone(r.phone_2)].filter(Boolean).join(' / ') || '—'}</td>
                  <td>{r.email || '—'}</td>
                  <td>{r.client_status || 'PROSPECÇÃO'}</td>
                  <td className="whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1.5 sm:gap-2">
                      <button
                        type="button"
                        className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-emerald-500 bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
                        onClick={() => openWhatsapp(r)}
                        title="Enviar mensagem via WhatsApp"
                        aria-label="Enviar mensagem via WhatsApp"
                      >
                        <MessageCircle size={16} strokeWidth={2.2} />
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-sky-300 bg-white text-sky-700 shadow-sm hover:bg-sky-50"
                        onClick={() => goToFollowupSchedule(r)}
                        title="Agendar follow-up"
                        aria-label="Agendar follow-up"
                      >
                        <CalendarPlus size={16} strokeWidth={2.2} />
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-100"
                        onClick={() => openEditClientModal(r)}
                        title="Editar cliente"
                        aria-label="Editar cliente"
                      >
                        <Pencil size={15} strokeWidth={2.2} />
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-red-300 bg-white text-red-700 shadow-sm hover:bg-red-50"
                        onClick={() => remove(r.id)}
                        title="Excluir cliente"
                        aria-label="Excluir cliente"
                      >
                        <Trash2 size={15} strokeWidth={2.2} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {displayedRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    {rows.length === 0
                      ? 'Nenhum cliente cadastrado.'
                      : 'Nenhum resultado para a pesquisa ou o filtro de status atual.'}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        )}
      </div>

      {clientModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="client-modal-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeClientModal()
          }}
        >
          <div
            className="flex max-h-[min(92dvh,880px)] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-xl sm:rounded-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
              <div>
                <h3 id="client-modal-title" className="text-lg font-semibold text-slate-900">
                  {editing ? 'Editar cliente' : 'Novo cliente'}
                </h3>
                <p className="text-sm text-slate-500">Preencha os dados e salve. Nome e endereço seguem a normalização em maiúsculas do cadastro.</p>
              </div>
              <button
                type="button"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                onClick={closeClientModal}
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={onSubmit} className="grid max-h-[calc(min(92dvh,880px)-4rem)] gap-3 overflow-y-auto p-4 sm:grid-cols-12 sm:gap-4 sm:p-5">
              <div className="sm:col-span-8 lg:col-span-9">
                <label>NOME COMPLETO</label>
                <input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
              </div>
              <div className="sm:col-span-4 lg:col-span-3">
                <label>DATA NASCIMENTO</label>
                <input type="date" value={form.birth_date} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} />
              </div>

              <div className="sm:col-span-4 lg:col-span-3">
                <label>CPF</label>
                <input required value={formatCpf(form.cpf)} onChange={(e) => setForm({ ...form, cpf: onlyDigits(e.target.value) })} />
              </div>
              <div className="sm:col-span-4 lg:col-span-4">
                <label>TELEFONE 1</label>
                <input value={formatPhone(form.phone_1)} onChange={(e) => setForm({ ...form, phone_1: onlyDigits(e.target.value) })} />
              </div>
              <div className="sm:col-span-4 lg:col-span-5">
                <label>TELEFONE 2</label>
                <input value={formatPhone(form.phone_2)} onChange={(e) => setForm({ ...form, phone_2: onlyDigits(e.target.value) })} />
              </div>

              <div className="sm:col-span-4">
                <label>CEP</label>
                <div className="flex gap-2">
                  <input
                    value={formatCep(form.cep)}
                    onChange={(e) => setForm({ ...form, cep: onlyDigits(e.target.value) })}
                    onBlur={() => {
                      if (onlyDigits(form.cep).length === 8) void lookupCep()
                    }}
                  />
                  <Button type="button" variant="secondary" className="px-3" onClick={() => void lookupCep()} disabled={cepLoading}>
                    <Search size={14} />
                  </Button>
                </div>
              </div>
              <div className="sm:col-span-6">
                <label>LOGRADOURO</label>
                <input value={form.address_street} onChange={(e) => setForm({ ...form, address_street: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <label>NÚMERO</label>
                <input value={form.address_number} onChange={(e) => setForm({ ...form, address_number: e.target.value })} />
              </div>
              <div className="sm:col-span-3">
                <label>COMPLEMENTO</label>
                <input value={form.address_complement} onChange={(e) => setForm({ ...form, address_complement: e.target.value })} />
              </div>
              <div className="sm:col-span-3">
                <label>BAIRRO</label>
                <input value={form.address_district} onChange={(e) => setForm({ ...form, address_district: e.target.value })} />
              </div>
              <div className="sm:col-span-3">
                <label>CIDADE</label>
                <input value={form.address_city} onChange={(e) => setForm({ ...form, address_city: e.target.value })} />
              </div>
              <div className="sm:col-span-3">
                <label>ESTADO</label>
                <input value={form.address_state} onChange={(e) => setForm({ ...form, address_state: e.target.value })} />
              </div>
              <div className="sm:col-span-8">
                <label>E-MAIL</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="sm:col-span-4">
                <label>CLASSIFICAÇÃO</label>
                <input value={editing?.client_status ?? 'PROSPECÇÃO'} readOnly className="bg-slate-100 text-slate-600" />
              </div>
              <div className="sticky bottom-0 z-10 flex flex-wrap gap-2 border-t border-slate-100 bg-white/95 py-3 backdrop-blur sm:col-span-12">
                <Button variant="primary" type="submit">
                  {editing ? 'Salvar alterações' : 'Adicionar cliente'}
                </Button>
                <Button variant="secondary" type="button" onClick={closeClientModal}>
                  Cancelar
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}
