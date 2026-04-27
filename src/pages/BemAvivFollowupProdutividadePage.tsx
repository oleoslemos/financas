import { useUser } from '@clerk/clerk-react'
import { History } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '../components/ui/Button'
import { useSupabase } from '../hooks/useSupabase'
import { BEM_AVIV_CLIENT_COMMERCIAL_STAGE_OPTIONS } from '../lib/bemAvivClientStatus'
import { clerkEmailCandidates } from '../lib/clerkEmails'
import { resolveDataOwnerId } from '../lib/dataOwner'

type ClienteRow = {
  id: string
  full_name: string
  client_status: string | null
  commercial_stage: string | null
  last_contact_at: string | null
  next_followup_at: string | null
  next_followup_status: 'PENDENTE' | 'CONCLUIDO' | 'CANCELADO' | null
}

type FollowupRow = {
  id: string
  client_id: string
  contacted_at: string
  channel: string | null
  result: string | null
  notes: string | null
}

type ClientHistoryTarget = {
  id: string
  full_name: string
}

type HistoryFormState = {
  contacted_at: string
  channel: 'WHATSAPP' | 'LIGACAO' | 'EMAIL' | 'OUTRO'
  result: string
  notes: string
}

function formatDateTime(value?: string | null) {
  if (!value) return '—'
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return '—'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(dt)
}

function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function toInputDateTimeLocal(value?: string | null) {
  if (!value) return ''
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return ''
  const tz = dt.getTimezoneOffset() * 60_000
  const local = new Date(dt.getTime() - tz)
  return local.toISOString().slice(0, 16)
}

