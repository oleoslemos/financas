import { useUser } from '@clerk/clerk-react'
import { CalendarPlus, MessageCircle, Pencil, PhoneForwarded, PlusCircle, Search, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { useSupabase } from '../hooks/useSupabase'
import { useCompany } from '../context/CompanyContext'
import { useSessionState } from '../hooks/useSessionState'
import { clerkEmailCandidates } from '../lib/clerkEmails'
import { resolveDataOwnerId } from '../lib/dataOwner'
import { buildWhatsappUrl } from '../lib/whatsapp'
import { dateInputToIso, formatDateOnly, todayInputDate, toInputDate } from '../lib/dates'
import {
  clientHadEko7Presentation,
  clientMatchesEko7Filter,
  getDisplayStatusAndTags,
  type BemAvivEko7Filter,
} from '../lib/bemAvivClientStatus'

const EXCLUDED_FROM_FOLLOWUP_NAMES = new Set(['LEONARDO SILVA LEMOS', 'SUELEN JOAO ALVES'])
const EXCLUDED_FROM_FOLLOWUP_CPFS = new Set(['22112195867', '00742215903'])

type FollowupStatus = 'PENDENTE' | 'CONCLUIDO' | 'CANCELADO'
type DateFilter = 'TODOS' | 'VENCIDOS' | 'HOJE' | 'PROXIMOS_7' | 'SEM_AGENDAMENTO' | 'SEM_CONTATO'
type StatusFilter = 'TODOS' | FollowupStatus | 'VISITA_AGENDADA'
type SortKey = 'full_name' | 'phone' | 'client_status' | 'commercial_stage' | 'last_contact_at' | 'next_followup_at' | 'next_followup_status'

type Cliente = {
  id: string
  full_name: string
  cpf?: string | null
  phone_1: string | null
  phone_2: string | null
  client_status: string | null
  commercial_stage: string | null
  last_contact_at: string | null
  next_followup_at: string | null
  next_followup_note: string | null
  next_followup_status: FollowupStatus | null
  eko7_presentation_at: string | null
}

function clientStatusPill(status: string | null) {
  const { status: displayStatus, tags } = getDisplayStatusAndTags(status)
  
  const statusEl = displayStatus === 'CLIENTE' ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[8px] font-semibold text-emerald-800 border border-emerald-200">
      <span className="h-1 w-1 rounded-full bg-emerald-500" aria-hidden />
      Cliente
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#FAEEDA] px-2 py-0.5 text-[8px] font-semibold text-[#854F0B] border border-[#F5E1C4]">
      <span className="h-1 w-1 rounded-full bg-[#EF9F27]" aria-hidden />
      Prospecção
    </span>
  )

  return (
    <div className="flex flex-wrap items-center gap-1">
      {statusEl}
      {tags.map((tag) => {
        if (tag === 'COLCHÃO') {
          return (
            <span key={tag} className="inline-flex items-center rounded-md bg-[#EAF3DE] px-1.5 py-0.5 text-[8px] font-bold text-[#3B6D11] border border-[#D5E6BE]">
              Colchão
            </span>
          )
        }
        return (
          <span key={tag} className="inline-flex items-center rounded-md bg-[#E6F1FB] px-1.5 py-0.5 text-[8px] font-bold text-[#185FA5] border border-[#C5DFF8]">
            Diversos
          </span>
        )
      })}
    </div>
  )
}


type FollowupHistoryRow = {
  id: string
  contacted_at: string
  channel: string
  created_by_name?: string | null
  result: string | null
  notes: string | null
}

type StartFollowupForm = {
  clientId: string
  onlyWithoutSchedule: boolean
}

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

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function endOfToday() {
  const d = startOfToday()
  d.setDate(d.getDate() + 1)
  d.setMilliseconds(-1)
  return d
}



type FollowupLocationState = {
  bemAvivClientFocus?: { id: string; mode: 'history' }
  openStartFollowup?: boolean
  /** Vindo de agendar follow-up: abre registro de contato para este cliente (reativar o toque). */
  startFollowupClientId?: string
}

