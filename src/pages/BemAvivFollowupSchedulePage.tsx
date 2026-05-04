import { useUser } from '@clerk/clerk-react'
import { useNavigate, useParams } from 'react-router-dom'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '../components/ui/Button'
import { useSupabase } from '../hooks/useSupabase'
import { BEM_AVIV_CLIENT_COMMERCIAL_STAGE_OPTIONS } from '../lib/bemAvivClientStatus'
import { clerkEmailCandidates } from '../lib/clerkEmails'
import { resolveDataOwnerId } from '../lib/dataOwner'

type FollowupStatus = 'PENDENTE' | 'CONCLUIDO' | 'CANCELADO'

type Cliente = {
  id: string
  full_name: string
  commercial_stage: string | null
  next_followup_at: string | null
  next_followup_note: string | null
  next_followup_status: FollowupStatus | null
}

function toInputDateTimeLocal(value?: string | null) {
  if (!value) return ''
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return ''
  const tz = dt.getTimezoneOffset() * 60_000
  const local = new Date(dt.getTime() - tz)
  return local.toISOString().slice(0, 16)
}

export function BemAvivFollowupSchedulePage() {
  const { clientId } = useParams<{ clientId: string }>()
  const { user } = useUser()
  const supabase = useSupabase()
  const navigate = useNavigate()
  const ownerUserId = resolveDataOwnerId(user?.id, clerkEmailCandidates(user).join(','))

  const [loading, setLoading] = useState(true)
  const [client, setClient] = useState<Cliente | null>(null)
  const [scheduleForm, setScheduleForm] = useState({
    next_followup_at: '',
    next_followup_note: '',
    next_followup_status: 'PENDENTE' as FollowupStatus,
    commercial_stage: 'CONTATO',
  })

  const loadClient = useCallback(async () => {
    if (!supabase || !ownerUserId || !clientId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('bem_aviv_clients')
      .select('id, full_name, commercial_stage, next_followup_at, next_followup_note, next_followup_status')
      .eq('user_id', ownerUserId)
      .eq('id', clientId)
      .maybeSingle()

    if (error) {
      alert(error.message)
      setClient(null)
    } else if (data) {
      const c = data as Cliente
      setClient(c)
      setScheduleForm({
        next_followup_at: toInputDateTimeLocal(c.next_followup_at),
        next_followup_note: c.next_followup_note ?? '',
        next_followup_status: (c.next_followup_status ?? 'PENDENTE') as FollowupStatus,
        commercial_stage: c.commercial_stage ?? 'CONTATO',
      })
    } else {
      setClient(null)
    }
    setLoading(false)
  }, [clientId, ownerUserId, supabase])

  useEffect(() => {
    void loadClient()
  }, [loadClient])

  async function submitScheduleFollowup(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !client) return
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
      .eq('id', client.id)

    if (error) {
      alert(error.message)
      return
    }

    navigate('/bem-aviv/follow-up', { replace: true })
  }

  async function clearScheduledFollowup() {
    if (!supabase || !client) return
    if (!confirm('EXCLUIR O AGENDAMENTO DESTE CLIENTE?')) return

    const { error } = await supabase
      .from('bem_aviv_clients')
      .update({
        next_followup_at: null,
        next_followup_note: null,
        next_followup_status: 'PENDENTE',
      })
      .eq('id', client.id)

    if (error) {
      alert(error.message)
      return
    }

    navigate('/bem-aviv/follow-up', { replace: true })
  }

  if (!supabase) return <p className="text-slate-600">CONECTANDO...</p>

  if (loading) {
    return <p className="rounded-xl border border-slate-200 bg-white p-4 text-slate-500">CARREGANDO...</p>
  }

  if (!client) {
    return (
      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-slate-700">Cliente não encontrado ou sem permissão.</p>
        <Button variant="secondary" type="button" onClick={() => navigate('/bem-aviv')}>
          VOLTAR AO DASHBOARD
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-xl space-y-4 pb-8 normal-case">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" type="button" onClick={() => navigate('/bem-aviv')}>
          VOLTAR AO DASHBOARD
        </Button>
        <Button
          type="button"
          onClick={() => navigate('/bem-aviv/follow-up', { state: { openStartFollowup: true } })}
        >
          INCLUIR NOVO FOLLOW-UP
        </Button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <h1 className="text-lg font-semibold sm:text-xl">AGENDAR PRÓXIMO FOLLOW-UP</h1>
        <p className="mt-1 text-sm text-slate-500">{client.full_name}</p>

        <form onSubmit={submitScheduleFollowup} className="mt-6 grid gap-3">
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
            <label>REGISTRO</label>
            <textarea
              rows={3}
              value={scheduleForm.next_followup_note}
              onChange={(e) => setScheduleForm((prev) => ({ ...prev, next_followup_note: e.target.value }))}
            />
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button type="submit">Salvar agendamento</Button>
            <Button variant="danger" type="button" onClick={() => void clearScheduledFollowup()}>
              Excluir agendamento
            </Button>
            <Button variant="secondary" type="button" onClick={() => navigate('/bem-aviv/follow-up')}>
              Fechar
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
