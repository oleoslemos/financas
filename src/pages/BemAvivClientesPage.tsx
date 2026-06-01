import { useUser } from '@clerk/clerk-react'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarPlus,
  CheckCircle2,
  ClipboardList,
  Eye,
  History,
  MessageCircle,
  Pencil,
  Presentation,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PedidoDetailModal } from '../components/bemAviv/PedidoDetailModal'
import { Button } from '../components/ui/Button'
import { useSupabase } from '../hooks/useSupabase'
import { useCompany } from '../context/CompanyContext'
import { resolveDataOwnerId } from '../lib/dataOwner'
import { clerkEmailCandidates } from '../lib/clerkEmails'
import {
  BEM_AVIV_CLIENT_COMMERCIAL_STAGE_OPTIONS,
  BEM_AVIV_CLIENT_STATUS_OPTIONS,
  bemAvivClientStatusShortLabel,
  clientHadEko7Presentation,
  clientHasConfirmedPurchase,
  clientMatchesEko7Filter,
  type BemAvivClientStatusFilter,
  type BemAvivEko7Filter,
} from '../lib/bemAvivClientStatus'
import { cn } from '../lib/cn'
import { formatBRL } from '../lib/format'
import { normalizeSearchText, toUpperTrim } from '../lib/text'
import { buildWhatsappUrl } from '../lib/whatsapp'
import { dateInputToIso, formatDateOnly, todayInputDate, toInputDate } from '../lib/dates'

type OrderRow = {
  id: string
  order_date: string
  document_type: 'ORCAMENTO' | 'PEDIDO'
  document_number: string | null
  status: string
  total_amount: number
}

const pedidosIconBtn =
  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-sky-200 bg-sky-50 text-sky-700 shadow-sm transition-all hover:bg-sky-100 active:scale-95'

const CHANNEL_AGENDAMENTO = 'AGENDAMENTO'

type FollowupHistoryRow = {
  id: string
  client_id: string
  contacted_at: string
  channel: string
  created_by_name?: string | null
  result: string | null
  notes: string | null
}

type HistoryTimelineItem =
  | { key: string; kind: 'contact'; row: FollowupHistoryRow }
  | {
      key: string
      kind: 'schedule-active'
      status: string
      at: string
      summary: string
      details: string
      commercialStage: string
    }
  | {
      key: string
      kind: 'schedule-record'
      row: FollowupHistoryRow
      status: string
      summary: string
      details: string
    }

function encodeAgendamentoResult(status: string, summary: string) {
  return `${status.toUpperCase()}|${summary.trim()}`
}

function parseAgendamentoResult(result: string | null) {
  const raw = (result ?? '').trim()
  const pipe = raw.indexOf('|')
  if (pipe > 0) {
    const status = raw.slice(0, pipe).toUpperCase()
    const summary = raw.slice(pipe + 1).trim()
    if (
      status === 'PENDENTE' ||
      status === 'CONCLUIDO' ||
      status === 'CANCELADO' ||
      status === 'REAGENDADO'
    ) {
      return { status, summary }
    }
  }
  return { status: 'CONCLUIDO', summary: raw }
}

function sameCalendarDay(a: string | null | undefined, b: string | null | undefined) {
  if (!a || !b) return false
  return toInputDate(a) === toInputDate(b)
}

function buildHistoryTimeline(client: Cliente, rows: FollowupHistoryRow[]): HistoryTimelineItem[] {
  const items: HistoryTimelineItem[] = []
  const contacts = rows.filter((r) => r.channel !== CHANNEL_AGENDAMENTO)
  const schedules = rows.filter((r) => r.channel === CHANNEL_AGENDAMENTO)

  for (const r of contacts) {
    items.push({ key: `contact-${r.id}`, kind: 'contact', row: r })
  }

  for (const r of schedules) {
    const parsed = parseAgendamentoResult(r.result)
    items.push({
      key: `schedule-${r.id}`,
      kind: 'schedule-record',
      row: r,
      status: parsed.status,
      summary: parsed.summary,
      details: (r.notes ?? '').trim(),
    })
  }

  const pendingOnClient =
    client.next_followup_at && (client.next_followup_status ?? 'PENDENTE').toUpperCase() === 'PENDENTE'
  if (pendingOnClient) {
    const note = splitFollowupNote(client.next_followup_note)
    const duplicateInRows = schedules.some(
      (r) =>
        sameCalendarDay(r.contacted_at, client.next_followup_at) &&
        parseAgendamentoResult(r.result).status === 'PENDENTE',
    )
    if (!duplicateInRows) {
      items.push({
        key: 'schedule-active',
        kind: 'schedule-active',
        status: 'PENDENTE',
        at: client.next_followup_at!,
        summary: note.summary,
        details: note.details,
        commercialStage: client.commercial_stage || 'CONTATO',
      })
    }
  }

  items.sort((a, b) => {
    const ta =
      a.kind === 'contact'
        ? new Date(a.row.contacted_at).getTime()
        : a.kind === 'schedule-active'
          ? new Date(a.at).getTime()
          : new Date(a.row.contacted_at).getTime()
    const tb =
      b.kind === 'contact'
        ? new Date(b.row.contacted_at).getTime()
        : b.kind === 'schedule-active'
          ? new Date(b.at).getTime()
          : new Date(b.row.contacted_at).getTime()
    return tb - ta
  })

  return items
}

function composeFollowupNote(summary: string, details: string) {
  const s = summary.trim()
  const d = details.trim()
  if (s && d) return `RESUMO: ${s}\n${d}`
  if (s) return `RESUMO: ${s}`
  return d
}

function splitFollowupNote(note?: string | null) {
  const raw = (note ?? '').trim()
  if (!raw) return { summary: '', details: '' }
  const marker = 'RESUMO:'
  if (raw.toUpperCase().startsWith(marker)) {
    const firstBreak = raw.indexOf('\n')
    if (firstBreak > -1) {
      return {
        summary: raw.slice(marker.length, firstBreak).trim(),
        details: raw.slice(firstBreak + 1).trim(),
      }
    }
    return { summary: raw.slice(marker.length).trim(), details: '' }
  }
  return { summary: '', details: raw }
}

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
  commercial_stage: string | null
  last_contact_at: string | null
  next_followup_at: string | null
  next_followup_note: string | null
  next_followup_status: string | null
  eko7_presentation_at: string | null
}

type SortKey = 'full_name' | 'phones' | 'client_status'

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

function isMissingAuditColumnError(message?: string) {
  const m = (message ?? '').toLowerCase()
  return (
    m.includes('created_by_user_id') ||
    m.includes('created_by_name') ||
    m.includes('updated_by_user_id') ||
    m.includes('updated_by_name') ||
    m.includes('deleted_at') ||
    m.includes('deleted_by_user_id') ||
    m.includes('deleted_by_name')
  )
}

const AVATAR_PALETTE = [
  { bg: '#E6F1FB', fg: '#185FA5' },
  { bg: '#EAF3DE', fg: '#3B6D11' },
  { bg: '#FAEEDA', fg: '#854F0B' },
  { bg: '#EEEDFE', fg: '#3C3489' },
  { bg: '#FAECE7', fg: '#993C1D' },
  { bg: '#FBEAF0', fg: '#993556' },
  { bg: '#E1F5EE', fg: '#085041' },
  { bg: '#F1EFE8', fg: '#5F5E5A' },
]

function avatarPalette(name: string) {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % AVATAR_PALETTE.length
  return AVATAR_PALETTE[h]!
}

function initialsFromName(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean)
  if (p.length === 0) return '??'
  if (p.length === 1) return p[0]!.slice(0, 2).toUpperCase()
  return `${p[0]![0]}${p[p.length - 1]![0]}`.toUpperCase()
}

function phonesSortValue(r: Cliente) {
  return `${onlyDigits(r.phone_1 ?? '')}${onlyDigits(r.phone_2 ?? '')}`
}

function clientMatchesSearch(r: Cliente, raw: string) {
  const needle = raw.trim()
  if (!needle) return true
  const upper = normalizeSearchText(needle)
  const digits = onlyDigits(needle)
  if (normalizeSearchText(r.full_name ?? '').includes(upper)) return true
  if (normalizeSearchText(r.email ?? '').includes(upper)) return true
  if (digits.length > 0) {
    if (onlyDigits(r.cpf).includes(digits)) return true
    if (onlyDigits(r.phone_1 ?? '').includes(digits)) return true
    if (onlyDigits(r.phone_2 ?? '').includes(digits)) return true
  }
  return false
}

