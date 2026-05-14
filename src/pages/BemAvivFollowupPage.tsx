import { useUser } from '@clerk/clerk-react'
import { CalendarPlus, History, MessageCircle, Pencil, PhoneForwarded, PlusCircle, Search, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { useSupabase } from '../hooks/useSupabase'
import { useCompany } from '../context/CompanyContext'
import { clerkEmailCandidates } from '../lib/clerkEmails'
import { resolveDataOwnerId } from '../lib/dataOwner'
import { buildWhatsappUrl } from '../lib/whatsapp'

type FollowupStatus = 'PENDENTE' | 'CONCLUIDO' | 'CANCELADO'
type DateFilter = 'TODOS' | 'VENCIDOS' | 'HOJE' | 'PROXIMOS_7' | 'SEM_AGENDAMENTO'
type StatusFilter = 'TODOS' | FollowupStatus | 'VISITA_AGENDADA'
type SortKey = 'full_name' | 'phone' | 'client_status' | 'commercial_stage' | 'last_contact_at' | 'next_followup_at' | 'next_followup_status'

type Cliente = {
  id: string
  full_name: string
  phone_1: string | null
  phone_2: string | null
  client_status: string | null
  commercial_stage: string | null
  last_contact_at: string | null
  next_followup_at: string | null
  next_followup_note: string | null
  next_followup_status: FollowupStatus | null
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

function toInputDateTimeLocal(value?: string | null) {
  if (!value) return ''
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return ''
  const tz = dt.getTimezoneOffset() * 60_000
  const local = new Date(dt.getTime() - tz)
  return local.toISOString().slice(0, 16)
}

function formatDateTime(value?: string | null) {
  if (!value) return '—'
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(dt)
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

/** Lista 2: concluídos com último toque (cadastro ou histórico) acima deste limite. */
const STALE_CONCLUIDO_DAYS = 30

/** Maior instante entre `last_contact_at` e o último `bem_aviv_client_followups`. Zero = nenhum dos dois. */
function lastTouchMsFromClientAndFollowup(client: Cliente, latestFollowup: FollowupHistoryRow | undefined): number {
  let m = 0
  if (client.last_contact_at) {
    const t = new Date(client.last_contact_at).getTime()
    if (!Number.isNaN(t)) m = Math.max(m, t)
  }
  if (latestFollowup?.contacted_at) {
    const t = new Date(latestFollowup.contacted_at).getTime()
    if (!Number.isNaN(t)) m = Math.max(m, t)
  }
  return m
}

/** CONCLUÍDO e já houve contacto alguma vez, mas o último toque (cadastro ou histórico) é há mais de N dias. */
function isConcluidoMaisNDiasSemContactar(
  client: Cliente,
  latestFollowup: FollowupHistoryRow | undefined,
  staleDays: number,
): boolean {
  if ((client.next_followup_status ?? 'PENDENTE') !== 'CONCLUIDO') return false
  const touch = lastTouchMsFromClientAndFollowup(client, latestFollowup)
  if (touch === 0) return false
  return Date.now() - touch > staleDays * 86_400_000
}

function formatDaysAgoLabel(iso: string | null): string {
  if (!iso) return 'sem data no cadastro'
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (d <= 0) return 'hoje'
  return `há ${d} dias`
}

function truncateText(s: string | null, max: number) {
  if (!s) return '—'
  const t = s.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max)}…`
}

function formatDaysSinceTouchMs(ms: number): string {
  if (ms === 0) return 'sem contato (cadastro nem histórico)'
  return formatDaysAgoLabel(new Date(ms).toISOString())
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

  const [rows, setRows] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dateFilter, setDateFilter] = useState<DateFilter>('TODOS')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('TODOS')
  const [sortKey, setSortKey] = useState<SortKey>('full_name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [registeringClient, setRegisteringClient] = useState<Cliente | null>(null)
  const [historyRows, setHistoryRows] = useState<FollowupHistoryRow[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [editingHistoryId, setEditingHistoryId] = useState<string | null>(null)
  const [startFollowupOpen, setStartFollowupOpen] = useState(false)
  const [startFollowupForm, setStartFollowupForm] = useState<StartFollowupForm>({
    clientId: '',
    onlyWithoutSchedule: true,
  })

  const [registerForm, setRegisterForm] = useState({
    contacted_at: toInputDateTimeLocal(new Date().toISOString()),
    channel: 'WHATSAPP',
    result: '',
    notes: '',
  })

  /** Último registo em bem_aviv_client_followups por cliente (para regras sem contacto / 30 dias). */
  const [latestFollowupByClientId, setLatestFollowupByClientId] = useState<Record<string, FollowupHistoryRow>>({})
  const [latestFollowupsReady, setLatestFollowupsReady] = useState(false)

  const load = useCallback(async () => {
    if (!supabase || !ownerUserId || !activeCompanyId) {
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error } = await supabase
      .from('bem_aviv_clients')
      .select('id, full_name, phone_1, phone_2, client_status, commercial_stage, last_contact_at, next_followup_at, next_followup_note, next_followup_status')
      .eq('user_id', ownerUserId)
      .eq('company_id', activeCompanyId)
      .order('full_name')

    if (error) {
      alert(error.message)
      setRows([])
    } else {
      setRows((data as Cliente[]) ?? [])
    }
    setLoading(false)
  }, [ownerUserId, supabase, activeCompanyId])

  useEffect(() => {
    void load()
  }, [load])

  const loadHistory = useCallback(
    async (clientId: string) => {
      if (!supabase || !followupUserId || !activeCompanyId) return
      setLoadingHistory(true)
      const { data, error } = await supabase
        .from('bem_aviv_client_followups')
        .select('id, contacted_at, channel, created_by_name, result, notes')
        .is('deleted_at', null)
        .eq('user_id', followupUserId)
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
    [followupUserId, supabase, activeCompanyId],
  )

  useEffect(() => {
    const focus = (location.state as FollowupLocationState | null)?.bemAvivClientFocus
    if (!focus || focus.mode !== 'history' || rows.length === 0) return

    const client = rows.find((r) => r.id === focus.id)
    navigate('.', { replace: true, state: {} })
    if (!client) return

    setRegisteringClient(client)
    setRegisterForm({
      contacted_at: toInputDateTimeLocal(new Date().toISOString()),
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
        contacted_at: toInputDateTimeLocal(new Date().toISOString()),
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
      contacted_at: toInputDateTimeLocal(item.contacted_at),
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

      if (dateFilter === 'SEM_AGENDAMENTO') {
        return !nextDate
      }
      if (dateFilter === 'TODOS') {
        return true
      }
      if (!nextDate) return false

      if (dateFilter === 'VENCIDOS') return nextDate < now
      if (dateFilter === 'HOJE') return nextDate >= todayStart && nextDate <= todayEnd
      if (dateFilter === 'PROXIMOS_7') return nextDate >= todayStart && nextDate <= nextSevenEnd
      return true
    })
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
  }, [rows, search, dateFilter, statusFilter, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (sortKey !== key) {
      setSortKey(key)
      setSortDir('asc')
      return
    }
    setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
  }

  const concluidoMais30DiasSemContactar = useMemo(() => {
    if (!latestFollowupsReady) return []
    return rows
      .filter((r) => isConcluidoMaisNDiasSemContactar(r, latestFollowupByClientId[r.id], STALE_CONCLUIDO_DAYS))
      .sort(
        (a, b) =>
          lastTouchMsFromClientAndFollowup(a, latestFollowupByClientId[a.id]) -
          lastTouchMsFromClientAndFollowup(b, latestFollowupByClientId[b.id]),
      )
  }, [rows, latestFollowupByClientId, latestFollowupsReady])

  useEffect(() => {
    if (!supabase || !followupUserId || !activeCompanyId) {
      setLatestFollowupByClientId({})
      setLatestFollowupsReady(true)
      return
    }
    const ids = rows.map((r) => r.id)
    if (ids.length === 0) {
      setLatestFollowupByClientId({})
      setLatestFollowupsReady(true)
      return
    }
    setLatestFollowupsReady(false)
    let cancelled = false
    const CHUNK = 120
    void (async () => {
      const map: Record<string, FollowupHistoryRow> = {}
      for (let i = 0; i < ids.length; i += CHUNK) {
        if (cancelled) return
        const chunk = ids.slice(i, i + CHUNK)
        const { data, error } = await supabase
          .from('bem_aviv_client_followups')
          .select('id, client_id, contacted_at, channel, created_by_name, result, notes')
          .is('deleted_at', null)
          .eq('user_id', followupUserId)
          .eq('company_id', activeCompanyId)
          .in('client_id', chunk)
          .order('contacted_at', { ascending: false })
        if (cancelled) return
        if (error) {
          if (!cancelled) {
            setLatestFollowupByClientId({})
            setLatestFollowupsReady(true)
          }
          return
        }
        const list = (data ?? []) as Array<FollowupHistoryRow & { client_id: string }>
        for (const row of list) {
          if (map[row.client_id]) continue
          map[row.client_id] = {
            id: row.id,
            contacted_at: row.contacted_at,
            channel: row.channel,
            created_by_name: row.created_by_name,
            result: row.result,
            notes: row.notes,
          }
        }
      }
      if (cancelled) return
      setLatestFollowupByClientId(map)
      setLatestFollowupsReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [supabase, followupUserId, rows, activeCompanyId])

  const startFollowupClientOptions = useMemo(() => {
    const source = startFollowupForm.onlyWithoutSchedule ? rows.filter((r) => !r.next_followup_at) : rows
    return source.sort((a, b) => a.full_name.localeCompare(b.full_name, 'pt-BR')).map((r) => ({ id: r.id, full_name: r.full_name }))
  }, [rows, startFollowupForm.onlyWithoutSchedule])

  async function submitRegisterContact(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !followupUserId || !registeringClient || !activeCompanyId) return
    if (!registerForm.contacted_at) {
      alert('INFORME A DATA/HORA DO CONTATO.')
      return
    }

    const contactedAtIso = new Date(registerForm.contacted_at).toISOString()
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
      contacted_at: toInputDateTimeLocal(new Date().toISOString()),
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

      {!loading && latestFollowupsReady && concluidoMais30DiasSemContactar.length > 0 ? (
        <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-start gap-2">
            <History className="mt-0.5 h-5 w-5 shrink-0 text-violet-700" aria-hidden />
            <div>
              <h3 className="text-sm font-semibold text-violet-950">Concluídos — mais de {STALE_CONCLUIDO_DAYS} dias sem contactar</h3>
              <p className="mt-1 text-sm text-violet-900/85">
                Apenas clientes com status de follow-up <span className="font-semibold">concluído</span> e com último contacto (cadastro ou
                histórico) há mais de {STALE_CONCLUIDO_DAYS} dias. Ordenado do mais antigo para o mais recente.
              </p>
            </div>
            <span className="ml-auto rounded-full bg-violet-200/80 px-2.5 py-0.5 text-xs font-semibold text-violet-900">
              {concluidoMais30DiasSemContactar.length} cliente{concluidoMais30DiasSemContactar.length === 1 ? '' : 's'}
            </span>
          </div>

          <ul className="space-y-3 md:hidden" aria-label="Concluídos há mais de 30 dias sem contacto">
            {concluidoMais30DiasSemContactar.map((row) => {
              const lastHist = latestFollowupByClientId[row.id]
              const refMs = lastTouchMsFromClientAndFollowup(row, lastHist)
              return (
                <li key={row.id} className="rounded-xl border border-violet-200/80 bg-white p-4 shadow-sm">
                  <p className="font-semibold text-slate-900">{row.full_name}</p>
                  <p className="mt-1 text-xs text-slate-600">
                    Último toque (referência): {formatDateTime(new Date(refMs).toISOString())} · {formatDaysSinceTouchMs(refMs)}
                  </p>
                  <p className="mt-0.5 text-[9px] text-slate-500">
                    Cadastro: {formatDateTime(row.last_contact_at)} · Último no histórico:{' '}
                    {lastHist ? formatDateTime(lastHist.contacted_at) : '—'}
                  </p>
                  <div className="mt-2 rounded-md border border-slate-100 bg-slate-50/80 p-2 text-xs text-slate-700">
                    <p className="font-medium text-slate-600">Último registro no histórico</p>
                    {lastHist ? (
                      <>
                        <p>
                          {formatDateTime(lastHist.contacted_at)} · {lastHist.channel}
                        </p>
                        <p className="mt-0.5">{truncateText(lastHist.result, 120)}</p>
                        {lastHist.notes ? (
                          <p className="mt-0.5 text-slate-500">{truncateText(lastHist.notes, 100)}</p>
                        ) : null}
                      </>
                    ) : (
                      <p className="text-slate-500">—</p>
                    )}
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <Button
                      variant="secondary"
                      className="min-h-11 justify-center px-2 text-xs sm:text-sm"
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
                      onClick={() => navigate(`/bem-aviv/follow-up/agendar/${row.id}`)}
                    >
                      <CalendarPlus size={16} className="sm:mr-1" aria-hidden />
                      <span className="hidden sm:inline">Agendar</span>
                    </Button>
                    <Button variant="primary" className="min-h-11 justify-center px-2 text-xs sm:text-sm" onClick={() => openWhatsapp(row)}>
                      <MessageCircle size={16} className="sm:mr-1" aria-hidden />
                      <span className="hidden sm:inline">WhatsApp</span>
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>

          <div className="table-wrap hidden md:block">
            <table>
              <thead>
                <tr>
                  <th>CLIENTE</th>
                  <th>REFERÊNCIA (ÚLTIMO TOQUE)</th>
                  <th>ÚLTIMO REGISTRO (HISTÓRICO)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {concluidoMais30DiasSemContactar.map((row) => {
                  const lastHist = latestFollowupByClientId[row.id]
                  const refMs = lastTouchMsFromClientAndFollowup(row, lastHist)
                  return (
                    <tr key={row.id}>
                      <td className="font-medium">{row.full_name}</td>
                      <td>
                        <span className="text-slate-800">{formatDateTime(new Date(refMs).toISOString())}</span>
                        <span className="ml-1 text-xs text-slate-500">({formatDaysSinceTouchMs(refMs)})</span>
                        <p className="mt-1 text-[9px] text-slate-500">
                          Cad.: {formatDateTime(row.last_contact_at)} · Hist.:{' '}
                          {lastHist ? formatDateTime(lastHist.contacted_at) : '—'}
                        </p>
                      </td>
                      <td className="max-w-md text-sm">
                        {lastHist ? (
                          <div>
                            <span className="text-slate-800">
                              {formatDateTime(lastHist.contacted_at)} · {lastHist.channel}
                            </span>
                            <p className="mt-0.5 text-slate-600">{truncateText(lastHist.result, 90)}</p>
                            {lastHist.notes ? <p className="text-xs text-slate-500">{truncateText(lastHist.notes, 70)}</p> : null}
                          </div>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
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
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label>BUSCA</label>
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-2.5 top-2.5 text-slate-400" />
            <input className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nome ou telefone" />
          </div>
        </div>
        <div>
          <label>PERÍODO</label>
          <select value={dateFilter} onChange={(e) => setDateFilter(e.target.value as DateFilter)}>
            <option value="VENCIDOS">Vencidos</option>
            <option value="HOJE">Hoje</option>
            <option value="PROXIMOS_7">Próximos 7 dias</option>
            <option value="SEM_AGENDAMENTO">Sem agendamento</option>
            <option value="TODOS">Todos</option>
          </select>
        </div>
        <div>
          <label>STATUS</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
            <option value="TODOS">Todos</option>
            <option value="PENDENTE">Pendente</option>
            <option value="CONCLUIDO">Concluído</option>
            <option value="CANCELADO">Cancelado</option>
            <option value="VISITA_AGENDADA">Visita agendada</option>
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
                      <p className="font-semibold text-slate-900">{row.full_name}</p>
                      <p className="mt-0.5 text-sm text-slate-600">{formatPhone(row.phone_1) || formatPhone(row.phone_2) || '—'}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                      {row.next_followup_status || 'PENDENTE'}
                    </span>
                  </div>
                  <dl className="mt-3 grid gap-1.5 text-xs text-slate-600">
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">Etapa</dt>
                      <dd className="text-right font-medium text-slate-800">{row.commercial_stage || 'CONTATO'}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">Próximo</dt>
                      <dd className="text-right">{formatDateTime(row.next_followup_at)}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-slate-500">Último contato</dt>
                      <dd className="text-right">{formatDateTime(row.last_contact_at)}</dd>
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
                    <td>{row.full_name}</td>
                    <td>{formatPhone(row.phone_1) || formatPhone(row.phone_2) || '—'}</td>
                    <td>{row.client_status || '—'}</td>
                    <td>{row.commercial_stage || 'CONTATO'}</td>
                    <td>{formatDateTime(row.last_contact_at)}</td>
                    <td>{formatDateTime(row.next_followup_at)}</td>
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
                <label>DATA/HORA DO CONTATO</label>
                <input
                  type="datetime-local"
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
                        contacted_at: toInputDateTimeLocal(new Date().toISOString()),
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
                            {formatDateTime(item.contacted_at)} • {item.channel} • {item.created_by_name || '—'}
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
