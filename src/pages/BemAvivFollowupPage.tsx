import { useUser } from '@clerk/clerk-react'
import { CalendarPlus, MessageCircle, Pencil, PhoneForwarded, Search, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { useSupabase } from '../hooks/useSupabase'
import { BEM_AVIV_CLIENT_COMMERCIAL_STAGE_OPTIONS } from '../lib/bemAvivClientStatus'
import { clerkEmailCandidates } from '../lib/clerkEmails'
import { resolveDataOwnerId } from '../lib/dataOwner'
import { buildWhatsappUrl } from '../lib/whatsapp'

type FollowupStatus = 'PENDENTE' | 'CONCLUIDO' | 'CANCELADO'
type DateFilter = 'TODOS' | 'VENCIDOS' | 'HOJE' | 'PROXIMOS_7' | 'SEM_AGENDAMENTO'

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
  result: string | null
  notes: string | null
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

export function BemAvivFollowupPage() {
  const { user } = useUser()
  const supabase = useSupabase()
  const ownerUserId = resolveDataOwnerId(user?.id, clerkEmailCandidates(user).join(','))
  const followupUserId = ownerUserId ? ownerUserId.toUpperCase() : null

  const [rows, setRows] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dateFilter, setDateFilter] = useState<DateFilter>('TODOS')
  const [statusFilter, setStatusFilter] = useState<'TODOS' | FollowupStatus>('TODOS')
  const [registeringClient, setRegisteringClient] = useState<Cliente | null>(null)
  const [schedulingClient, setSchedulingClient] = useState<Cliente | null>(null)
  const [historyRows, setHistoryRows] = useState<FollowupHistoryRow[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [editingHistoryId, setEditingHistoryId] = useState<string | null>(null)

  const [registerForm, setRegisterForm] = useState({
    contacted_at: toInputDateTimeLocal(new Date().toISOString()),
    channel: 'WHATSAPP',
    result: '',
    notes: '',
  })

  const [scheduleForm, setScheduleForm] = useState({
    next_followup_at: '',
    next_followup_note: '',
    next_followup_status: 'PENDENTE' as FollowupStatus,
    commercial_stage: 'CONTATO',
  })

  const load = useCallback(async () => {
    if (!supabase || !ownerUserId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('bem_aviv_clients')
      .select('id, full_name, phone_1, phone_2, client_status, commercial_stage, last_contact_at, next_followup_at, next_followup_note, next_followup_status')
      .eq('user_id', ownerUserId)
      .order('full_name')

    if (error) {
      alert(error.message)
      setRows([])
    } else {
      setRows((data as Cliente[]) ?? [])
    }
    setLoading(false)
  }, [ownerUserId, supabase])

  useEffect(() => {
    void load()
  }, [load])

  async function loadHistory(clientId: string) {
    if (!supabase || !followupUserId) return
    setLoadingHistory(true)
    const { data, error } = await supabase
      .from('bem_aviv_client_followups')
      .select('id, contacted_at, channel, result, notes')
      .eq('user_id', followupUserId)
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
  }

  async function removeHistoryEntry(entryId: string) {
    if (!supabase || !registeringClient) return
    if (!confirm('EXCLUIR ESTE REGISTRO DE CONTATO?')) return

    const { error } = await supabase.from('bem_aviv_client_followups').delete().eq('id', entryId)
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

    return rows.filter((row) => {
      const hasSearchMatch =
        !q ||
        row.full_name.toUpperCase().includes(q) ||
        onlyDigits(row.phone_1 ?? '').includes(onlyDigits(q)) ||
        onlyDigits(row.phone_2 ?? '').includes(onlyDigits(q))

      if (!hasSearchMatch) return false

      if (statusFilter !== 'TODOS' && (row.next_followup_status ?? 'PENDENTE') !== statusFilter) {
        return false
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
  }, [rows, search, dateFilter, statusFilter])

  async function submitRegisterContact(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !followupUserId || !registeringClient) return
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
          result: registerForm.result || null,
          notes: registerForm.notes || null,
        })
        .eq('id', editingHistoryId)

      if (updateError) {
        alert(updateError.message)
        return
      }
    } else {
      const { error: insertError } = await supabase.from('bem_aviv_client_followups').insert({
        user_id: followupUserId,
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

  async function submitScheduleFollowup(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !schedulingClient) return
    if (!scheduleForm.next_followup_at) {
      alert('INFORME A DATA/HORA DO PRÓXIMO FOLLOW-UP.')
      return
    }

    const clientStatus = scheduleForm.commercial_stage === 'FECHADO PLATAFORMA CONFORTO' ? 'CLIENTE' : 'PROSPECÇÃO'

    const { error } = await supabase
      .from('bem_aviv_clients')
      .update({
        next_followup_at: new Date(scheduleForm.next_followup_at).toISOString(),
        next_followup_note: scheduleForm.next_followup_note || null,
        next_followup_status: scheduleForm.next_followup_status,
        commercial_stage: scheduleForm.commercial_stage,
        client_status: clientStatus,
      })
      .eq('id', schedulingClient.id)

    if (error) {
      alert(error.message)
      return
    }

    setSchedulingClient(null)
    await load()
  }

  async function clearScheduledFollowup() {
    if (!supabase || !schedulingClient) return
    if (!confirm('EXCLUIR O AGENDAMENTO DESTE CLIENTE?')) return

    const { error } = await supabase
      .from('bem_aviv_clients')
      .update({
        next_followup_at: null,
        next_followup_note: null,
        next_followup_status: 'PENDENTE',
      })
      .eq('id', schedulingClient.id)

    if (error) {
      alert(error.message)
      return
    }

    setSchedulingClient(null)
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
    <div className="space-y-6 normal-case">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">FOLLOW-UP DE CLIENTES</h2>
          <p className="text-sm text-slate-500">Registre contatos e organize os próximos retornos por data.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/bem-aviv/follow-up/produtividade">
            <Button variant="ghost">Visão geral</Button>
          </Link>
          <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">TOTAL: {filteredRows.length}</p>
        </div>
      </div>

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
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'TODOS' | FollowupStatus)}>
            <option value="TODOS">Todos</option>
            <option value="PENDENTE">Pendente</option>
            <option value="CONCLUIDO">Concluído</option>
            <option value="CANCELADO">Cancelado</option>
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

      <div className="table-wrap">
        {loading ? (
          <p className="p-4 text-slate-500">CARREGANDO...</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>CLIENTE</th>
                <th>TELEFONE</th>
                <th>STATUS CLIENTE</th>
                <th>ETAPA COMERCIAL</th>
                <th>ÚLTIMO CONTATO</th>
                <th>PRÓXIMO FOLLOW-UP</th>
                <th>STATUS FOLLOW-UP</th>
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
                        onClick={() => {
                          setSchedulingClient(row)
                          setScheduleForm({
                            next_followup_at: toInputDateTimeLocal(row.next_followup_at),
                            next_followup_note: row.next_followup_note ?? '',
                            next_followup_status: (row.next_followup_status ?? 'PENDENTE') as FollowupStatus,
                            commercial_stage: row.commercial_stage ?? 'CONTATO',
                          })
                        }}
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
        )}
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
                            {formatDateTime(item.contacted_at)} • {item.channel}
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

      {schedulingClient ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-3">
          <div className="w-full max-w-xl rounded-xl border border-slate-200 bg-white p-4 shadow-xl sm:p-5">
            <h3 className="text-lg font-semibold">AGENDAR PRÓXIMO FOLLOW-UP</h3>
            <p className="mb-4 text-sm text-slate-500">{schedulingClient.full_name}</p>
            <form onSubmit={submitScheduleFollowup} className="grid gap-3">
              <div>
                <label>PRÓXIMO FOLLOW-UP</label>
                <input
                  type="datetime-local"
                  required
                  value={scheduleForm.next_followup_at}
                  onChange={(e) => setScheduleForm((prev) => ({ ...prev, next_followup_at: e.target.value }))}
                />
              </div>
              <div>
                <label>STATUS</label>
                <select
                  value={scheduleForm.next_followup_status}
                  onChange={(e) => setScheduleForm((prev) => ({ ...prev, next_followup_status: e.target.value as FollowupStatus }))}
                >
                  <option value="PENDENTE">PENDENTE</option>
                  <option value="CONCLUIDO">CONCLUIDO</option>
                  <option value="CANCELADO">CANCELADO</option>
                </select>
              </div>
              <div>
                <label>STATUS COMERCIAL</label>
                <select
                  value={scheduleForm.commercial_stage}
                  onChange={(e) => setScheduleForm((prev) => ({ ...prev, commercial_stage: e.target.value }))}
                >
                  {BEM_AVIV_CLIENT_COMMERCIAL_STAGE_OPTIONS.map((stage) => (
                    <option key={stage} value={stage}>
                      {stage}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>OBSERVAÇÃO DO PRÓXIMO CONTATO</label>
                <textarea
                  rows={3}
                  value={scheduleForm.next_followup_note}
                  onChange={(e) => setScheduleForm((prev) => ({ ...prev, next_followup_note: e.target.value }))}
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit">Salvar agendamento</Button>
                <Button variant="danger" onClick={() => void clearScheduledFollowup()}>
                  Excluir agendamento
                </Button>
                <Button variant="secondary" onClick={() => setSchedulingClient(null)}>
                  Fechar
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}