function clientStatusPill(status: string | null) {
  const s = (status ?? '').trim()
  if (s === 'PROSPECÇÃO') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#FAEEDA] px-2 py-0.5 text-[8px] font-medium text-[#854F0B]">
        <span className="h-1 w-1 rounded-full bg-[#EF9F27]" aria-hidden />
        Prospecção
      </span>
    )
  }
  if (s === 'CLIENTE - COLCHÃO') {
    return (
      <span className="inline-flex max-w-[11rem] items-center gap-1 rounded-full bg-[#EAF3DE] px-2 py-0.5 text-[8px] font-medium text-[#3B6D11]">
        <span className="h-1 w-1 rounded-full bg-[#639922]" aria-hidden />
        <span className="truncate">Cliente — colchão</span>
      </span>
    )
  }
  if (s === 'CLIENTE - DIVERSOS') {
    return (
      <span className="inline-flex max-w-[11rem] items-center gap-1 rounded-full bg-[#E6F1FB] px-2 py-0.5 text-[8px] font-medium text-[#185FA5]">
        <span className="h-1 w-1 rounded-full bg-[#185FA5]" aria-hidden />
        <span className="truncate">Cliente — diversos</span>
      </span>
    )
  }
  if (s === 'CLIENTE - COLCHÃO/DIVERSOS') {
    return (
      <span className="inline-flex max-w-[12rem] items-center gap-1 rounded-full bg-[#EEEDFE] px-2 py-0.5 text-[8px] font-medium text-[#3C3489]">
        <span className="h-1 w-1 rounded-full bg-[#6B5CB3]" aria-hidden />
        <span className="truncate">Colchão + diversos</span>
      </span>
    )
  }
  return <span className="text-[8px] text-slate-500">{s || '—'}</span>
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
  eko7_presentation_done: false,
  eko7_presentation_at: todayInputDate(),
}