export function BemAvivFollowupProdutividadePage() {
  const { user } = useUser()
  const supabase = useSupabase()
  const ownerUserId = resolveDataOwnerId(user?.id, clerkEmailCandidates(user).join(','))
  const [periodFilter, setPeriodFilter] = useState<'ULTIMOS_7_DIAS' | 'ULTIMOS_30_DIAS' | 'ULTIMOS_90_DIAS' | 'MES_ATUAL' | 'MES_PASSADO' | 'MES_PROXIMO'>(
    'MES_ATUAL',
  )
  const [clients, setClients] = useState<ClienteRow[]>([])
  const [followups, setFollowups] = useState<FollowupRow[]>([])
  const [historyRows, setHistoryRows] = useState<FollowupRow[]>([])
  const [historyTarget, setHistoryTarget] = useState<ClientHistoryTarget | null>(null)
  const [historyFormOpen, setHistoryFormOpen] = useState(false)
  const [historyForm, setHistoryForm] = useState<HistoryFormState>({
    contacted_at: toInputDateTimeLocal(new Date().toISOString()),
    channel: 'WHATSAPP',
    result: '',
    notes: '',
  })
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!supabase || !ownerUserId) return
    setLoading(true)
    const now = new Date()
    let periodStart = new Date(now)
    let periodEnd = new Date(now)

    if (periodFilter === 'ULTIMOS_7_DIAS') {
      periodStart.setDate(periodStart.getDate() - 7)
    } else if (periodFilter === 'ULTIMOS_30_DIAS') {
      periodStart.setDate(periodStart.getDate() - 30)
    } else if (periodFilter === 'ULTIMOS_90_DIAS') {
      periodStart.setDate(periodStart.getDate() - 90)
    } else if (periodFilter === 'MES_ATUAL') {
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
      periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
    } else if (periodFilter === 'MES_PASSADO') {
      periodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0)
      periodEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)
    } else if (periodFilter === 'MES_PROXIMO') {
      periodStart = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0)
      periodEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59, 999)
    }

    const [clientsRes, followupsRes] = await Promise.all([
      supabase
        .from('bem_aviv_clients')
        .select('id, full_name, client_status, commercial_stage, last_contact_at, next_followup_at, next_followup_status')
        .eq('user_id', ownerUserId),
      supabase
        .from('bem_aviv_client_followups')
        .select('id, client_id, contacted_at, channel, result, notes')
        .eq('user_id', ownerUserId)
        .gte('contacted_at', periodStart.toISOString())
        .lte('contacted_at', periodEnd.toISOString()),
    ])

    if (clientsRes.error) alert(clientsRes.error.message)
    if (followupsRes.error) alert(followupsRes.error.message)
    setClients((clientsRes.data as ClienteRow[]) ?? [])
    setFollowups((followupsRes.data as FollowupRow[]) ?? [])
    setLoading(false)
  }, [ownerUserId, periodFilter, supabase])

  useEffect(() => {
    void load()
  }, [load])

  async function openClientHistory(client: ClientHistoryTarget) {
    if (!supabase || !ownerUserId) return
    setHistoryTarget(client)
    setLoadingHistory(true)
    const { data, error } = await supabase
      .from('bem_aviv_client_followups')
      .select('id, client_id, contacted_at, channel, result, notes')
      .eq('user_id', ownerUserId)
      .eq('client_id', client.id)
      .order('contacted_at', { ascending: false })
      .limit(30)

    if (error) {
      alert(error.message)
      setHistoryRows([])
    } else {
      setHistoryRows((data as FollowupRow[]) ?? [])
    }
    setLoadingHistory(false)
  }

  async function submitHistoryEntry(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !ownerUserId || !historyTarget) return
    if (!historyForm.contacted_at) {
      alert('INFORME A DATA/HORA DO CONTATO.')
      return
    }

    const contactedAtIso = new Date(historyForm.contacted_at).toISOString()
    const { error } = await supabase.from('bem_aviv_client_followups').insert({
      user_id: ownerUserId,
      client_id: historyTarget.id,
      contacted_at: contactedAtIso,
      channel: historyForm.channel,
      result: historyForm.result || null,
      notes: historyForm.notes || null,
    })
    if (error) {
      alert(error.message)
      return
    }

    const { error: clientError } = await supabase
      .from('bem_aviv_clients')
      .update({
        last_contact_at: contactedAtIso,
      })
      .eq('id', historyTarget.id)
    if (clientError) {
      alert(clientError.message)
      return
    }

    setHistoryForm({
      contacted_at: toInputDateTimeLocal(new Date().toISOString()),
      channel: 'WHATSAPP',
      result: '',
      notes: '',
    })
    await openClientHistory(historyTarget)
    await load()
  }

  const metrics = useMemo(() => {
    const now = new Date()
    const today = startOfToday()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const weekEnd = new Date(today)
    weekEnd.setDate(weekEnd.getDate() + 7)
    weekEnd.setHours(23, 59, 59, 999)

    const vencidos = clients.filter((c) => c.next_followup_at && new Date(c.next_followup_at) < now && (c.next_followup_status ?? 'PENDENTE') === 'PENDENTE').length
    const hoje = clients.filter((c) => c.next_followup_at && new Date(c.next_followup_at) >= today && new Date(c.next_followup_at) < tomorrow).length
    const proximos7 = clients.filter((c) => c.next_followup_at && new Date(c.next_followup_at) >= today && new Date(c.next_followup_at) <= weekEnd).length
    const statusCounts = BEM_AVIV_CLIENT_COMMERCIAL_STAGE_OPTIONS.map((stage) => ({
      stage,
      count: clients.filter((c) => (c.commercial_stage ?? 'CONTATO') === stage).length,
    }))

    const priority = clients
      .filter((c) => c.next_followup_at && (c.next_followup_status ?? 'PENDENTE') === 'PENDENTE')
      .sort((a, b) => new Date(a.next_followup_at ?? '').getTime() - new Date(b.next_followup_at ?? '').getTime())
      .slice(0, 10)

    return { vencidos, hoje, proximos7, statusCounts, priority }
  }, [clients, followups])

  if (!supabase) return <p className="text-slate-600">CONECTANDO...</p>

  return (
    <div className="space-y-6 normal-case">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">PAINEL DE PRODUTIVIDADE DE FOLLOW-UP</h2>
          <p className="text-sm text-slate-500">Indicadores operacionais e distribuição por status comercial.</p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label>PERÍODO</label>
            <select value={periodFilter} onChange={(e) => setPeriodFilter(e.target.value as typeof periodFilter)}>
              <option value="MES_ATUAL">MÊS ATUAL</option>
              <option value="MES_PASSADO">MÊS PASSADO</option>
              <option value="MES_PROXIMO">MÊS PRÓXIMO</option>
              <option value="ULTIMOS_7_DIAS">ÚLTIMOS 7 DIAS</option>
              <option value="ULTIMOS_30_DIAS">ÚLTIMOS 30 DIAS</option>
              <option value="ULTIMOS_90_DIAS">ÚLTIMOS 90 DIAS</option>
            </select>
          </div>
          <Button variant="secondary" onClick={() => void load()}>
            Atualizar
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4"><p className="text-xs text-rose-700">VENCIDOS</p><p className="text-2xl font-semibold text-rose-900">{metrics.vencidos}</p></div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="text-xs text-amber-700">HOJE</p><p className="text-2xl font-semibold text-amber-900">{metrics.hoje}</p></div>
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-4"><p className="text-xs text-sky-700">PRÓXIMOS 7 DIAS</p><p className="text-2xl font-semibold text-sky-900">{metrics.proximos7}</p></div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">ETAPAS COMERCIAIS DOS CLIENTES</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {metrics.statusCounts.map((item) => (
            <div key={item.stage} className="rounded-md border border-slate-200 px-3 py-2">
              <p className="text-xs text-slate-500">{item.stage}</p>
              <p className="text-lg font-semibold text-slate-900">{item.count}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>CLIENTE</th>
              <th>CLASSIFICAÇÃO</th>
              <th>ETAPA COMERCIAL</th>
              <th>PRÓXIMO FOLLOW-UP</th>
              <th>STATUS FOLLOW-UP</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="py-6 text-center text-slate-500">CARREGANDO...</td>
              </tr>
            ) : metrics.priority.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-6 text-center text-slate-500">SEM PENDÊNCIAS PRIORITÁRIAS.</td>
              </tr>
            ) : (
              metrics.priority.map((item) => (
                <tr key={item.id}>
                  <td>{item.full_name}</td>
                  <td>{item.client_status || 'PROSPECÇÃO'}</td>
                  <td>{item.commercial_stage || 'CONTATO'}</td>
                  <td>{formatDateTime(item.next_followup_at)}</td>
                  <td>{item.next_followup_status || 'PENDENTE'}</td>
                  <td className="text-right">
                    <Button
                      variant="ghost"
                      className="px-2.5"
                      title="Ver histórico de follow-ups"
                      onClick={() => void openClientHistory({ id: item.id, full_name: item.full_name })}
                    >
                      <History size={15} />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {historyTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-3">
          <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-4 shadow-xl sm:p-5">
            <div className="mb-3">
              <h3 className="text-lg font-semibold">HISTÓRICO DE FOLLOW-UPS</h3>
              <p className="text-sm text-slate-500">{historyTarget.full_name}</p>
            </div>

            <div className="max-h-80 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-3">
              <div className="mb-2 flex justify-end">
                <Button variant="ghost" onClick={() => setHistoryFormOpen((v) => !v)}>
                  {historyFormOpen ? 'Cancelar inclusão' : 'Incluir histórico'}
                </Button>
              </div>
              {historyFormOpen ? (
                <form onSubmit={submitHistoryEntry} className="mb-3 grid gap-2 rounded-md border border-slate-200 p-3">
                  <div>
                    <label>DATA/HORA DO CONTATO</label>
                    <input
                      type="datetime-local"
                      required
                      value={historyForm.contacted_at}
                      onChange={(e) => setHistoryForm((prev) => ({ ...prev, contacted_at: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label>CANAL</label>
                    <select
                      value={historyForm.channel}
                      onChange={(e) => setHistoryForm((prev) => ({ ...prev, channel: e.target.value as HistoryFormState['channel'] }))}
                    >
                      <option value="WHATSAPP">WHATSAPP</option>
                      <option value="LIGACAO">LIGAÇÃO</option>
                      <option value="EMAIL">E-MAIL</option>
                      <option value="OUTRO">OUTRO</option>
                    </select>
                  </div>
                  <div>
                    <label>RESULTADO</label>
                    <input value={historyForm.result} onChange={(e) => setHistoryForm((prev) => ({ ...prev, result: e.target.value }))} />
                  </div>
                  <div>
                    <label>OBSERVAÇÕES</label>
                    <textarea rows={2} value={historyForm.notes} onChange={(e) => setHistoryForm((prev) => ({ ...prev, notes: e.target.value }))} />
                  </div>
                  <div className="flex justify-end">
                    <Button type="submit">Salvar histórico</Button>
                  </div>
                </form>
              ) : null}
              {loadingHistory ? <p className="text-slate-500">CARREGANDO...</p> : null}
              {!loadingHistory && historyRows.length === 0 ? <p className="text-slate-500">SEM HISTÓRICO PARA ESTE CLIENTE.</p> : null}
              {!loadingHistory
                ? historyRows.map((item) => (
                    <div key={item.id} className="rounded-md border border-slate-200 p-2">
                      <p className="text-xs text-slate-500">
                        {formatDateTime(item.contacted_at)} • {item.channel ?? 'OUTRO'}
                      </p>
                      <p>{item.result || 'SEM RESULTADO'}</p>
                      {item.notes ? <p className="text-xs text-slate-500">{item.notes}</p> : null}
                    </div>
                  ))
                : null}
            </div>

            <div className="mt-3 flex justify-end">
              <Button variant="secondary" onClick={() => setHistoryTarget(null)}>
                Fechar
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
