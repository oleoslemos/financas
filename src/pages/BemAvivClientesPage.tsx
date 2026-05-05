import { useUser } from '@clerk/clerk-react'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarPlus,
  ClipboardList,
  History,
  MessageCircle,
  Pencil,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { useSupabase } from '../hooks/useSupabase'
import { resolveDataOwnerId } from '../lib/dataOwner'
import { clerkEmailCandidates } from '../lib/clerkEmails'
import { BEM_AVIV_CLIENT_COMMERCIAL_STAGE_OPTIONS } from '../lib/bemAvivClientStatus'
import { cn } from '../lib/cn'
import { formatBRL } from '../lib/format'
import { normalizeSearchText, toUpperTrim } from '../lib/text'
import { buildWhatsappUrl } from '../lib/whatsapp'

type OrderRow = {
  id: string
  order_date: string
  document_type: 'ORCAMENTO' | 'PEDIDO'
  document_number: string | null
  status: string
  total_amount: number
}

type FollowupHistoryRow = {
  id: string
  client_id: string
  contacted_at: string
  channel: string
  created_by_name?: string | null
  result: string | null
  notes: string | null
}

function composeFollowupNote(summary: string, details: string) {
  const s = summary.trim()
  const d = details.trim()
  if (s && d) return `RESUMO: ${s}\n${d}`
  if (s) return `RESUMO: ${s}`
  return d
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

function formatShortDateTime(iso: string | null) {
  if (!iso) return '—'
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(dt)
}

function toInputDateTimeLocal(value?: string | null) {
  if (!value) return ''
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return ''
  const tz = dt.getTimezoneOffset() * 60_000
  const local = new Date(dt.getTime() - tz)
  return local.toISOString().slice(0, 16)
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
  const followupActorName = (user?.fullName || user?.primaryEmailAddress?.emailAddress || ownerUserId || 'USUÁRIO').trim().toUpperCase()

  const [rows, setRows] = useState<Cliente[]>([])
  const [editing, setEditing] = useState<Cliente | null>(null)
  const [loading, setLoading] = useState(true)
  const [clientModalOpen, setClientModalOpen] = useState(false)
  const [cepLoading, setCepLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'TODOS' | 'CLIENTE' | 'PROSPECÇÃO'>('TODOS')
  const [sortKey, setSortKey] = useState<SortKey>('full_name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [form, setForm] = useState(emptyForm)

  const [pedidosModalClient, setPedidosModalClient] = useState<Cliente | null>(null)
  const [pedidosModalLoading, setPedidosModalLoading] = useState(false)
  const [pedidosModalRows, setPedidosModalRows] = useState<OrderRow[]>([])
  const [historyModalClient, setHistoryModalClient] = useState<Cliente | null>(null)
  const [historyModalRows, setHistoryModalRows] = useState<FollowupHistoryRow[]>([])
  const [historyModalLoading, setHistoryModalLoading] = useState(false)
  const [registerInlineOpen, setRegisterInlineOpen] = useState(false)
  const [scheduleInlineOpen, setScheduleInlineOpen] = useState(false)
  const [editingHistoryId, setEditingHistoryId] = useState<string | null>(null)
  const [registerInlineSaving, setRegisterInlineSaving] = useState(false)
  const [scheduleInlineSaving, setScheduleInlineSaving] = useState(false)
  const [registerInlineForm, setRegisterInlineForm] = useState({
    contacted_at: toInputDateTimeLocal(new Date().toISOString()),
    channel: 'WHATSAPP',
    result: '',
    notes: '',
  })
  const [scheduleInlineForm, setScheduleInlineForm] = useState({
    contact_done: false,
    next_followup_at: toInputDateTimeLocal(new Date().toISOString()),
    commercial_stage: 'CONTATO',
    summary: '',
    details: '',
  })

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

  const stats = useMemo(() => {
    const total = rows.length
    const clientes = rows.filter((r) => (r.client_status ?? '').trim() === 'CLIENTE').length
    const prospec = rows.filter((r) => (r.client_status ?? '').trim() !== 'CLIENTE').length
    const comEmail = rows.filter((r) => toUpperTrim(r.email ?? '').length > 0).length
    return { total, clientes, prospec, comEmail }
  }, [rows])

  const displayedRows = useMemo(() => {
    const filtered = rows.filter((r) => {
      if (!clientMatchesSearch(r, search)) return false
      if (statusFilter === 'TODOS') return true
      const st = (r.client_status ?? '').trim()
      if (statusFilter === 'CLIENTE') return st === 'CLIENTE'
      return st !== 'CLIENTE'
    })
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
    navigate(`/bem-aviv/follow-up/agendar/${client.id}`)
  }

  async function openHistoryModal(client: Cliente) {
    if (!supabase || !ownerUserId) return
    setHistoryModalClient(client)
    setEditingHistoryId(null)
    setRegisterInlineOpen(false)
    setScheduleInlineOpen(false)
    setRegisterInlineSaving(false)
    setScheduleInlineSaving(false)
    setRegisterInlineForm({
      contacted_at: toInputDateTimeLocal(new Date().toISOString()),
      channel: 'WHATSAPP',
      result: '',
      notes: '',
    })
    setHistoryModalRows([])
    setHistoryModalLoading(true)
    const { data, error } = await supabase
      .from('bem_aviv_client_followups')
      .select('id, client_id, contacted_at, channel, created_by_name, result, notes')
      .eq('user_id', ownerUserId.toUpperCase())
      .eq('client_id', client.id)
      .order('contacted_at', { ascending: false })
      .limit(200)
    if (error) {
      setHistoryModalRows([])
      setHistoryModalLoading(false)
      return
    }
    setHistoryModalRows((data ?? []) as FollowupHistoryRow[])
    setHistoryModalLoading(false)
  }

  async function refetchHistoryModalRows(clientId: string): Promise<FollowupHistoryRow[]> {
    if (!supabase || !ownerUserId) return []
    const { data, error } = await supabase
      .from('bem_aviv_client_followups')
      .select('id, client_id, contacted_at, channel, created_by_name, result, notes')
      .eq('user_id', ownerUserId.toUpperCase())
      .eq('client_id', clientId)
      .order('contacted_at', { ascending: false })
      .limit(200)
    if (error) return []
    return (data ?? []) as FollowupHistoryRow[]
  }

  async function submitInlineFollowup(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !ownerUserId || !historyModalClient) return
    if (!registerInlineForm.contacted_at) return

    setRegisterInlineSaving(true)
    const contactedAtIso = new Date(registerInlineForm.contacted_at).toISOString()
    const followupUserId = ownerUserId.toUpperCase()

    if (editingHistoryId) {
      const { error: updateError } = await supabase
        .from('bem_aviv_client_followups')
        .update({
          contacted_at: contactedAtIso,
          channel: registerInlineForm.channel,
          created_by_name: followupActorName,
          result: registerInlineForm.result || null,
          notes: registerInlineForm.notes || null,
        })
        .eq('id', editingHistoryId)

      if (updateError) {
        setRegisterInlineSaving(false)
        return
      }

      const rows = await refetchHistoryModalRows(historyModalClient.id)
      setHistoryModalRows(rows)
      if (rows[0]) {
        await supabase.from('bem_aviv_clients').update({ last_contact_at: rows[0].contacted_at }).eq('id', historyModalClient.id)
      }
      setEditingHistoryId(null)
      setRegisterInlineOpen(false)
      setRegisterInlineForm({
        contacted_at: toInputDateTimeLocal(new Date().toISOString()),
        channel: 'WHATSAPP',
        result: '',
        notes: '',
      })
      setRegisterInlineSaving(false)
      return
    }

    const { error: insertError } = await supabase.from('bem_aviv_client_followups').insert({
      user_id: followupUserId,
      created_by_user_id: user?.id ?? null,
      created_by_name: followupActorName,
      client_id: historyModalClient.id,
      contacted_at: contactedAtIso,
      channel: registerInlineForm.channel,
      result: registerInlineForm.result || null,
      notes: registerInlineForm.notes || null,
    })

    if (insertError) {
      setRegisterInlineSaving(false)
      return
    }

    await supabase
      .from('bem_aviv_clients')
      .update({
        last_contact_at: contactedAtIso,
        next_followup_status: 'CONCLUIDO',
      })
      .eq('id', historyModalClient.id)

    const rows = await refetchHistoryModalRows(historyModalClient.id)
    setHistoryModalRows(rows)
    setRegisterInlineOpen(false)
    setRegisterInlineForm({
      contacted_at: toInputDateTimeLocal(new Date().toISOString()),
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
        contacted_at: toInputDateTimeLocal(new Date().toISOString()),
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
          contacted_at: toInputDateTimeLocal(new Date().toISOString()),
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
    setScheduleInlineOpen((prev) => !prev)
    setScheduleInlineForm({
      contact_done: false,
      next_followup_at: toInputDateTimeLocal(new Date().toISOString()),
      commercial_stage: historyModalClient?.commercial_stage || 'CONTATO',
      summary: '',
      details: '',
    })
  }

  async function submitInlineSchedule(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !ownerUserId || !historyModalClient) return
    if (!scheduleInlineForm.next_followup_at) {
      alert('INFORME A DATA/HORA DO AGENDAMENTO.')
      return
    }
    setScheduleInlineSaving(true)
    const { error } = await supabase
      .from('bem_aviv_clients')
      .update({
        next_followup_at: new Date(scheduleInlineForm.next_followup_at).toISOString(),
        next_followup_note: composeFollowupNote(scheduleInlineForm.summary, scheduleInlineForm.details) || null,
        next_followup_status: 'PENDENTE',
        commercial_stage: scheduleInlineForm.commercial_stage,
        last_contact_at: scheduleInlineForm.contact_done ? new Date().toISOString() : historyModalClient.last_contact_at ?? null,
      })
      .eq('id', historyModalClient.id)
      .eq('user_id', ownerUserId)
    if (error) {
      alert(error.message)
      setScheduleInlineSaving(false)
      return
    }
    setScheduleInlineOpen(false)
    setScheduleInlineSaving(false)
    await load()
    alert('PRÓXIMO FOLLOW-UP AGENDADO COM SUCESSO.')
  }

  async function removeHistoryRow(rowId: string) {
    if (!supabase || !ownerUserId || !historyModalClient) return
    if (!confirm('EXCLUIR ESTE REGISTRO DE CONTATO?')) return
    const { error } = await supabase
      .from('bem_aviv_client_followups')
      .delete()
      .eq('id', rowId)
      .eq('user_id', ownerUserId.toUpperCase())
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
    if (!supabase || !ownerUserId) return
    setPedidosModalLoading(true)
    const { data, error } = await supabase
      .from('bem_aviv_sales_orders')
      .select('id, order_date, document_type, document_number, status, total_amount')
      .eq('user_id', ownerUserId)
      .eq('client_id', client.id)
      .order('order_date', { ascending: false })
      .order('document_number', { ascending: false })
    if (error) {
      alert(error.message)
      setPedidosModalRows([])
    } else {
      setPedidosModalRows((data as OrderRow[]) ?? [])
    }
    setPedidosModalLoading(false)
  }

  function closePedidosModal() {
    setPedidosModalClient(null)
    setPedidosModalRows([])
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

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
          <p className="text-[8px] font-semibold uppercase tracking-wide text-slate-500">Total</p>
          <p className="font-hub mt-1 text-[20px] font-bold text-slate-900">{stats.total}</p>
          <span className="mt-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[8px] text-slate-600">Cadastros</span>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
          <p className="text-[8px] font-semibold uppercase tracking-wide text-slate-500">Clientes</p>
          <p className="font-hub mt-1 text-[20px] font-bold text-slate-900">{stats.clientes}</p>
          <span className="mt-1 inline-block rounded-full bg-[#EAF3DE] px-2 py-0.5 text-[8px] font-medium text-[#3B6D11]">Ativos</span>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
          <p className="text-[8px] font-semibold uppercase tracking-wide text-slate-500">Prospecção</p>
          <p className="font-hub mt-1 text-[20px] font-bold text-slate-900">{stats.prospec}</p>
          <span className="mt-1 inline-block rounded-full bg-[#FAEEDA] px-2 py-0.5 text-[8px] font-medium text-[#854F0B]">Prospects</span>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
          <p className="text-[8px] font-semibold uppercase tracking-wide text-slate-500">Cadastro completo</p>
          <p className="font-hub mt-1 text-[20px] font-bold text-slate-900">{stats.comEmail}</p>
          <span className="mt-1 inline-block rounded-full bg-[#E6F1FB] px-2 py-0.5 text-[8px] font-medium text-[#185FA5]">Com e-mail</span>
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
          <button
            type="button"
            className={cn(pillBase, statusFilter === 'CLIENTE' ? pillActive : pillIdle)}
            onClick={() => setStatusFilter('CLIENTE')}
          >
            Clientes
          </button>
          <button
            type="button"
            className={cn(pillBase, statusFilter === 'PROSPECÇÃO' ? pillActive : pillIdle)}
            onClick={() => setStatusFilter('PROSPECÇÃO')}
          >
            Prospecção
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
                        <p className="truncate text-sm font-medium normal-case text-slate-900">{r.full_name}</p>
                      </div>
                    </div>
                  </td>
                  <td className="min-w-[9rem] text-xs normal-case text-slate-600">
                    {[formatPhone(r.phone_1), formatPhone(r.phone_2)].filter(Boolean).join(' / ') || '—'}
                  </td>
                  <td>
                    {(r.client_status ?? '').trim() === 'CLIENTE' ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#EAF3DE] px-2 py-0.5 text-[8px] font-medium text-[#3B6D11]">
                        <span className="h-1 w-1 rounded-full bg-[#639922]" aria-hidden />
                        Cliente
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#FAEEDA] px-2 py-0.5 text-[8px] font-medium text-[#854F0B]">
                        <span className="h-1 w-1 rounded-full bg-[#EF9F27]" aria-hidden />
                        Prospecção
                      </span>
                    )}
                  </td>
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
                        onClick={() => goToFollowupSchedule(r)}
                        title="Agendar follow-up"
                        aria-label="Agendar follow-up"
                      >
                        <CalendarPlus size={16} strokeWidth={2.2} />
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
                    Data/Hora
                    <input
                      type="datetime-local"
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
                          contacted_at: toInputDateTimeLocal(new Date().toISOString()),
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
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Agendar próximo follow-up</p>
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
                      type="datetime-local"
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
              ) : historyModalRows.length === 0 ? (
                <p className="p-4 text-sm text-slate-500">Nenhum contato registrado para este cliente.</p>
              ) : (
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-left">Data/Hora</th>
                      <th className="px-3 py-2 text-left">Canal</th>
                      <th className="px-3 py-2 text-left">Usuário</th>
                      <th className="px-3 py-2 text-left">Resumo</th>
                      <th className="px-3 py-2 text-left">Detalhe</th>
                      <th className="px-3 py-2 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyModalRows.map((r) => (
                      <tr
                        key={r.id}
                        className={cn(
                          'border-t border-slate-100',
                          editingHistoryId === r.id && 'bg-sky-50/80',
                        )}
                      >
                        <td className="px-3 py-2 text-slate-700">{formatShortDateTime(r.contacted_at)}</td>
                        <td className="px-3 py-2 text-slate-700">{r.channel}</td>
                        <td className="px-3 py-2 text-slate-700">{r.created_by_name || '—'}</td>
                        <td className="px-3 py-2 text-slate-700">{r.result || '—'}</td>
                        <td className="px-3 py-2 text-slate-700">{r.notes || '—'}</td>
                        <td className="px-3 py-2 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-100"
                              onClick={() => {
                                setScheduleInlineOpen(false)
                                setEditingHistoryId(r.id)
                                setRegisterInlineForm({
                                  contacted_at: toInputDateTimeLocal(r.contacted_at),
                                  channel: r.channel,
                                  result: r.result ?? '',
                                  notes: r.notes ?? '',
                                })
                                setRegisterInlineOpen(true)
                              }}
                              title="Editar registro"
                              aria-label="Editar registro"
                            >
                              <Pencil size={15} strokeWidth={2.2} />
                            </button>
                            <button
                              type="button"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-300 bg-white text-red-700 shadow-sm hover:bg-red-50"
                              onClick={() => void removeHistoryRow(r.id)}
                              title="Excluir registro"
                              aria-label="Excluir registro"
                            >
                              <Trash2 size={15} strokeWidth={2.2} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
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
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closePedidosModal()
          }}
        >
          <div
            className="flex max-h-[min(92dvh,900px)] w-full max-w-7xl flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
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
    </div>
  )
}
