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
  last_contact_at: string | null
  next_followup_at: string | null
  next_followup_note: string | null
  next_followup_status: FollowupStatus | null
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

function composeFollowupNote(summary: string, details: string) {
  const s = summary.trim()
  const d = details.trim()
  if (s && d) return `RESUMO: ${s}\n${d}`
  if (s) return `RESUMO: ${s}`
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
    next_followup_summary: '',
    next_followup_note: '',
    contact_done: false,
    commercial_stage: 'CONTATO',
  })

  const loadClient = useCallback(async () => {
    if (!supabase || !ownerUserId || !clientId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('bem_aviv_clients')
      .select('id, full_name, commercial_stage, last_contact_at, next_followup_at, next_followup_note, next_followup_status')
      .eq('user_id', ownerUserId)
      .eq('id', clientId)
      .maybeSingle()

    if (error) {
      alert(error.message)
      setClient(null)
    } else if (data) {
      const c = data as Cliente
      const parsed = splitFollowupNote(c.next_followup_note)
      setClient(c)
      setScheduleForm({
        next_followup_at: toInputDateTimeLocal(c.next_followup_at),
        next_followup_summary: parsed.summary,
        next_followup_note: parsed.details,
        contact_done: false,
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
        next_followup_note: composeFollowupNote(scheduleForm.next_followup_summary, scheduleForm.next_followup_note) || null,
        // Agendamento de próximo retorno deve permanecer pendente para aparecer no calendário da Visão Geral.
        next_followup_status: 'PENDENTE',
        last_contact_at: scheduleForm.contact_done ? new Date().toISOString() : client.last_contact_at ?? null,
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
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/35 p-3 normal-case">
      <div className="w-full max-w-xl rounded-xl border border-slate-200 bg-white p-4 shadow-xl sm:p-6">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Button variant="secondary" type="button" onClick={() => navigate('/bem-aviv')}>
            VOLTAR AO DASHBOARD
          </Button>
          <Button
            type="button"
            onClick={() =>
              navigate('/bem-aviv/follow-up', {
                state: { openStartFollowup: true, startFollowupClientId: client.id },
              })
            }
          >
            INCLUIR NOVO FOLLOW-UP
          </Button>
        </div>

        <h1 className="text-lg font-semibold sm:text-xl">AGENDAR PRÓXIMO FOLLOW-UP</h1>
        <p className="mt-1 text-sm text-slate-500">{client.full_name}</p>

        <form onSubmit={submitScheduleFollowup} className="mt-6 grid gap-3">
          <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={scheduleForm.contact_done}
              onChange={(e) => setScheduleForm((prev) => ({ ...prev, contact_done: e.target.checked }))}
              className="h-4 w-4 rounded border-slate-300"
            />
            Contato realizado
          </label>
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
            <label>STATUS RELACIONAMENTO</label>
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
            <label>RESUMO (ATÉ 60 CARACTERES)</label>
            <input
              maxLength={60}
              value={scheduleForm.next_followup_summary}
              onChange={(e) => setScheduleForm((prev) => ({ ...prev, next_followup_summary: e.target.value }))}
              placeholder="Ex.: Confirmar horário da visita"
            />
            <p className="mt-1 text-[8px] text-slate-500">{scheduleForm.next_followup_summary.length}/60</p>
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