export function BemAvivClientesPage() {
  const { user } = useUser()
  const supabase = useSupabase()
  const { activeCompanyId, loading: companyCtxLoading, error: companyCtxError } = useCompany()
  const ownerUserId = resolveDataOwnerId(user?.id, clerkEmailCandidates(user).join(','))
  const followupActorName = (user?.fullName || user?.primaryEmailAddress?.emailAddress || ownerUserId || 'USUÁRIO').trim().toUpperCase()

  const [rows, setRows] = useState<Cliente[]>([])
  const [editing, setEditing] = useState<Cliente | null>(null)
  const [loading, setLoading] = useState(true)
  const [queryError, setQueryError] = useState<string | null>(null)
  const [clientModalOpen, setClientModalOpen] = useState(false)
  const [cepLoading, setCepLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<BemAvivClientStatusFilter>('TODOS')
  const [eko7Filter, setEko7Filter] = useState<BemAvivEko7Filter>('TODOS')
  const [sortKey, setSortKey] = useState<SortKey>('full_name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [form, setForm] = useState(emptyForm)

  const [pedidosModalClient, setPedidosModalClient] = useState<Cliente | null>(null)
  const [pedidosModalLoading, setPedidosModalLoading] = useState(false)
  const [pedidosModalRows, setPedidosModalRows] = useState<OrderRow[]>([])
  const [pedidosDetailOrderId, setPedidosDetailOrderId] = useState<string | null>(null)
  const [scheduleModalClient, setScheduleModalClient] = useState<Cliente | null>(null)
  const [scheduleModalSaving, setScheduleModalSaving] = useState(false)
  const [scheduleModalForm, setScheduleModalForm] = useState({
    contact_done: false,
    next_followup_at: '',
    commercial_stage: 'CONTATO',
    summary: '',
    details: '',
  })
  const [historyModalClient, setHistoryModalClient] = useState<Cliente | null>(null)
  const [historyModalRows, setHistoryModalRows] = useState<FollowupHistoryRow[]>([])
  const [historyModalLoading, setHistoryModalLoading] = useState(false)
  const [registerInlineOpen, setRegisterInlineOpen] = useState(false)
  const [scheduleInlineOpen, setScheduleInlineOpen] = useState(false)
  const [scheduleInlineTarget, setScheduleInlineTarget] = useState<'new' | 'client' | 'followup'>('new')
  const [editingScheduleFollowupId, setEditingScheduleFollowupId] = useState<string | null>(null)
  const [editingHistoryId, setEditingHistoryId] = useState<string | null>(null)
  const [registerInlineSaving, setRegisterInlineSaving] = useState(false)
  const [scheduleInlineSaving, setScheduleInlineSaving] = useState(false)
  const [registerInlineForm, setRegisterInlineForm] = useState({
    contacted_at: todayInputDate(),
    channel: 'WHATSAPP',
    result: '',
    notes: '',
  })
  const [scheduleInlineForm, setScheduleInlineForm] = useState({
    contact_done: false,
    next_followup_at: todayInputDate(),
    commercial_stage: 'CONTATO',
    summary: '',
    details: '',
  })

  const load = useCallback(async () => {
    if (!supabase) {
      setLoading(false)
      return
    }
    if (companyCtxLoading) {
      setLoading(true)
      return
    }
    if (!activeCompanyId) {
      setQueryError(null)
      setRows([])
      setLoading(false)
      return
    }
    setLoading(true)
    setQueryError(null)
    const { data, error } = await supabase
      .from('bem_aviv_clients')
      .select('*')
      .eq('company_id', activeCompanyId)
      .order('full_name')
    if (error) {
      setQueryError(error.message)
      setRows([])
    } else {
      setRows((data as Cliente[]) ?? [])
    }
    setLoading(false)
  }, [supabase, activeCompanyId, companyCtxLoading])

  useEffect(() => {
    void load()
  }, [load])

  const dataLoadBanner = useMemo(
    () => [companyCtxError, queryError].filter(Boolean).join(' · '),
    [companyCtxError, queryError],
  )

  const stats = useMemo(() => {
    const total = rows.length
    const byStatus = (v: string) => rows.filter((r) => (r.client_status ?? '').trim() === v).length
    return {
      total,
      prospec: byStatus('PROSPECÇÃO'),
      clienteColchao: byStatus('CLIENTE - COLCHÃO'),
      clienteDiversos: byStatus('CLIENTE - DIVERSOS'),
      clienteColchaoDiversos: byStatus('CLIENTE - COLCHÃO/DIVERSOS'),
      eko7Apresentado: rows.filter((r) => clientHadEko7Presentation(r)).length,
      eko7NaoComprou: rows.filter((r) => clientHadEko7Presentation(r) && !clientHasConfirmedPurchase(r)).length,
      eko7Comprou: rows.filter((r) => clientHadEko7Presentation(r) && clientHasConfirmedPurchase(r)).length,
    }
  }, [rows])

  const historyTimeline = useMemo(() => {
    if (!historyModalClient) return []
    return buildHistoryTimeline(historyModalClient, historyModalRows)
  }, [historyModalClient, historyModalRows])

  const displayedRows = useMemo(() => {
    const filtered = rows.filter((r) => {
      if (!clientMatchesSearch(r, search)) return false
      if (statusFilter === 'TODOS') return true
      return (r.client_status ?? '').trim() === statusFilter
    }).filter((r) => clientMatchesEko7Filter(r, eko7Filter))
    const mul = sortDir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'full_name':
          cmp = (a.full_name ?? '').localeCompare(b.full_name ?? '', 'pt-BR')
          break
        case 'phones':
          cmp = phonesSortValue(a).localeCompare(phonesSortValue(b), 'pt-BR', { numeric: true })
          break
        case 'client_status':
          cmp = (a.client_status ?? '').localeCompare(b.client_status ?? '', 'pt-BR')
          break
        default:
          cmp = 0
      }
      return cmp * mul
    })
  }, [rows, search, statusFilter, eko7Filter, sortKey, sortDir])

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
      eko7_presentation_done: clientHadEko7Presentation(r),
      eko7_presentation_at: r.eko7_presentation_at ? toInputDate(r.eko7_presentation_at) : todayInputDate(),
    })
    setClientModalOpen(true)
  }

  function closeClientModal() {
    setClientModalOpen(false)
    setEditing(null)
    setForm(emptyForm)
  }

  function closeScheduleModal() {
    setScheduleModalClient(null)
    setScheduleModalSaving(false)
  }

  function openScheduleModal(client: Cliente) {
    const parsed = splitFollowupNote(client.next_followup_note)
    setScheduleModalClient(client)
    setScheduleModalForm({
      contact_done: false,
      next_followup_at: client.next_followup_at ? toInputDate(client.next_followup_at) : todayInputDate(),
      commercial_stage: client.commercial_stage || 'CONTATO',
      summary: parsed.summary,
      details: parsed.details,
    })
  }

  async function submitScheduleModal(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !ownerUserId || !scheduleModalClient || !activeCompanyId) return
    if (!scheduleModalForm.next_followup_at) {
      alert('INFORME A DATA DO AGENDAMENTO.')
      return
    }
    setScheduleModalSaving(true)
    try {
      await markPendingAgendamentoAsReagendado(scheduleModalClient.id)
      const { error } = await supabase
        .from('bem_aviv_clients')
        .update({
          next_followup_at: dateInputToIso(scheduleModalForm.next_followup_at),
          next_followup_note: composeFollowupNote(scheduleModalForm.summary, scheduleModalForm.details) || null,
          next_followup_status: 'PENDENTE',
          commercial_stage: scheduleModalForm.commercial_stage,
          last_contact_at: scheduleModalForm.contact_done
            ? new Date().toISOString()
            : scheduleModalClient.last_contact_at ?? null,
        })
        .eq('id', scheduleModalClient.id)
        .eq('company_id', activeCompanyId)
      if (error) throw new Error(error.message)
      await insertAgendamentoFollowup(
        scheduleModalClient.id,
        scheduleModalForm.next_followup_at,
        'PENDENTE',
        scheduleModalForm.summary,
        scheduleModalForm.details,
      )
      closeScheduleModal()
      await load()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao agendar.')
    } finally {
      setScheduleModalSaving(false)
    }
  }

  async function openHistoryModal(client: Cliente) {
    if (!supabase || !ownerUserId || !activeCompanyId) return
    setHistoryModalClient(client)
    setEditingHistoryId(null)
    setRegisterInlineOpen(false)
    setScheduleInlineOpen(false)
    setRegisterInlineSaving(false)
    setScheduleInlineSaving(false)
    setRegisterInlineForm({
      contacted_at: todayInputDate(),
      channel: 'WHATSAPP',
      result: '',
      notes: '',
    })
    setHistoryModalRows([])
    setHistoryModalLoading(true)
    let { data, error } = await supabase
      .from('bem_aviv_client_followups')
      .select('id, client_id, contacted_at, channel, created_by_name, result, notes')
      .is('deleted_at', null)
      .eq('company_id', activeCompanyId)
      .eq('client_id', client.id)
      .order('contacted_at', { ascending: false })
      .limit(200)
    if (error && isMissingAuditColumnError(error.message)) {
      const fallback = await supabase
        .from('bem_aviv_client_followups')
        .select('id, client_id, contacted_at, channel, result, notes')
        .eq('company_id', activeCompanyId)
        .eq('client_id', client.id)
        .order('contacted_at', { ascending: false })
        .limit(200)
      data = (fallback.data ?? []).map((r) => ({ ...r, created_by_name: null }))
      error = fallback.error
    }
    if (error) {
      setHistoryModalRows([])
      setHistoryModalLoading(false)
      return
    }
    setHistoryModalRows((data ?? []) as FollowupHistoryRow[])
    setHistoryModalLoading(false)
  }

  async function refetchHistoryModalRows(clientId: string): Promise<FollowupHistoryRow[]> {
    if (!supabase || !ownerUserId || !activeCompanyId) return []
    let { data, error } = await supabase
      .from('bem_aviv_client_followups')
      .select('id, client_id, contacted_at, channel, created_by_name, result, notes')
      .is('deleted_at', null)
      .eq('company_id', activeCompanyId)
      .eq('client_id', clientId)
      .order('contacted_at', { ascending: false })
      .limit(200)
    if (error && isMissingAuditColumnError(error.message)) {
      const fallback = await supabase
        .from('bem_aviv_client_followups')
        .select('id, client_id, contacted_at, channel, result, notes')
        .eq('company_id', activeCompanyId)
        .eq('client_id', clientId)
        .order('contacted_at', { ascending: false })
        .limit(200)
      data = (fallback.data ?? []).map((r) => ({ ...r, created_by_name: null }))
      error = fallback.error
    }
    if (error) return []
    return (data ?? []) as FollowupHistoryRow[]
  }

  async function refreshHistoryModalClient() {
    if (!supabase || !historyModalClient || !activeCompanyId) return
    const [{ data: clientRow }, rows] = await Promise.all([
      supabase
        .from('bem_aviv_clients')
        .select('*')
        .eq('id', historyModalClient.id)
        .eq('company_id', activeCompanyId)
        .maybeSingle(),
      refetchHistoryModalRows(historyModalClient.id),
    ])
    if (clientRow) setHistoryModalClient(clientRow as Cliente)
    setHistoryModalRows(rows)
  }

  async function insertAgendamentoFollowup(
    clientId: string,
    at: string,
    status: string,
    summary: string,
    details: string,
  ) {
    if (!supabase || !ownerUserId || !activeCompanyId) return
    const followupUserId = ownerUserId.toUpperCase()
    const contactedAtIso = dateInputToIso(at)
    let { error: insertError } = await supabase.from('bem_aviv_client_followups').insert({
      user_id: followupUserId,
      company_id: activeCompanyId,
      created_by_user_id: user?.id ?? null,
      created_by_name: followupActorName,
      client_id: clientId,
      contacted_at: contactedAtIso,
      channel: CHANNEL_AGENDAMENTO,
      result: encodeAgendamentoResult(status, summary),
      notes: details || null,
    })
    if (insertError && isMissingAuditColumnError(insertError.message)) {
      const fallback = await supabase.from('bem_aviv_client_followups').insert({
        user_id: followupUserId,
        company_id: activeCompanyId,
        client_id: clientId,
        contacted_at: contactedAtIso,
        channel: CHANNEL_AGENDAMENTO,
        result: encodeAgendamentoResult(status, summary),
        notes: details || null,
      })
      insertError = fallback.error
    }
    if (insertError) throw new Error(insertError.message)
  }

  async function markPendingAgendamentoAsReagendado(clientId: string) {
    if (!supabase || !activeCompanyId) return
    const rows = await refetchHistoryModalRows(clientId)
    for (const r of rows) {
      if (r.channel !== CHANNEL_AGENDAMENTO) continue
      const parsed = parseAgendamentoResult(r.result)
      if (parsed.status !== 'PENDENTE') continue
      let { error } = await supabase
        .from('bem_aviv_client_followups')
        .update({
          result: encodeAgendamentoResult('REAGENDADO', parsed.summary),
          updated_by_user_id: user?.id ?? null,
          updated_by_name: followupActorName,
        })
        .eq('id', r.id)
        .eq('company_id', activeCompanyId)
      if (error && isMissingAuditColumnError(error.message)) {
        const fallback = await supabase
          .from('bem_aviv_client_followups')
          .update({ result: encodeAgendamentoResult('REAGENDADO', parsed.summary) })
          .eq('id', r.id)
          .eq('company_id', activeCompanyId)
        error = fallback.error
      }
      if (error) throw new Error(error.message)
    }
  }

  async function markPendingAgendamentoRecordsConcluido(clientId: string, at: string | null) {
    if (!supabase || !activeCompanyId) return
    const rows = await refetchHistoryModalRows(clientId)
    for (const r of rows) {
      if (r.channel !== CHANNEL_AGENDAMENTO) continue
      const parsed = parseAgendamentoResult(r.result)
      if (parsed.status !== 'PENDENTE') continue
      if (at && !sameCalendarDay(r.contacted_at, at)) continue
      let { error } = await supabase
        .from('bem_aviv_client_followups')
        .update({
          result: encodeAgendamentoResult('CONCLUIDO', parsed.summary),
          updated_by_user_id: user?.id ?? null,
          updated_by_name: followupActorName,
        })
        .eq('id', r.id)
        .eq('company_id', activeCompanyId)
      if (error && isMissingAuditColumnError(error.message)) {
        const fallback = await supabase
          .from('bem_aviv_client_followups')
          .update({ result: encodeAgendamentoResult('CONCLUIDO', parsed.summary) })
          .eq('id', r.id)
          .eq('company_id', activeCompanyId)
        error = fallback.error
      }
      if (error) throw new Error(error.message)
    }
  }

  async function confirmScheduleDone(at?: string | null) {
    if (!supabase || !ownerUserId || !historyModalClient || !activeCompanyId) return
    const doneAt = new Date().toISOString()
    const { error } = await supabase
      .from('bem_aviv_clients')
      .update({
        next_followup_status: 'CONCLUIDO',
        last_contact_at: doneAt,
      })
      .eq('id', historyModalClient.id)
      .eq('company_id', activeCompanyId)
    if (error) {
      alert(error.message)
      return
    }
    try {
      await markPendingAgendamentoRecordsConcluido(
        historyModalClient.id,
        at ?? historyModalClient.next_followup_at,
      )
      await refreshHistoryModalClient()
      await load()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao atualizar histórico.')
    }
  }

  function openEditScheduleActive() {
    if (!historyModalClient) return
    const parsed = splitFollowupNote(historyModalClient.next_followup_note)
    setRegisterInlineOpen(false)
    setEditingHistoryId(null)
    setScheduleInlineTarget('client')
    setEditingScheduleFollowupId(null)
    setScheduleInlineForm({
      contact_done: false,
      next_followup_at: historyModalClient.next_followup_at
        ? toInputDate(historyModalClient.next_followup_at)
        : todayInputDate(),
      commercial_stage: historyModalClient.commercial_stage || 'CONTATO',
      summary: parsed.summary,
      details: parsed.details,
    })
    setScheduleInlineOpen(true)
  }

  function openReagendarSchedule() {
    openEditScheduleActive()
    setScheduleInlineTarget('new')
  }

  function openEditScheduleRecord(row: FollowupHistoryRow) {
    const parsed = parseAgendamentoResult(row.result)
    setRegisterInlineOpen(false)
    setEditingHistoryId(null)
    setScheduleInlineTarget('followup')
    setEditingScheduleFollowupId(row.id)
    setScheduleInlineForm({
      contact_done: false,
      next_followup_at: toInputDate(row.contacted_at),
      commercial_stage: historyModalClient?.commercial_stage || 'CONTATO',
      summary: parsed.summary,
      details: (row.notes ?? '').trim(),
    })
    setScheduleInlineOpen(true)
  }

  async function submitInlineFollowup(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !ownerUserId || !historyModalClient || !activeCompanyId) return
    if (!registerInlineForm.contacted_at) return

    setRegisterInlineSaving(true)
    const contactedAtIso = dateInputToIso(registerInlineForm.contacted_at)
    const followupUserId = ownerUserId.toUpperCase()

    if (editingHistoryId) {
      let { error: updateError } = await supabase
        .from('bem_aviv_client_followups')
        .update({
          contacted_at: contactedAtIso,
          channel: registerInlineForm.channel,
          created_by_name: followupActorName,
          updated_by_user_id: user?.id ?? null,
          updated_by_name: followupActorName,
          result: registerInlineForm.result || null,
          notes: registerInlineForm.notes || null,
        })
        .eq('id', editingHistoryId)
        .eq('company_id', activeCompanyId)
      if (updateError && isMissingAuditColumnError(updateError.message)) {
        const fallback = await supabase
          .from('bem_aviv_client_followups')
          .update({
            contacted_at: contactedAtIso,
            channel: registerInlineForm.channel,
            result: registerInlineForm.result || null,
            notes: registerInlineForm.notes || null,
          })
          .eq('id', editingHistoryId)
          .eq('company_id', activeCompanyId)
        updateError = fallback.error
      }

      if (updateError) {
        setRegisterInlineSaving(false)
        return
      }

      const rows = await refetchHistoryModalRows(historyModalClient.id)
      setHistoryModalRows(rows)
      if (rows[0]) {
        await supabase
          .from('bem_aviv_clients')
          .update({ last_contact_at: rows[0].contacted_at })
          .eq('id', historyModalClient.id)
          .eq('company_id', activeCompanyId)
      }
      setEditingHistoryId(null)
      setRegisterInlineOpen(false)
      setRegisterInlineForm({
        contacted_at: todayInputDate(),
        channel: 'WHATSAPP',
        result: '',
        notes: '',
      })
      setRegisterInlineSaving(false)
      return
    }

    let { error: insertError } = await supabase.from('bem_aviv_client_followups').insert({
      user_id: followupUserId,
      company_id: activeCompanyId,
      created_by_user_id: user?.id ?? null,
      created_by_name: followupActorName,
      client_id: historyModalClient.id,
      contacted_at: contactedAtIso,
      channel: registerInlineForm.channel,
      result: registerInlineForm.result || null,
      notes: registerInlineForm.notes || null,
    })
    if (insertError && isMissingAuditColumnError(insertError.message)) {
      const fallback = await supabase.from('bem_aviv_client_followups').insert({
        user_id: followupUserId,
        company_id: activeCompanyId,
        client_id: historyModalClient.id,
        contacted_at: contactedAtIso,
        channel: registerInlineForm.channel,
        result: registerInlineForm.result || null,
        notes: registerInlineForm.notes || null,
      })
      insertError = fallback.error
    }

    if (insertError) {
      alert(insertError.message)
      setRegisterInlineSaving(false)
      return
    }

    await supabase
      .from('bem_aviv_clients')
      .update({ last_contact_at: contactedAtIso })
      .eq('id', historyModalClient.id)
      .eq('company_id', activeCompanyId)

    const rows = await refetchHistoryModalRows(historyModalClient.id)
    setHistoryModalRows(rows)
    setRegisterInlineOpen(false)
    setRegisterInlineForm({
      contacted_at: todayInputDate(),
      channel: 'WHATSAPP',
      result: '',
      notes: '',
    })
    setRegisterInlineSaving(false)
  }

  function toggleInlineFollowupForm() {
    setScheduleInlineOpen(false)
    if (registerInlineOpen && editingHistoryId) {
      setEditingHistoryId(null)
      setRegisterInlineForm({
        contacted_at: todayInputDate(),
        channel: 'WHATSAPP',
        result: '',
        notes: '',
      })
      return
    }
    setRegisterInlineOpen((prev) => {
      const next = !prev
      if (next) {
        setEditingHistoryId(null)
        setRegisterInlineForm({
          contacted_at: todayInputDate(),
          channel: 'WHATSAPP',
          result: '',
          notes: '',
        })
      } else {
        setEditingHistoryId(null)
      }
      return next
    })
  }

  function toggleInlineScheduleForm() {
    setRegisterInlineOpen(false)
    setEditingHistoryId(null)
    setScheduleInlineOpen((prev) => {
      const next = !prev
      if (next) {
        setScheduleInlineTarget('new')
        setEditingScheduleFollowupId(null)
        setScheduleInlineForm({
          contact_done: false,
          next_followup_at: todayInputDate(),
          commercial_stage: historyModalClient?.commercial_stage || 'CONTATO',
          summary: '',
          details: '',
        })
      } else {
        setScheduleInlineTarget('new')
        setEditingScheduleFollowupId(null)
      }
      return next
    })
  }

  async function submitInlineSchedule(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !ownerUserId || !historyModalClient || !activeCompanyId) return
    if (!scheduleInlineForm.next_followup_at) {
      alert('INFORME A DATA DO AGENDAMENTO.')
      return
    }
    setScheduleInlineSaving(true)
    const note = composeFollowupNote(scheduleInlineForm.summary, scheduleInlineForm.details)
    const contactedAtIso = dateInputToIso(scheduleInlineForm.next_followup_at)

    try {
      if (scheduleInlineTarget === 'followup' && editingScheduleFollowupId) {
        let { error: updateError } = await supabase
          .from('bem_aviv_client_followups')
          .update({
            contacted_at: contactedAtIso,
            channel: CHANNEL_AGENDAMENTO,
            result: encodeAgendamentoResult('PENDENTE', scheduleInlineForm.summary),
            notes: scheduleInlineForm.details || null,
            updated_by_user_id: user?.id ?? null,
            updated_by_name: followupActorName,
          })
          .eq('id', editingScheduleFollowupId)
          .eq('company_id', activeCompanyId)
        if (updateError && isMissingAuditColumnError(updateError.message)) {
          const fallback = await supabase
            .from('bem_aviv_client_followups')
            .update({
              contacted_at: contactedAtIso,
              channel: CHANNEL_AGENDAMENTO,
              result: encodeAgendamentoResult('PENDENTE', scheduleInlineForm.summary),
              notes: scheduleInlineForm.details || null,
            })
            .eq('id', editingScheduleFollowupId)
            .eq('company_id', activeCompanyId)
          updateError = fallback.error
        }
        if (updateError) throw new Error(updateError.message)

        const isActiveOnClient =
          historyModalClient.next_followup_status?.toUpperCase() === 'PENDENTE' &&
          sameCalendarDay(historyModalClient.next_followup_at, contactedAtIso)
        if (isActiveOnClient) {
          const { error: clientError } = await supabase
            .from('bem_aviv_clients')
            .update({
              next_followup_at: contactedAtIso,
              next_followup_note: note || null,
              commercial_stage: scheduleInlineForm.commercial_stage,
              last_contact_at: scheduleInlineForm.contact_done
                ? new Date().toISOString()
                : historyModalClient.last_contact_at ?? null,
            })
            .eq('id', historyModalClient.id)
            .eq('company_id', activeCompanyId)
          if (clientError) throw new Error(clientError.message)
        }
      } else {
        if (scheduleInlineTarget === 'new') {
          await markPendingAgendamentoAsReagendado(historyModalClient.id)
        }
        const { error: clientError } = await supabase
          .from('bem_aviv_clients')
          .update({
            next_followup_at: contactedAtIso,
            next_followup_note: note || null,
            next_followup_status: 'PENDENTE',
            commercial_stage: scheduleInlineForm.commercial_stage,
            last_contact_at: scheduleInlineForm.contact_done
              ? new Date().toISOString()
              : historyModalClient.last_contact_at ?? null,
          })
          .eq('id', historyModalClient.id)
          .eq('company_id', activeCompanyId)
        if (clientError) throw new Error(clientError.message)

        if (scheduleInlineTarget === 'new') {
          await insertAgendamentoFollowup(
            historyModalClient.id,
            scheduleInlineForm.next_followup_at,
            'PENDENTE',
            scheduleInlineForm.summary,
            scheduleInlineForm.details,
          )
        } else if (scheduleInlineTarget === 'client') {
          const rows = await refetchHistoryModalRows(historyModalClient.id)
          const match = rows.find(
            (r) =>
              r.channel === CHANNEL_AGENDAMENTO &&
              parseAgendamentoResult(r.result).status === 'PENDENTE' &&
              sameCalendarDay(r.contacted_at, historyModalClient.next_followup_at),
          )
          if (match) {
            let { error: updateError } = await supabase
              .from('bem_aviv_client_followups')
              .update({
                contacted_at: contactedAtIso,
                result: encodeAgendamentoResult('PENDENTE', scheduleInlineForm.summary),
                notes: scheduleInlineForm.details || null,
                updated_by_user_id: user?.id ?? null,
                updated_by_name: followupActorName,
              })
              .eq('id', match.id)
              .eq('company_id', activeCompanyId)
            if (updateError && isMissingAuditColumnError(updateError.message)) {
              const fallback = await supabase
                .from('bem_aviv_client_followups')
                .update({
                  contacted_at: contactedAtIso,
                  result: encodeAgendamentoResult('PENDENTE', scheduleInlineForm.summary),
                  notes: scheduleInlineForm.details || null,
                })
                .eq('id', match.id)
                .eq('company_id', activeCompanyId)
              updateError = fallback.error
            }
            if (updateError) throw new Error(updateError.message)
          } else {
            await insertAgendamentoFollowup(
              historyModalClient.id,
              scheduleInlineForm.next_followup_at,
              'PENDENTE',
              scheduleInlineForm.summary,
              scheduleInlineForm.details,
            )
          }
        }
      }

      setScheduleInlineOpen(false)
      setScheduleInlineTarget('new')
      setEditingScheduleFollowupId(null)
      await refreshHistoryModalClient()
      await load()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao salvar agendamento.')
    } finally {
      setScheduleInlineSaving(false)
    }
  }

  async function removeHistoryRow(rowId: string) {
    if (!supabase || !ownerUserId || !historyModalClient || !activeCompanyId) return
    if (!confirm('EXCLUIR ESTE REGISTRO DE CONTATO?')) return
    let { error } = await supabase
      .from('bem_aviv_client_followups')
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by_user_id: user?.id ?? null,
        deleted_by_name: followupActorName,
      })
      .eq('id', rowId)
      .eq('company_id', activeCompanyId)
    if (error && isMissingAuditColumnError(error.message)) {
      const fallback = await supabase
        .from('bem_aviv_client_followups')
        .delete()
        .eq('id', rowId)
        .eq('company_id', activeCompanyId)
      error = fallback.error
    }
    if (error) {
      alert(error.message)
      return
    }
    const rows = await refetchHistoryModalRows(historyModalClient.id)
    setHistoryModalRows(rows)
  }

  async function openPedidosModal(client: Cliente) {
    setPedidosModalClient(client)
    setPedidosModalRows([])
    setPedidosDetailOrderId(null)
    if (!supabase || !ownerUserId || !activeCompanyId) return
    setPedidosModalLoading(true)
    const { data, error } = await supabase
      .from('bem_aviv_sales_orders')
      .select('id, order_date, document_type, document_number, status, total_amount')
      .eq('company_id', activeCompanyId)
      .eq('client_id', client.id)
      .order('order_date', { ascending: false })
      .order('document_number', { ascending: false })
    if (error) {
      alert(error.message)
      setPedidosModalRows([])
      setPedidosModalLoading(false)
      return
    }
    setPedidosModalRows((data as OrderRow[]) ?? [])
    setPedidosModalLoading(false)
  }

  function closePedidosModal() {
    setPedidosModalClient(null)
    setPedidosModalRows([])
    setPedidosDetailOrderId(null)
    setPedidosModalLoading(false)
  }

  const pedidosModalStats = useMemo(() => {
    const pedidosValidos = pedidosModalRows.filter((o) => o.document_type === 'PEDIDO' && o.status !== 'CANCELADO')
    const total = pedidosValidos.reduce((s, o) => s + Number(o.total_amount ?? 0), 0)
    const n = pedidosValidos.length
    const media = n > 0 ? total / n : null
    let ultima: string | null = null
    if (pedidosValidos.length > 0) {
      ultima = pedidosValidos.reduce((best, o) => (o.order_date > best ? o.order_date : best), pedidosValidos[0]!.order_date)
    }
    return { total, media, ultima, nPedidos: n }
  }, [pedidosModalRows])

  function openWhatsapp(client: Cliente) {
    const url = buildWhatsappUrl(client.phone_1) ?? buildWhatsappUrl(client.phone_2)
    if (!url) {
      alert('Cliente sem telefone válido para WhatsApp.')
      return
    }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  async function toggleEko7Presentation(client: Cliente) {
    if (!supabase || !activeCompanyId) return
    const has = clientHadEko7Presentation(client)
    const nextAt = has ? null : new Date().toISOString()
    const { error } = await supabase
      .from('bem_aviv_clients')
      .update({ eko7_presentation_at: nextAt })
      .eq('id', client.id)
      .eq('company_id', activeCompanyId)
    if (error) {
      alert(error.message)
      return
    }
    await load()
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !ownerUserId || !activeCompanyId) return
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
      ...(editing ? {} : { company_id: activeCompanyId }),
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
      eko7_presentation_at: form.eko7_presentation_done
        ? dateInputToIso(form.eko7_presentation_at) || new Date().toISOString()
        : null,
    }
    if (editing) {
      const { error } = await supabase
        .from('bem_aviv_clients')
        .update(payload)
        .eq('id', editing.id)
        .eq('company_id', activeCompanyId)
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
    if (!supabase || !activeCompanyId || !confirm('EXCLUIR CLIENTE?')) return
    const { error } = await supabase
      .from('bem_aviv_clients')
      .delete()
      .eq('id', id)
      .eq('company_id', activeCompanyId)
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
              <ArrowUp size={14} className="shrink-0 text-[#185FA5]" aria-hidden />
            ) : (
              <ArrowDown size={14} className="shrink-0 text-[#185FA5]" aria-hidden />
            )
          ) : (
            <ArrowUpDown size={14} className="shrink-0 text-slate-400" aria-hidden />
          )}
        </button>
      </th>
    )
  }

  if (!supabase) return <p className="text-slate-600">CONECTANDO...</p>

  const pillBase =
    'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline focus-visible:ring-2 focus-visible:ring-[#185FA5]/30'
  const pillActive = 'border-[#B5D4F4] bg-[#E6F1FB] text-[#185FA5]'
  const pillIdle = 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'

  return (
    <div className="w-full min-w-0 max-w-none space-y-5">
      <header>
        <h2 className="font-hub text-xl font-bold tracking-tight text-slate-900">Clientes</h2>
        <p className="mt-0.5 text-sm text-slate-500">Base completa de clientes e prospects</p>
      </header>

      {dataLoadBanner ? (
        <div
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950"
          role="alert"
        >
          <span>{dataLoadBanner}</span>
          <button
            type="button"
            className="shrink-0 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-amber-900 hover:bg-amber-100"
            onClick={() => void load()}
          >
            Tentar novamente
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-7">
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
          <p className="text-[8px] font-semibold uppercase tracking-wide text-slate-500">Total</p>
          <p className="font-hub mt-1 text-[20px] font-bold text-slate-900">{stats.total}</p>
          <span className="mt-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[8px] text-slate-600">Cadastros</span>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
          <p className="text-[8px] font-semibold uppercase tracking-wide text-slate-500">Prospecção</p>
          <p className="font-hub mt-1 text-[20px] font-bold text-slate-900">{stats.prospec}</p>
          <span className="mt-1 inline-block rounded-full bg-[#FAEEDA] px-2 py-0.5 text-[8px] font-medium text-[#854F0B]">Prospects</span>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
          <p className="text-[8px] font-semibold uppercase tracking-wide text-slate-500">Cliente — colchão</p>
          <p className="font-hub mt-1 text-[20px] font-bold text-slate-900">{stats.clienteColchao}</p>
          <span className="mt-1 inline-block rounded-full bg-[#EAF3DE] px-2 py-0.5 text-[8px] font-medium text-[#3B6D11]">Comprou colchão</span>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
          <p className="text-[8px] font-semibold uppercase tracking-wide text-slate-500">Cliente — diversos</p>
          <p className="font-hub mt-1 text-[20px] font-bold text-slate-900">{stats.clienteDiversos}</p>
          <span className="mt-1 inline-block rounded-full bg-[#E6F1FB] px-2 py-0.5 text-[8px] font-medium text-[#185FA5]">Outros produtos</span>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
          <p className="text-[8px] font-semibold uppercase tracking-wide text-slate-500">Colchão + diversos</p>
          <p className="font-hub mt-1 text-[20px] font-bold text-slate-900">{stats.clienteColchaoDiversos}</p>
          <span className="mt-1 inline-block rounded-full bg-[#EEEDFE] px-2 py-0.5 text-[8px] font-medium text-[#3C3489]">Mix</span>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
          <p className="text-[8px] font-semibold uppercase tracking-wide text-slate-500">EKO7 · repique</p>
          <p className="font-hub mt-1 text-[20px] font-bold text-slate-900">{stats.eko7NaoComprou}</p>
          <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[8px] font-medium text-amber-800">Apresentado · não comprou</span>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
          <p className="text-[8px] font-semibold uppercase tracking-wide text-slate-500">EKO7 · convertidos</p>
          <p className="font-hub mt-1 text-[20px] font-bold text-slate-900">{stats.eko7Comprou}</p>
          <span className="mt-1 inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[8px] font-medium text-emerald-800">Apresentado · comprou</span>
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" strokeWidth={2} aria-hidden />
          <input
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-sm normal-case placeholder:normal-case"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou telefone..."
            aria-label="Pesquisar clientes"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            className={cn(pillBase, statusFilter === 'TODOS' ? pillActive : pillIdle)}
            onClick={() => setStatusFilter('TODOS')}
          >
            Todos
          </button>
          {BEM_AVIV_CLIENT_STATUS_OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              className={cn(pillBase, statusFilter === opt ? pillActive : pillIdle)}
              onClick={() => setStatusFilter(opt)}
              title={opt}
            >
              <span className="hidden sm:inline">{opt}</span>
              <span className="sm:hidden">{bemAvivClientStatusShortLabel(opt)}</span>
            </button>
          ))}
          <span className="mx-1 hidden h-6 w-px self-center bg-slate-200 sm:inline" aria-hidden />
          <button
            type="button"
            className={cn(
              pillBase,
              eko7Filter === 'APRESENTADO_NAO_COMPROU' ? 'border-amber-300 bg-amber-50 text-amber-900' : pillIdle,
            )}
            onClick={() => setEko7Filter((f) => (f === 'APRESENTADO_NAO_COMPROU' ? 'TODOS' : 'APRESENTADO_NAO_COMPROU'))}
            title="Apresentação EKO7 feita e ainda sem pedido confirmado — foco para repique"
          >
            EKO7 · não comprou
          </button>
          <button
            type="button"
            className={cn(
              pillBase,
              eko7Filter === 'APRESENTADO_COMPROU' ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : pillIdle,
            )}
            onClick={() => setEko7Filter((f) => (f === 'APRESENTADO_COMPROU' ? 'TODOS' : 'APRESENTADO_COMPROU'))}
            title="Apresentação EKO7 feita e já comprou (pedido confirmado)"
          >
            EKO7 · comprou
          </button>
          <button
            type="button"
            className={cn(pillBase, eko7Filter === 'APRESENTADO' ? 'border-violet-200 bg-violet-50 text-violet-800' : pillIdle)}
            onClick={() => setEko7Filter((f) => (f === 'APRESENTADO' ? 'TODOS' : 'APRESENTADO'))}
            title="Todos com apresentação EKO7 (comprou ou não)"
          >
            EKO7 apresentado
          </button>
          <button
            type="button"
            className={cn(pillBase, eko7Filter === 'PENDENTE' ? 'border-slate-300 bg-slate-100 text-slate-800' : pillIdle)}
            onClick={() => setEko7Filter((f) => (f === 'PENDENTE' ? 'TODOS' : 'PENDENTE'))}
            title="Clientes ainda sem apresentação EKO7"
          >
            Sem EKO7
          </button>
        </div>
        <button
          type="button"
          className="whitespace-nowrap rounded-lg bg-[#185FA5] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#144a87]"
          onClick={openNewClientModal}
        >
          + Novo cliente
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="table-wrap border-0">
        {loading ? (
          <p className="p-4 text-slate-500">CARREGANDO...</p>
        ) : (
          <table>
            <thead>
              <tr>
                <SortHeader label="Nome" column="full_name" />
                <SortHeader label="Telefones" column="phones" />
                <SortHeader label="STATUS" column="client_status" />
                <th className="text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {displayedRows.map((r) => {
                const pal = avatarPalette(r.full_name || '?')
                return (
                <tr key={r.id}>
                  <td>
                    <div className="flex min-w-0 max-w-[min(720px,55vw)] items-center gap-2.5 xl:max-w-none">
                      <div
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[8px] font-semibold"
                        style={{ backgroundColor: pal.bg, color: pal.fg }}
                      >
                        {initialsFromName(r.full_name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <p className="truncate text-sm font-medium normal-case text-slate-900">{r.full_name}</p>
                          {clientHadEko7Presentation(r) ? (
                            <>
                              <span
                                className="shrink-0 rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-violet-800"
                                title={`Apresentação EKO7 em ${formatDateOnly(r.eko7_presentation_at)}`}
                              >
                                EKO7
                              </span>
                              {clientHasConfirmedPurchase(r) ? (
                                <span
                                  className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-800"
                                  title="Pedido confirmado após apresentação"
                                >
                                  Comprou
                                </span>
                              ) : (
                                <span
                                  className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-900"
                                  title="Ainda sem pedido confirmado — candidato a repique"
                                >
                                  Não comprou
                                </span>
                              )}
                            </>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="min-w-[9rem] text-xs normal-case text-slate-600">
                    {[formatPhone(r.phone_1), formatPhone(r.phone_2)].filter(Boolean).join(' / ') || '—'}
                  </td>
                  <td>{clientStatusPill(r.client_status)}</td>
                  <td className="whitespace-nowrap">
                    <div className="flex max-w-[280px] flex-wrap items-center justify-end gap-1 sm:max-w-none sm:gap-1.5">
                      <button
                        type="button"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-emerald-500 bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 sm:h-10 sm:w-10"
                        onClick={() => openWhatsapp(r)}
                        title="Enviar mensagem via WhatsApp"
                        aria-label="Enviar mensagem via WhatsApp"
                      >
                        <MessageCircle size={16} strokeWidth={2.2} />
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-violet-300 bg-white text-violet-800 shadow-sm hover:bg-violet-50 sm:h-10 sm:w-10"
                        onClick={() => void openHistoryModal(r)}
                        title="Histórico de follow-up"
                        aria-label="Histórico de follow-up"
                      >
                        <History size={16} strokeWidth={2.2} />
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-amber-300 bg-white text-amber-900 shadow-sm hover:bg-amber-50 sm:h-10 sm:w-10"
                        onClick={() => void openPedidosModal(r)}
                        title="Orçamentos e pedidos deste cliente"
                        aria-label="Orçamentos e pedidos deste cliente"
                      >
                        <ClipboardList size={16} strokeWidth={2.2} />
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-sky-300 bg-white text-sky-700 shadow-sm hover:bg-sky-50 sm:h-10 sm:w-10"
                        onClick={() => openScheduleModal(r)}
                        title="Agendar follow-up"
                        aria-label="Agendar follow-up"
                      >
                        <CalendarPlus size={16} strokeWidth={2.2} />
                      </button>
                      <button
                        type="button"
                        className={cn(
                          'inline-flex h-9 w-9 items-center justify-center rounded-md border shadow-sm sm:h-10 sm:w-10',
                          clientHadEko7Presentation(r)
                            ? 'border-violet-400 bg-violet-600 text-white hover:bg-violet-700'
                            : 'border-violet-200 bg-white text-violet-700 hover:bg-violet-50',
                        )}
                        onClick={() => void toggleEko7Presentation(r)}
                        title={
                          clientHadEko7Presentation(r)
                            ? `EKO7 apresentado em ${formatDateOnly(r.eko7_presentation_at)} — clique para desmarcar`
                            : 'Marcar apresentação EKO7 realizada'
                        }
                        aria-label={
                          clientHadEko7Presentation(r) ? 'Desmarcar apresentação EKO7' : 'Marcar apresentação EKO7'
                        }
                      >
                        <Presentation size={16} strokeWidth={2.2} />
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-100 sm:h-10 sm:w-10"
                        onClick={() => openEditClientModal(r)}
                        title="Editar cliente"
                        aria-label="Editar cliente"
                      >
                        <Pencil size={15} strokeWidth={2.2} />
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-red-300 bg-white text-red-700 shadow-sm hover:bg-red-50 sm:h-10 sm:w-10"
                        onClick={() => remove(r.id)}
                        title="Excluir cliente"
                        aria-label="Excluir cliente"
                      >
                        <Trash2 size={15} strokeWidth={2.2} />
                      </button>
                    </div>
                  </td>
                </tr>
                )
              })}
              {displayedRows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-500">
                    {rows.length === 0
                      ? 'Nenhum cliente cadastrado.'
                      : 'Nenhum resultado para a pesquisa ou o filtro de status atual.'}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        )}
        {!loading ? (
          <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-2.5">
            <span className="text-[9px] text-slate-500">
              {displayedRows.length} registro{displayedRows.length !== 1 ? 's' : ''}
            </span>
          </div>
        ) : null}
      </div>
      </div>

      {clientModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="client-modal-title"
        >
          <div className="flex max-h-[min(92dvh,880px)] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-xl sm:rounded-2xl">
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
              <div className="sm:col-span-12 rounded-xl border border-violet-100 bg-violet-50/40 p-3">
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800">
                  <input
                    type="checkbox"
                    checked={form.eko7_presentation_done}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        eko7_presentation_done: e.target.checked,
                        eko7_presentation_at: e.target.checked && !prev.eko7_presentation_at ? todayInputDate() : prev.eko7_presentation_at,
                      }))
                    }
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  Apresentação do projeto EKO7 realizada
                </label>
                {form.eko7_presentation_done ? (
                  <div className="mt-2 space-y-2">
                    <div className="max-w-xs">
                      <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Data da apresentação</label>
                      <input
                        type="date"
                        className="mt-1 w-full"
                        value={form.eko7_presentation_at}
                        onChange={(e) => setForm((prev) => ({ ...prev, eko7_presentation_at: e.target.value }))}
                      />
                    </div>
                    {editing ? (
                      <p className="text-[10px] leading-snug text-slate-600">
                        Situação de compra:{' '}
                        <strong className={clientHasConfirmedPurchase(editing) ? 'text-emerald-700' : 'text-amber-800'}>
                          {clientHasConfirmedPurchase(editing) ? 'Comprou' : 'Não comprou'}
                        </strong>
                        {' '}
                        (atualizada automaticamente pelos pedidos confirmados).
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-1 text-[10px] leading-snug text-slate-500">
                    Marque quem já viu o EKO7. Quem não tiver pedido confirmado aparecerá como{' '}
                    <strong>não comprou</strong> para facilitar repiques.
                  </p>
                )}
              </div>
              <div className="sm:col-span-8">
                <label>E-MAIL</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="sm:col-span-4">
                <label>CLASSIFICAÇÃO</label>
                <input
                  value={editing?.client_status ?? 'PROSPECÇÃO'}
                  readOnly
                  className="bg-slate-100 text-slate-600"
                  title="Só muda após haver pedido com status diferente de Aberto e Cancelado. Itens: colchão vs demais."
                />
                <p className="mt-1 text-[10px] leading-snug text-slate-500">
                  Novos cadastros começam em Prospecção. A classificação usa pedidos confirmados (não abertos e não cancelados) e distingue
                  colchão (plataforma de descanso, texto ou dimensões) e demais produtos.
                </p>
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

      {scheduleModalClient ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/35 p-3"
          role="dialog"
          aria-modal="true"
          aria-labelledby="schedule-modal-title"
        >
          <div className="w-full max-w-xl rounded-xl border border-slate-200 bg-white p-4 shadow-xl sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 id="schedule-modal-title" className="text-lg font-semibold text-slate-900 normal-case">
                  Agendar follow-up
                </h3>
                <p className="text-sm text-slate-500 normal-case">{scheduleModalClient.full_name}</p>
              </div>
              <button
                type="button"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                onClick={closeScheduleModal}
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={submitScheduleModal} className="mt-4 rounded-lg border border-sky-200 bg-sky-50/40 p-3">
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={scheduleModalForm.contact_done}
                  onChange={(e) => setScheduleModalForm((prev) => ({ ...prev, contact_done: e.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300"
                />
                Contato realizado
              </label>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <label className="text-xs text-slate-600 sm:col-span-2">
                  Próximo follow-up
                  <input
                    type="date"
                    required
                    value={scheduleModalForm.next_followup_at}
                    onChange={(e) => setScheduleModalForm((prev) => ({ ...prev, next_followup_at: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="text-xs text-slate-600 sm:col-span-2">
                  Status relacionamento
                  <select
                    value={scheduleModalForm.commercial_stage}
                    onChange={(e) => setScheduleModalForm((prev) => ({ ...prev, commercial_stage: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                  >
                    {BEM_AVIV_CLIENT_COMMERCIAL_STAGE_OPTIONS.map((stage) => (
                      <option key={stage} value={stage}>
                        {stage}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-slate-600 sm:col-span-2">
                  Resumo (até 60 caracteres)
                  <input
                    maxLength={60}
                    value={scheduleModalForm.summary}
                    onChange={(e) => setScheduleModalForm((prev) => ({ ...prev, summary: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                  />
                  <p className="mt-1 text-[8px] text-slate-500">{scheduleModalForm.summary.length}/60</p>
                </label>
                <label className="text-xs text-slate-600 sm:col-span-2">
                  Registro
                  <textarea
                    rows={2}
                    value={scheduleModalForm.details}
                    onChange={(e) => setScheduleModalForm((prev) => ({ ...prev, details: e.target.value }))}
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                  />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="submit"
                  disabled={scheduleModalSaving}
                  className="rounded-md bg-[#185FA5] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#144f8f] disabled:opacity-60"
                >
                  {scheduleModalSaving ? 'Salvando...' : 'Confirmar agendamento'}
                </button>
                <button
                  type="button"
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  onClick={closeScheduleModal}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {historyModalClient ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/35 p-3">
          <div className="w-full max-w-5xl rounded-xl border border-slate-200 bg-white p-4 shadow-xl sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 normal-case">Histórico de contatos</h3>
                <p className="text-sm text-slate-500 normal-case">{historyModalClient.full_name}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-md bg-[#185FA5] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#144f8f]"
                  onClick={toggleInlineFollowupForm}
                >
                  {registerInlineOpen && editingHistoryId
                    ? 'Novo contato'
                    : registerInlineOpen && !editingHistoryId
                      ? 'Ocultar registro'
                      : 'Incluir novo follow-up'}
                </button>
                <button
                  type="button"
                  className="rounded-md border border-sky-300 bg-white px-3 py-1.5 text-sm font-semibold text-sky-700 hover:bg-sky-50"
                  onClick={toggleInlineScheduleForm}
                >
                  Agendar próximo follow-up
                </button>
                <button
                  type="button"
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  onClick={() => {
                    setEditingHistoryId(null)
                    setHistoryModalClient(null)
                  }}
                >
                  Fechar
                </button>
              </div>
            </div>

            {registerInlineOpen ? (
              <form onSubmit={submitInlineFollowup} className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {editingHistoryId ? 'Editar contato' : 'Registrar novo contato'}
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <label className="text-xs text-slate-600">
                    Data
                    <input
                      type="date"
                      required
                      value={registerInlineForm.contacted_at}
                      onChange={(e) => setRegisterInlineForm((prev) => ({ ...prev, contacted_at: e.target.value }))}
                      className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                    />
                  </label>
                  <label className="text-xs text-slate-600">
                    Canal
                    <select
                      value={registerInlineForm.channel}
                      onChange={(e) => setRegisterInlineForm((prev) => ({ ...prev, channel: e.target.value }))}
                      className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                    >
                      <option value="WHATSAPP">WHATSAPP</option>
                      <option value="LIGACAO">LIGAÇÃO</option>
                      <option value="EMAIL">E-MAIL</option>
                      <option value="OUTRO">OUTRO</option>
                    </select>
                  </label>
                  <label className="text-xs text-slate-600 sm:col-span-2">
                    Resumo
                    <input
                      value={registerInlineForm.result}
                      onChange={(e) => setRegisterInlineForm((prev) => ({ ...prev, result: e.target.value }))}
                      className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                    />
                  </label>
                  <label className="text-xs text-slate-600 sm:col-span-2">
                    Detalhe
                    <textarea
                      rows={2}
                      value={registerInlineForm.notes}
                      onChange={(e) => setRegisterInlineForm((prev) => ({ ...prev, notes: e.target.value }))}
                      className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                    />
                  </label>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="submit"
                    disabled={registerInlineSaving}
                    className="rounded-md bg-[#185FA5] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#144f8f] disabled:opacity-60"
                  >
                    {registerInlineSaving ? 'Salvando...' : editingHistoryId ? 'Salvar edição' : 'Salvar contato'}
                  </button>
                  {editingHistoryId ? (
                    <button
                      type="button"
                      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                      onClick={() => {
                        setEditingHistoryId(null)
                        setRegisterInlineOpen(false)
                        setRegisterInlineForm({
                          contacted_at: todayInputDate(),
                          channel: 'WHATSAPP',
                          result: '',
                          notes: '',
                        })
                      }}
                    >
                      Cancelar edição
                    </button>
                  ) : null}
                </div>
              </form>
            ) : null}

            {scheduleInlineOpen ? (
              <form onSubmit={submitInlineSchedule} className="mt-4 rounded-lg border border-sky-200 bg-sky-50/40 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                  {scheduleInlineTarget === 'followup'
                    ? 'Editar agendamento'
                    : scheduleInlineTarget === 'client'
                      ? 'Editar agendamento ativo'
                      : 'Agendar próximo follow-up'}
                </p>
                <label className="mt-2 inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={scheduleInlineForm.contact_done}
                    onChange={(e) => setScheduleInlineForm((prev) => ({ ...prev, contact_done: e.target.checked }))}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  Contato realizado
                </label>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <label className="text-xs text-slate-600 sm:col-span-2">
                    Próximo follow-up
                    <input
                      type="date"
                      required
                      value={scheduleInlineForm.next_followup_at}
                      onChange={(e) => setScheduleInlineForm((prev) => ({ ...prev, next_followup_at: e.target.value }))}
                      className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                    />
                  </label>
                  <label className="text-xs text-slate-600 sm:col-span-2">
                    Status relacionamento
                    <select
                      value={scheduleInlineForm.commercial_stage}
                      onChange={(e) => setScheduleInlineForm((prev) => ({ ...prev, commercial_stage: e.target.value }))}
                      className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                    >
                      {BEM_AVIV_CLIENT_COMMERCIAL_STAGE_OPTIONS.map((stage) => (
                        <option key={stage} value={stage}>
                          {stage}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs text-slate-600 sm:col-span-2">
                    Resumo (até 60 caracteres)
                    <input
                      maxLength={60}
                      value={scheduleInlineForm.summary}
                      onChange={(e) => setScheduleInlineForm((prev) => ({ ...prev, summary: e.target.value }))}
                      className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                    />
                    <p className="mt-1 text-[8px] text-slate-500">{scheduleInlineForm.summary.length}/60</p>
                  </label>
                  <label className="text-xs text-slate-600 sm:col-span-2">
                    Registro
                    <textarea
                      rows={2}
                      value={scheduleInlineForm.details}
                      onChange={(e) => setScheduleInlineForm((prev) => ({ ...prev, details: e.target.value }))}
                      className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                    />
                  </label>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="submit"
                    disabled={scheduleInlineSaving}
                    className="rounded-md bg-[#185FA5] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#144f8f] disabled:opacity-60"
                  >
                    {scheduleInlineSaving ? 'Salvando...' : 'Salvar agendamento'}
                  </button>
                </div>
              </form>
            ) : null}

            <div className="mt-4 max-h-[65vh] overflow-auto rounded-lg border border-slate-200">
              {historyModalLoading ? (
                <p className="p-4 text-sm text-slate-500">Carregando histórico...</p>
              ) : historyTimeline.length === 0 ? (
                <p className="p-4 text-sm text-slate-500">Nenhum contato ou agendamento registrado para este cliente.</p>
              ) : (
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-left">Data</th>
                      <th className="px-3 py-2 text-left">Tipo</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-left">Usuário</th>
                      <th className="px-3 py-2 text-left">Resumo</th>
                      <th className="px-3 py-2 text-left">Detalhe</th>
                      <th className="px-3 py-2 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyTimeline.map((item) => {
                      if (item.kind === 'contact') {
                        const r = item.row
                        return (
                          <tr
                            key={item.key}
                            className={cn(
                              'border-t border-slate-100',
                              editingHistoryId === r.id && 'bg-sky-50/80',
                            )}
                          >
                            <td className="px-3 py-2 text-slate-700">{formatDateOnly(r.contacted_at)}</td>
                            <td className="px-3 py-2 text-slate-700">Contato · {r.channel}</td>
                            <td className="px-3 py-2 text-slate-500">—</td>
                            <td className="px-3 py-2 text-slate-700">{r.created_by_name || '—'}</td>
                            <td className="px-3 py-2 text-slate-700">{r.result || '—'}</td>
                            <td className="px-3 py-2 text-slate-700">{r.notes || '—'}</td>
                            <td className="px-3 py-2 text-right">
                              <div className="inline-flex flex-wrap items-center justify-end gap-1">
                                <button
                                  type="button"
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-100"
                                  onClick={() => {
                                    setScheduleInlineOpen(false)
                                    setEditingHistoryId(r.id)
                                    setRegisterInlineForm({
                                      contacted_at: toInputDate(r.contacted_at),
                                      channel: r.channel,
                                      result: r.result ?? '',
                                      notes: r.notes ?? '',
                                    })
                                    setRegisterInlineOpen(true)
                                  }}
                                  title="Editar contato"
                                  aria-label="Editar contato"
                                >
                                  <Pencil size={15} strokeWidth={2.2} />
                                </button>
                                <button
                                  type="button"
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-300 bg-white text-red-700 shadow-sm hover:bg-red-50"
                                  onClick={() => void removeHistoryRow(r.id)}
                                  title="Excluir contato"
                                  aria-label="Excluir contato"
                                >
                                  <Trash2 size={15} strokeWidth={2.2} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      }

                      if (item.kind === 'schedule-active') {
                        return (
                          <tr key={item.key} className="border-t border-amber-100 bg-amber-50/50">
                            <td className="px-3 py-2 font-medium text-slate-800">{formatDateOnly(item.at)}</td>
                            <td className="px-3 py-2 text-slate-700">Agendamento</td>
                            <td className="px-3 py-2">
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                                {item.status}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-slate-500">—</td>
                            <td className="px-3 py-2 text-slate-700">{item.summary || '—'}</td>
                            <td className="px-3 py-2 text-slate-700">{item.details || '—'}</td>
                            <td className="px-3 py-2 text-right">
                              <div className="inline-flex flex-wrap items-center justify-end gap-1">
                                <button
                                  type="button"
                                  className="inline-flex h-8 items-center gap-1 rounded-md border border-emerald-300 bg-white px-2 text-xs font-semibold text-emerald-800 shadow-sm hover:bg-emerald-50"
                                  onClick={() => void confirmScheduleDone(item.at)}
                                  title="Confirmar realizado"
                                >
                                  <CheckCircle2 size={14} strokeWidth={2.2} />
                                  Feito
                                </button>
                                <button
                                  type="button"
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-100"
                                  onClick={openEditScheduleActive}
                                  title="Editar agendamento"
                                  aria-label="Editar agendamento"
                                >
                                  <Pencil size={15} strokeWidth={2.2} />
                                </button>
                                <button
                                  type="button"
                                  className="inline-flex h-8 items-center gap-1 rounded-md border border-sky-300 bg-white px-2 text-xs font-semibold text-sky-800 shadow-sm hover:bg-sky-50"
                                  onClick={openReagendarSchedule}
                                  title="Reagendar"
                                >
                                  <CalendarPlus size={14} strokeWidth={2.2} />
                                  Reagendar
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      }

                      const r = item.row
                      const isPending = item.status === 'PENDENTE'
                      return (
                        <tr
                          key={item.key}
                          className={cn(
                            'border-t border-slate-100',
                            isPending && 'bg-amber-50/30',
                            editingScheduleFollowupId === r.id && 'bg-sky-50/80',
                          )}
                        >
                          <td className="px-3 py-2 text-slate-700">{formatDateOnly(r.contacted_at)}</td>
                          <td className="px-3 py-2 text-slate-700">Agendamento</td>
                          <td className="px-3 py-2">
                            <span
                              className={cn(
                                'rounded-full px-2 py-0.5 text-xs font-semibold',
                                item.status === 'PENDENTE' && 'bg-amber-100 text-amber-800',
                                item.status === 'CONCLUIDO' && 'bg-emerald-100 text-emerald-800',
                                item.status === 'REAGENDADO' && 'bg-sky-100 text-sky-800',
                                item.status === 'CANCELADO' && 'bg-slate-100 text-slate-600',
                              )}
                            >
                              {item.status === 'REAGENDADO' ? 'Reagendado' : item.status}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-slate-700">{r.created_by_name || '—'}</td>
                          <td className="px-3 py-2 text-slate-700">{item.summary || '—'}</td>
                          <td className="px-3 py-2 text-slate-700">{item.details || '—'}</td>
                          <td className="px-3 py-2 text-right">
                            <div className="inline-flex flex-wrap items-center justify-end gap-1">
                              {isPending ? (
                                <>
                                  <button
                                    type="button"
                                    className="inline-flex h-8 items-center gap-1 rounded-md border border-emerald-300 bg-white px-2 text-xs font-semibold text-emerald-800 shadow-sm hover:bg-emerald-50"
                                    onClick={() => void confirmScheduleDone(r.contacted_at)}
                                    title="Confirmar realizado"
                                  >
                                    <CheckCircle2 size={14} strokeWidth={2.2} />
                                    Feito
                                  </button>
                                  <button
                                    type="button"
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-100"
                                    onClick={() => openEditScheduleRecord(r)}
                                    title="Editar agendamento"
                                    aria-label="Editar agendamento"
                                  >
                                    <Pencil size={15} strokeWidth={2.2} />
                                  </button>
                                  <button
                                    type="button"
                                    className="inline-flex h-8 items-center gap-1 rounded-md border border-sky-300 bg-white px-2 text-xs font-semibold text-sky-800 shadow-sm hover:bg-sky-50"
                                    onClick={() => {
                                      openEditScheduleRecord(r)
                                      setScheduleInlineTarget('new')
                                    }}
                                    title="Reagendar"
                                  >
                                    <CalendarPlus size={14} strokeWidth={2.2} />
                                    Reagendar
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-100"
                                  onClick={() => openEditScheduleRecord(r)}
                                  title="Editar registro"
                                  aria-label="Editar registro"
                                >
                                  <Pencil size={15} strokeWidth={2.2} />
                                </button>
                              )}
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
        </div>
      ) : null}

      {pedidosModalClient ? (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/45 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pedidos-modal-title"
        >
          <div className="flex max-h-[min(92dvh,900px)] w-full max-w-7xl flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl">
            <div className="flex shrink-0 flex-wrap items-start gap-3 border-b border-slate-100 bg-slate-50/90 px-4 py-3 sm:px-5">
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <h3 id="pedidos-modal-title" className="truncate font-hub text-lg font-semibold text-slate-900 normal-case">
                    {pedidosModalClient.full_name}
                  </h3>
                  <button
                    type="button"
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 sm:hidden"
                    onClick={closePedidosModal}
                    aria-label="Fechar"
                  >
                    <X size={18} />
                  </button>
                </div>
                <p className="mt-1 text-xs text-slate-500">Orçamentos e pedidos vinculados a este cliente</p>
              </div>
              <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
                <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-center">
                  <p className="text-[8px] font-semibold uppercase tracking-wide text-slate-500">Total comprado</p>
                  <p className="font-hub text-sm font-bold tabular-nums text-slate-900">{formatBRL(pedidosModalStats.total)}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-center">
                  <p className="text-[8px] font-semibold uppercase tracking-wide text-slate-500">Média</p>
                  <p className="font-hub text-sm font-bold tabular-nums text-slate-900">
                    {pedidosModalStats.media != null ? formatBRL(pedidosModalStats.media) : '—'}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-center">
                  <p className="text-[8px] font-semibold uppercase tracking-wide text-slate-500">Última compra</p>
                  <p className="text-sm font-semibold tabular-nums text-slate-900">
                    {pedidosModalStats.ultima
                      ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(pedidosModalStats.ultima + 'T12:00:00'))
                      : '—'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 sm:inline-flex"
                onClick={closePedidosModal}
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5">
              {pedidosModalLoading ? (
                <p className="py-8 text-center text-sm text-slate-500">Carregando documentos…</p>
              ) : pedidosModalRows.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">Nenhum orçamento ou pedido para este cliente.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                        <th className="px-3 py-2">Data</th>
                        <th className="px-3 py-2">Tipo</th>
                        <th className="px-3 py-2">Nº documento</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2 text-right">Valor</th>
                        <th className="px-3 py-2 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pedidosModalRows.map((o) => (
                        <tr key={o.id} className="border-b border-slate-100 last:border-0">
                          <td className="whitespace-nowrap px-3 py-2.5 text-slate-800">{o.order_date}</td>
                          <td className="px-3 py-2.5">
                            {o.document_type === 'PEDIDO' ? (
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900">Pedido</span>
                            ) : (
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">Orçamento</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 font-medium text-slate-900">{o.document_number ?? '—'}</td>
                          <td className="px-3 py-2.5 text-slate-600">{o.status}</td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-right font-medium tabular-nums text-slate-900">
                            {formatBRL(Number(o.total_amount ?? 0))}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <button
                              type="button"
                              className={pedidosIconBtn}
                              title="Ver detalhes do documento"
                              aria-label="Ver detalhes do documento"
                              onClick={() => setPedidosDetailOrderId(o.id)}
                            >
                              <Eye size={15} aria-hidden />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="mt-3 text-center text-xs text-slate-500">
                <Link
                  to="/bem-aviv/pedidos"
                  state={{ bemAvivPedidosClient: { id: pedidosModalClient.id } }}
                  className="font-medium text-[#185FA5] hover:underline"
                  onClick={closePedidosModal}
                >
                  Abrir em Pedidos e orçamentos
                </Link>
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <PedidoDetailModal
        orderId={pedidosDetailOrderId}
        companyId={activeCompanyId}
        clientName={pedidosModalClient?.full_name}
        onClose={() => setPedidosDetailOrderId(null)}
      />
    </div>
  )
}
