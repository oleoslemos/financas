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

export function BemAvivFollowupProdutividadePage() {
  const { user } = useUser()
  const supabase = useSupabase()
  const ownerUserId = resolveDataOwnerId(user?.id, clerkEmailCandidates(user).join(','))
  const [periodDays, setPeriodDays] = useState<7 | 30 | 90>(30)
  const [clients, setClients] = useState<ClienteRow[]>([])
  const [followups, setFollowups] = useState<FollowupRow[]>([])
  const [historyRows, setHistoryRows] = useState<FollowupRow[]>([])
  const [historyTarget, setHistoryTarget] = useState<ClientHistoryTarget | null>(null)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!supabase || !ownerUserId) return
    setLoading(true)
    const since = new Date()
    since.setDate(since.getDate() - periodDays)

    const [clientsRes, followupsRes] = await Promise.all([
      supabase
        .from('bem_aviv_clients')
        .select('id, full_name, client_status, commercial_stage, last_contact_at, next_followup_at, next_followup_status')
        .eq('user_id', ownerUserId),
      supabase
        .from('bem_aviv_client_followups')
        .select('id, client_id, contacted_at, channel, result, notes')
        .eq('user_id', ownerUserId)
        .gte('contacted_at', since.toISOString()),
    ])

    if (clientsRes.error) alert(clientsRes.error.message)
    if (followupsRes.error) alert(followupsRes.error.message)
    setClients((clientsRes.data as ClienteRow[]) ?? [])
    setFollowups((followupsRes.data as FollowupRow[]) ?? [])
    setLoading(false)
  }, [ownerUserId, periodDays, supabase])

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
    const semAgendamento = clients.filter((c) => !c.next_followup_at).length
    const concluidos = clients.filter((c) => (c.next_followup_status ?? 'PENDENTE') === 'CONCLUIDO').length
    const pendentes = clients.filter((c) => (c.next_followup_status ?? 'PENDENTE') === 'PENDENTE').length
    const taxaConclusao = pendentes + concluidos > 0 ? Math.round((concluidos / (pendentes + concluidos)) * 100) : 0

    const statusCounts = BEM_AVIV_CLIENT_COMMERCIAL_STAGE_OPTIONS.map((stage) => ({
      stage,
      count: clients.filter((c) => (c.commercial_stage ?? 'CONTATO') === stage).length,
    }))

    const byChannel = ['WHATSAPP', 'LIGACAO', 'EMAIL', 'OUTRO'].map((channel) => ({
      channel,
      count: followups.filter((f) => (f.channel ?? 'OUTRO') === channel).length,
    }))

    const priority = clients
      .filter((c) => c.next_followup_at && (c.next_followup_status ?? 'PENDENTE') === 'PENDENTE')
      .sort((a, b) => new Date(a.next_followup_at ?? '').getTime() - new Date(b.next_followup_at ?? '').getTime())
      .slice(0, 10)

    return { vencidos, hoje, proximos7, semAgendamento, taxaConclusao, statusCounts, byChannel, priority }
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
            <select value={periodDays} onChange={(e) => setPeriodDays(Number(e.target.value) as 7 | 30 | 90)}>
              <option value={7}>ÚLTIMOS 7 DIAS</option>
              <option value={30}>ÚLTIMOS 30 DIAS</option>
              <option value={90}>ÚLTIMOS 90 DIAS</option>
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
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs text-slate-600">SEM AGENDAMENTO</p><p className="text-2xl font-semibold text-slate-900">{metrics.semAgendamento}</p></div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"><p className="text-xs text-emerald-700">TAXA DE CONCLUSÃO</p><p className="text-2xl font-semibold text-emerald-900">{metrics.taxaConclusao}%</p></div>
        <div className="rounded-xl border border-violet-200 bg-violet-50 p-4"><p className="text-xs text-violet-700">CONTATOS NO PERÍODO</p><p className="text-2xl font-semibold text-violet-900">{followups.length}</p></div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">ETAPAS COMERCIAIS DOS CLIENTES</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {metrics.statusCounts.map((item) => (
              <div key={item.stage} className="rounded-md border border-slate-200 px-3 py-2">
                <p className="text-xs text-slate-500">{item.stage}</p>
                <p className="text-lg font-semibold text-slate-900">{item.count}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">CONTATOS POR CANAL (PERÍODO)</h3>
          <div className="space-y-2">
            {metrics.byChannel.map((item) => (
              <div key={item.channel} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2">
                <span className="text-sm text-slate-600">{item.channel}</span>
                <span className="text-lg font-semibold text-slate-900">{item.count}</span>
              </div>
            ))}
          </div>
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