export function BemAvivFollowupPage() {
  const { user } = useUser()
  const supabase = useSupabase()
  const location = useLocation()
  const navigate = useNavigate()
  const { activeCompanyId } = useCompany()
  const ownerUserId = resolveDataOwnerId(user?.id, clerkEmailCandidates(user).join(','))
  const followupUserId = ownerUserId ? ownerUserId.toUpperCase() : null
  const followupActorName = (user?.fullName || user?.primaryEmailAddress?.emailAddress || ownerUserId || 'USUÁRIO').trim().toUpperCase()

  const [searchParams, setSearchParams] = useSearchParams()
  const [rows, setRows] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dateFilter, setDateFilter] = useSessionState<DateFilter>('followup:dateFilter', 'TODOS')
  const [statusFilter, setStatusFilter] = useSessionState<StatusFilter>('followup:statusFilter', 'TODOS')
  const [eko7Filter, setEko7Filter] = useState<BemAvivEko7Filter>('TODOS')
  const [sortKey, setSortKey] = useState<SortKey>('full_name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [registeringClientId, setRegisteringClientId] = useSessionState<string | null>('followup:registeringClientId', null)
  const [registeringClient, setRegisteringClientRaw] = useState<Cliente | null>(null)
  const [historyRows, setHistoryRows] = useState<FollowupHistoryRow[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [editingHistoryId, setEditingHistoryId] = useState<string | null>(null)
  const registeringReopenedRef = useRef(false)
  const [startFollowupOpen, setStartFollowupOpen] = useState(false)
  const [startFollowupForm, setStartFollowupForm] = useState<StartFollowupForm>({
    clientId: '',
    onlyWithoutSchedule: true,
  })

  const [registerForm, setRegisterForm] = useState({
    contacted_at: todayInputDate(),
    channel: 'WHATSAPP',
    result: '',
    notes: '',
  })

  useEffect(() => {
    const periodoParam = searchParams.get('periodo') as DateFilter | null
    const statusParam = searchParams.get('status') as StatusFilter | null
    const eko7Param = searchParams.get('eko7') as BemAvivEko7Filter | null

    if (periodoParam && ['TODOS', 'VENCIDOS', 'HOJE', 'PROXIMOS_7', 'SEM_AGENDAMENTO', 'SEM_CONTATO'].includes(periodoParam)) {
      setDateFilter(periodoParam)
    }
    if (statusParam && ['TODOS', 'PENDENTE', 'CONCLUIDO', 'CANCELADO', 'VISITA_AGENDADA'].includes(statusParam)) {
      setStatusFilter(statusParam)
    }
    if (eko7Param && ['TODOS', 'APRESENTADO', 'PENDENTE'].includes(eko7Param)) {
      setEko7Filter(eko7Param)
    }
  }, [searchParams, setDateFilter, setStatusFilter])

  useEffect(() => {
    const st = location.state as { dateFilter?: DateFilter; statusFilter?: StatusFilter; eko7Filter?: BemAvivEko7Filter } | null
    if (st?.dateFilter) setDateFilter(st.dateFilter)
    if (st?.statusFilter) setStatusFilter(st.statusFilter)
    if (st?.eko7Filter) setEko7Filter(st.eko7Filter)
  }, [location.state, setDateFilter, setStatusFilter])

  const load = useCallback(async () => {
    if (!supabase || !activeCompanyId) {
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error } = await supabase
      .from('bem_aviv_clients')
      .select('id, full_name, cpf, phone_1, phone_2, client_status, commercial_stage, last_contact_at, next_followup_at, next_followup_note, next_followup_status, eko7_presentation_at')
      .eq('company_id', activeCompanyId)
      .order('full_name')

    if (error) {
      alert(error.message)
      setRows([])
    } else {
      setRows((data as Cliente[]) ?? [])
    }
    setLoading(false)
  }, [supabase, activeCompanyId])

  useEffect(() => {
    void load()
  }, [load])

  function setRegisteringClient(client: Cliente | null) {
    setRegisteringClientRaw(client)
    setRegisteringClientId(client?.id ?? null)
  }

  // Re-open registering contact modal if previously open
  useEffect(() => {
    if (registeringReopenedRef.current) return
    if (!registeringClientId || loading || rows.length === 0) return
    const client = rows.find((r) => r.id === registeringClientId)
    if (!client) return
    registeringReopenedRef.current = true
    setRegisteringClient(client)
    void loadHistory(client.id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, rows, registeringClientId])

  const loadHistory = useCallback(
    async (clientId: string) => {
      if (!supabase || !activeCompanyId) return
      setLoadingHistory(true)
      const { data, error } = await supabase
        .from('bem_aviv_client_followups')
        .select('id, contacted_at, channel, created_by_name, result, notes')
        .is('deleted_at', null)
        .eq('company_id', activeCompanyId)
        .eq('client_id', clientId)
        .order('contacted_at', { ascending: false })
        .limit(8)
      if (error) {
        alert(error.message)
        setHistoryRows([])
      } else {
        setHistoryRows((data as FollowupHistoryRow[]) ?? [])
      }
      setLoadingHistory(false)
    },
    [supabase, activeCompanyId],
  )

  useEffect(() => {
    const focus = (location.state as FollowupLocationState | null)?.bemAvivClientFocus
    if (!focus || focus.mode !== 'history' || rows.length === 0) return

    const client = rows.find((r) => r.id === focus.id)
    navigate('.', { replace: true, state: {} })
    if (!client) return

    setRegisteringClient(client)
    setRegisterForm({
      contacted_at: todayInputDate(),
      channel: 'WHATSAPP',
      result: '',
      notes: '',
    })
    setEditingHistoryId(null)
    void loadHistory(client.id)
  }, [location.state, rows, navigate, loadHistory])

  useEffect(() => {
    const st = location.state as FollowupLocationState | null
    if (!st?.openStartFollowup) return

    if (st.startFollowupClientId) {
      if (rows.length === 0) return
      const client = rows.find((r) => r.id === st.startFollowupClientId)
      navigate('.', { replace: true, state: {} })
      if (!client) {
        alert('CLIENTE NÃO ENCONTRADO NA LISTA.')
        return
      }
      setRegisterForm({
        contacted_at: todayInputDate(),
        channel: 'WHATSAPP',
        result: '',
        notes: '',
      })
      setEditingHistoryId(null)
      setRegisteringClient(client)
      void loadHistory(client.id)
      return
    }

    setStartFollowupOpen(true)
    navigate('.', { replace: true, state: {} })
  }, [location.state, rows, navigate, loadHistory])

  async function removeHistoryEntry(entryId: string) {
    if (!supabase || !registeringClient || !activeCompanyId) return
    if (!confirm('EXCLUIR ESTE REGISTRO DE CONTATO?')) return

    const { error } = await supabase
      .from('bem_aviv_client_followups')
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by_user_id: user?.id ?? null,
        deleted_by_name: followupActorName,
      })
      .eq('id', entryId)
      .eq('company_id', activeCompanyId)
    if (error) {
      alert(error.message)
      return
    }

    await loadHistory(registeringClient.id)
    await load()
  }

  function startEditHistoryEntry(item: FollowupHistoryRow) {
    setEditingHistoryId(item.id)
    setRegisterForm({
      contacted_at: toInputDate(item.contacted_at),
      channel: item.channel,
      result: item.result ?? '',
      notes: item.notes ?? '',
    })
  }

  const filteredRows = useMemo(() => {
    const q = search.trim().toUpperCase()
    const now = new Date()
    const todayStart = startOfToday()
    const todayEnd = endOfToday()
    const nextSevenEnd = new Date(todayStart)
    nextSevenEnd.setDate(nextSevenEnd.getDate() + 7)
    nextSevenEnd.setHours(23, 59, 59, 999)

    const filtered = rows.filter((row) => {
      if (EXCLUDED_FROM_FOLLOWUP_NAMES.has(row.full_name?.trim()?.toUpperCase())) return false
      const cpf = (row.cpf ?? '').replace(/\D/g, '')
      if (cpf && EXCLUDED_FROM_FOLLOWUP_CPFS.has(cpf)) return false

      const hasSearchMatch =
        !q ||
        row.full_name.toUpperCase().includes(q) ||
        onlyDigits(row.phone_1 ?? '').includes(onlyDigits(q)) ||
        onlyDigits(row.phone_2 ?? '').includes(onlyDigits(q))

      if (!hasSearchMatch) return false

      if (statusFilter !== 'TODOS') {
        if (statusFilter === 'VISITA_AGENDADA') {
          if ((row.commercial_stage ?? 'CONTATO') !== 'VISITA AGENDADA') return false
        } else if ((row.next_followup_status ?? 'PENDENTE') !== statusFilter) {
          return false
        }
      }

      const nextDate = row.next_followup_at ? new Date(row.next_followup_at) : null
      const lastContactDate = row.last_contact_at ? new Date(row.last_contact_at) : null

      if (dateFilter === 'SEM_CONTATO') {
        return !lastContactDate && !nextDate
      }
      if (dateFilter === 'SEM_AGENDAMENTO') {
        return !nextDate
      }
      if (dateFilter === 'TODOS') {
        return true
      }
      if (!nextDate) return false

      if (dateFilter === 'VENCIDOS') {
        if (nextDate >= now) return false
        if (lastContactDate && lastContactDate > nextDate) return false
        return true
      }
      if (dateFilter === 'HOJE') return nextDate >= todayStart && nextDate <= todayEnd
      if (dateFilter === 'PROXIMOS_7') return nextDate >= todayStart && nextDate <= nextSevenEnd
      return true
    }).filter((row) => clientMatchesEko7Filter(row, eko7Filter))
    const safeTime = (v: string | null) => {
      if (!v) return 0
      const n = new Date(v).getTime()
      return Number.isNaN(n) ? 0 : n
    }
    const mul = sortDir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'full_name':
          cmp = (a.full_name ?? '').localeCompare(b.full_name ?? '', 'pt-BR')
          break
        case 'phone': {
          const pa = formatPhone(a.phone_1) || formatPhone(a.phone_2) || ''
          const pb = formatPhone(b.phone_1) || formatPhone(b.phone_2) || ''
          cmp = pa.localeCompare(pb, 'pt-BR', { numeric: true })
          break
        }
        case 'client_status':
          cmp = (a.client_status ?? '').localeCompare(b.client_status ?? '', 'pt-BR')
          break
        case 'commercial_stage':
          cmp = (a.commercial_stage ?? 'CONTATO').localeCompare(b.commercial_stage ?? 'CONTATO', 'pt-BR')
          break
        case 'last_contact_at':
          cmp = safeTime(a.last_contact_at) - safeTime(b.last_contact_at)
          break
        case 'next_followup_at':
          cmp = safeTime(a.next_followup_at) - safeTime(b.next_followup_at)
          break
        case 'next_followup_status':
          cmp = (a.next_followup_status ?? 'PENDENTE').localeCompare(b.next_followup_status ?? 'PENDENTE', 'pt-BR')
          break
      }
      return cmp * mul
    })
  }, [rows, search, dateFilter, statusFilter, eko7Filter, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (sortKey !== key) {
      setSortKey(key)
      setSortDir('asc')
      return
    }
    setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
  }



  const startFollowupClientOptions = useMemo(() => {
    const source = startFollowupForm.onlyWithoutSchedule ? rows.filter((r) => !r.next_followup_at) : rows
    return source.sort((a, b) => a.full_name.localeCompare(b.full_name, 'pt-BR')).map((r) => ({ id: r.id, full_name: r.full_name }))
  }, [rows, startFollowupForm.onlyWithoutSchedule])

  async function submitRegisterContact(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !followupUserId || !registeringClient || !activeCompanyId) return
    if (!registerForm.contacted_at) {
      alert('INFORME A DATA DO CONTATO.')
      return
    }

    const contactedAtIso = dateInputToIso(registerForm.contacted_at)
    if (editingHistoryId) {
      const { error: updateError } = await supabase
        .from('bem_aviv_client_followups')
        .update({
          contacted_at: contactedAtIso,
          channel: registerForm.channel,
          created_by_name: followupActorName,
          updated_by_user_id: user?.id ?? null,
          updated_by_name: followupActorName,
          result: registerForm.result || null,
          notes: registerForm.notes || null,
        })
        .eq('id', editingHistoryId)
        .eq('company_id', activeCompanyId)

      if (updateError) {
        alert(updateError.message)
        return
      }
    } else {
      const { error: insertError } = await supabase.from('bem_aviv_client_followups').insert({
        user_id: followupUserId,
        company_id: activeCompanyId,
        created_by_user_id: user?.id ?? null,
        created_by_name: followupActorName,
        client_id: registeringClient.id,
        contacted_at: contactedAtIso,
        channel: registerForm.channel,
        result: registerForm.result || null,
        notes: registerForm.notes || null,
      })

      if (insertError) {
        alert(insertError.message)
        return
      }
    }

    const { error: clientUpdateError } = await supabase
      .from('bem_aviv_clients')
      .update({
        last_contact_at: contactedAtIso,
        next_followup_status: 'CONCLUIDO',
      })
      .eq('id', registeringClient.id)
      .eq('company_id', activeCompanyId)

    if (clientUpdateError) {
      alert(clientUpdateError.message)
      return
    }

    setRegisterForm({
      contacted_at: todayInputDate(),
      channel: 'WHATSAPP',
      result: '',
      notes: '',
    })
    setEditingHistoryId(null)
    setRegisteringClient(null)
    await load()
  }

  function openWhatsapp(client: Cliente) {
    const url = buildWhatsappUrl(client.phone_1 || client.phone_2)
    if (!url) {
      alert('CLIENTE SEM TELEFONE VÁLIDO PARA WHATSAPP.')
      return
    }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  if (!supabase) return <p className="text-slate-600">CONECTANDO...</p>

  return (
    <div className="space-y-6 normal-case pb-24 md:pb-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">FOLLOW-UP DE CLIENTES</h2>
          <p className="text-sm text-slate-500">Registre contatos e organize os próximos retornos por data.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setStartFollowupOpen(true)}>
            <PlusCircle size={15} className="mr-1" />
            Iniciar novo follow-up
          </Button>
          <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">TOTAL: {filteredRows.length}</p>
        </div>
      </div>


      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <label>BUSCA</label>
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-2.5 top-2.5 text-slate-400" />
            <input className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nome ou telefone" />
          </div>
        </div>
        <div>
          <label>PERÍODO</label>
          <select
            value={dateFilter}
            onChange={(e) => {
              const val = e.target.value as DateFilter
              setDateFilter(val)
              setSearchParams((prev) => {
                const next = new URLSearchParams(prev)
                if (val === 'TODOS') next.delete('periodo')
                else next.set('periodo', val)
                return next
              })
            }}
          >
            <option value="VENCIDOS">Vencidos</option>
            <option value="HOJE">Hoje</option>
            <option value="PROXIMOS_7">Próximos 7 dias</option>
            <option value="SEM_AGENDAMENTO">Sem agendamento</option>
            <option value="SEM_CONTATO">Sem nenhum contato</option>
            <option value="TODOS">Todos</option>
          </select>
        </div>
        <div>
          <label>STATUS</label>
          <select
            value={statusFilter}
            onChange={(e) => {
              const val = e.target.value as StatusFilter
              setStatusFilter(val)
              setSearchParams((prev) => {
                const next = new URLSearchParams(prev)
                if (val === 'TODOS') next.delete('status')
                else next.set('status', val)
                return next
              })
            }}
          >
            <option value="TODOS">Todos</option>
            <option value="PENDENTE">Pendente</option>
            <option value="CONCLUIDO">Concluído</option>
            <option value="CANCELADO">Cancelado</option>
            <option value="VISITA_AGENDADA">Visita agendada</option>
          </select>
        </div>
        <div>
          <label>EKO7</label>
          <select
            value={eko7Filter}
            onChange={(e) => {
              const val = e.target.value as BemAvivEko7Filter
              setEko7Filter(val)
              setSearchParams((prev) => {
                const next = new URLSearchParams(prev)
                if (val === 'TODOS') next.delete('eko7')
                else next.set('eko7', val)
                return next
              })
            }}
          >
            <option value="TODOS">Todos</option>
            <option value="APRESENTADO">EKO7 apresentado</option>
            <option value="PENDENTE">EKO7 não apresentado</option>
          </select>
        </div>
        <div className="flex items-end">
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => {
              setSearch('')
              setDateFilter('TODOS')
              setStatusFilter('TODOS')
              setEko7Filter('TODOS')
              setSearchParams({})
            }}
          >
            Limpar filtros
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-slate-500">CARREGANDO...</p>
      ) : (
        <>
          <ul className="space-y-3 md:hidden" aria-label="Lista de clientes">
            {filteredRows.length === 0 ? (
              <li className="rounded-xl border border-slate-200 bg-slate-50/80 p-6 text-center text-sm text-slate-600">
                Nenhum cliente encontrado com os filtros atuais.
              </li>
            ) : (
              filteredRows.map((row) => (
                <li key={row.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="font-semibold text-slate-900">{row.full_name}</p>
                        {clientHadEko7Presentation(row) ? (
                          <span
                            className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-violet-800"
                            title={`EKO7 em ${formatDateOnly(row.eko7_presentation_at)}`}
                          >
                            EKO7
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-sm text-slate-600">{formatPhone(row.phone_1) || formatPhone(row.phone_2) || '—'}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                      {row.next_followup_status || 'PENDENTE'}
                    </span>
                  </div>
                  <dl className="mt-3 grid gap-1.5 text-xs text-slate-600">
                    <div className="flex justify-between gap-2 items-center">
                      <dt className="text-slate-500">Status</dt>
                      <dd className="text-right">{clientStatusPill(row.client_status)}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">Etapa</dt>
                      <dd className="text-right font-medium text-slate-800">{row.commercial_stage || 'CONTATO'}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">Próximo</dt>
                      <dd className="text-right">{formatDateOnly(row.next_followup_at)}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">Último contato</dt>
                      <dd className="text-right">{formatDateOnly(row.last_contact_at)}</dd>
                    </div>
                  </dl>
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <Button
                      variant="secondary"
                      className="min-h-11 justify-center px-2 text-xs sm:text-sm"
                      aria-label="Registrar contato"
                      onClick={async () => {
                        setRegisteringClient(row)
                        await loadHistory(row.id)
                      }}
                    >
                      <PhoneForwarded size={16} className="sm:mr-1" aria-hidden />
                      <span className="hidden sm:inline">Contato</span>
                    </Button>
                    <Button
                      variant="ghost"
                      className="min-h-11 justify-center border border-slate-200 px-2 text-xs sm:text-sm"
                      aria-label="Agendar follow-up"
                      onClick={() => navigate(`/bem-aviv/follow-up/agendar/${row.id}`)}
                    >
                      <CalendarPlus size={16} className="sm:mr-1" aria-hidden />
                      <span className="hidden sm:inline">Agendar</span>
                    </Button>
                    <Button
                      variant="primary"
                      className="min-h-11 justify-center px-2 text-xs sm:text-sm"
                      aria-label="Abrir WhatsApp"
                      onClick={() => openWhatsapp(row)}
                    >
                      <MessageCircle size={16} className="sm:mr-1" aria-hidden />
                      <span className="hidden sm:inline">WhatsApp</span>
                    </Button>
                  </div>
                </li>
              ))
            )}
          </ul>

          <div className="table-wrap hidden md:block">
            <table>
              <thead>
                <tr>
                  <th>
                    <button type="button" className="font-semibold" onClick={() => toggleSort('full_name')}>
                      CLIENTE
                    </button>
                  </th>
                  <th>
                    <button type="button" className="font-semibold" onClick={() => toggleSort('phone')}>
                      TELEFONE
                    </button>
                  </th>
                  <th>
                    <button type="button" className="font-semibold" onClick={() => toggleSort('client_status')}>
                      STATUS CLIENTE
                    </button>
                  </th>
                  <th>
                    <button type="button" className="font-semibold" onClick={() => toggleSort('commercial_stage')}>
                      ETAPA COMERCIAL
                    </button>
                  </th>
                  <th>
                    <button type="button" className="font-semibold" onClick={() => toggleSort('last_contact_at')}>
                      ÚLTIMO CONTATO
                    </button>
                  </th>
                  <th>
                    <button type="button" className="font-semibold" onClick={() => toggleSort('next_followup_at')}>
                      PRÓXIMO FOLLOW-UP
                    </button>
                  </th>
                  <th>
                    <button type="button" className="font-semibold" onClick={() => toggleSort('next_followup_status')}>
                      STATUS FOLLOW-UP
                    </button>
                  </th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span>{row.full_name}</span>
                        {clientHadEko7Presentation(row) ? (
                          <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-violet-800">EKO7</span>
                        ) : null}
                      </div>
                    </td>
                    <td>{formatPhone(row.phone_1) || formatPhone(row.phone_2) || '—'}</td>
                    <td>{clientStatusPill(row.client_status)}</td>
                    <td>{row.commercial_stage || 'CONTATO'}</td>
                    <td>{formatDateOnly(row.last_contact_at)}</td>
                    <td>{formatDateOnly(row.next_followup_at)}</td>
                    <td>{row.next_followup_status || 'PENDENTE'}</td>
                    <td className="whitespace-nowrap">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="secondary"
                          className="px-2.5"
                          onClick={async () => {
                            setRegisteringClient(row)
                            await loadHistory(row.id)
                          }}
                          title="Registrar contato"
                        >
                          <PhoneForwarded size={15} />
                        </Button>
                        <Button
                          variant="ghost"
                          className="px-2.5"
                          onClick={() => navigate(`/bem-aviv/follow-up/agendar/${row.id}`)}
                          title="Agendar próximo follow-up"
                        >
                          <CalendarPlus size={15} />
                        </Button>
                        <Button variant="primary" className="px-2.5" onClick={() => openWhatsapp(row)} title="Abrir WhatsApp">
                          <MessageCircle size={15} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-slate-500">
                      Nenhum cliente encontrado com os filtros atuais.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-3 shadow-[0_-4px_20px_rgba(15,23,42,0.06)] backdrop-blur-md md:hidden"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        <Button className="min-h-12 w-full text-base" onClick={() => setStartFollowupOpen(true)}>
          <PlusCircle size={18} className="mr-2 shrink-0" aria-hidden />
          Iniciar novo follow-up
        </Button>
      </div>

      {registeringClient ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-3">
          <div className="w-full max-w-2xl space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-xl sm:p-5">
            <div>
              <h3 className="text-lg font-semibold">REGISTRAR CONTATO</h3>
              <p className="text-sm text-slate-500">{registeringClient.full_name}</p>
            </div>
            <form onSubmit={submitRegisterContact} className="grid gap-3 sm:grid-cols-2">
              <div>
                <label>DATA DO CONTATO</label>
                <input
                  type="date"
                  required
                  value={registerForm.contacted_at}
                  onChange={(e) => setRegisterForm((prev) => ({ ...prev, contacted_at: e.target.value }))}
                />
              </div>
              <div>
                <label>CANAL</label>
                <select value={registerForm.channel} onChange={(e) => setRegisterForm((prev) => ({ ...prev, channel: e.target.value }))}>
                  <option value="WHATSAPP">WHATSAPP</option>
                  <option value="LIGACAO">LIGAÇÃO</option>
                  <option value="EMAIL">E-MAIL</option>
                  <option value="OUTRO">OUTRO</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label>RESULTADO</label>
                <input value={registerForm.result} onChange={(e) => setRegisterForm((prev) => ({ ...prev, result: e.target.value }))} />
              </div>
              <div className="sm:col-span-2">
                <label>OBSERVAÇÕES</label>
                <textarea rows={3} value={registerForm.notes} onChange={(e) => setRegisterForm((prev) => ({ ...prev, notes: e.target.value }))} />
              </div>

              <div className="sm:col-span-2 flex gap-2">
                <Button type="submit">{editingHistoryId ? 'Salvar edição' : 'Salvar contato'}</Button>
                {editingHistoryId ? (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setEditingHistoryId(null)
                      setRegisterForm({
                        contacted_at: todayInputDate(),
                        channel: 'WHATSAPP',
                        result: '',
                        notes: '',
                      })
                    }}
                  >
                    Cancelar edição
                  </Button>
                ) : null}
                <Button
                  variant="secondary"
                  onClick={() => {
                    setRegisteringClient(null)
                    setHistoryRows([])
                    setEditingHistoryId(null)
                  }}
                >
                  Fechar
                </Button>
              </div>
            </form>

            <div className="rounded-lg border border-slate-200">
              <p className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">ÚLTIMOS CONTATOS</p>
              <div className="max-h-44 overflow-y-auto p-3 text-sm">
                {loadingHistory ? <p className="text-slate-500">CARREGANDO HISTÓRICO...</p> : null}
                {!loadingHistory && historyRows.length === 0 ? <p className="text-slate-500">SEM REGISTROS.</p> : null}
                {!loadingHistory
                  ? historyRows.map((item) => (
                      <div key={item.id} className="mb-2 rounded-md border border-slate-200 p-2 last:mb-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs text-slate-500">
                            {formatDateOnly(item.contacted_at)} • {item.channel} • {item.created_by_name || '—'}
                          </p>
                          <button
                            type="button"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                            onClick={() => startEditHistoryEntry(item)}
                            title="Editar contato"
                            aria-label="Editar contato"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            type="button"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-red-300 bg-white text-red-700 hover:bg-red-50"
                            onClick={() => void removeHistoryEntry(item.id)}
                            title="Excluir contato"
                            aria-label="Excluir contato"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <p>{item.result || 'SEM RESULTADO'}</p>
                        {item.notes ? <p className="text-xs text-slate-500">{item.notes}</p> : null}
                      </div>
                    ))
                  : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {startFollowupOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-3">
          <div className="w-full max-w-xl rounded-xl border border-slate-200 bg-white p-4 shadow-xl sm:p-5">
            <h3 className="text-lg font-semibold">INICIAR NOVO FOLLOW-UP</h3>
            <p className="mb-4 text-sm text-slate-500">Selecione um cliente sem follow-up (ou todos) para registrar contato ou agendar retorno.</p>
            <div className="space-y-3">
              <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={startFollowupForm.onlyWithoutSchedule}
                  onChange={(e) =>
                    setStartFollowupForm((prev) => ({
                      ...prev,
                      onlyWithoutSchedule: e.target.checked,
                      clientId: '',
                    }))
                  }
                />
                Mostrar apenas clientes sem follow-up agendado
              </label>
              <div>
                <label>CLIENTE</label>
                <select
                  value={startFollowupForm.clientId}
                  onChange={(e) => setStartFollowupForm((prev) => ({ ...prev, clientId: e.target.value }))}
                >
                  <option value="">— SELECIONE —</option>
                  {startFollowupClientOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.full_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button
                onClick={async () => {
                  const client = rows.find((r) => r.id === startFollowupForm.clientId)
                  if (!client) {
                    alert('SELECIONE UM CLIENTE.')
                    return
                  }
                  setStartFollowupOpen(false)
                  setRegisteringClient(client)
                  await loadHistory(client.id)
                }}
              >
                Registrar contato
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  const client = rows.find((r) => r.id === startFollowupForm.clientId)
                  if (!client) {
                    alert('SELECIONE UM CLIENTE.')
                    return
                  }
                  setStartFollowupOpen(false)
                  navigate(`/bem-aviv/follow-up/agendar/${client.id}`)
                }}
              >
                Agendar follow-up
              </Button>
              <Button variant="ghost" onClick={() => setStartFollowupOpen(false)}>
                Fechar
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
