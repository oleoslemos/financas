import { CalendarClock, MessageCircle, Phone } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Avatar, AvatarFallback } from '../ui/Avatar'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card'
import { buildWhatsappUrl } from '../../lib/whatsapp'
import { cn } from '../../lib/cn'
import { formatDateOnly } from '../../lib/dates'

export type FollowUpCRMClient = {
  id: string
  full_name: string
  next_followup_at: string | null
  next_followup_status: string | null
  phone_1?: string | null
  phone_2?: string | null
  next_followup_note?: string | null
}

function onlyDigits(v: string) {
  return v.replace(/\D/g, '')
}

function telHref(phoneA?: string | null, phoneB?: string | null) {
  const d = onlyDigits((phoneA || phoneB) ?? '')
  return d ? `tel:${d}` : null
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase()
}

function startOfLocalDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
}

function timelineAccent(c: FollowUpCRMClient): 'rose' | 'sky' | 'slate' {
  if (!c.next_followup_at) return 'slate'
  const at = new Date(c.next_followup_at)
  const now = Date.now()
  if (at.getTime() < now) return 'rose'
  const today = startOfLocalDay(new Date())
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (at >= today && at < tomorrow) return 'sky'
  return 'slate'
}

function TimelineSubtitle({ client }: { client: FollowUpCRMClient }) {
  if (!client.next_followup_at) return <span className="text-xs text-slate-400">Sem data</span>
  const at = new Date(client.next_followup_at)
  const now = Date.now()
  if (at.getTime() < now) {
    return (
      <span className="text-xs font-medium italic text-red-600">
        Atrasado: {formatDateOnly(client.next_followup_at)}
      </span>
    )
  }
  const today = startOfLocalDay(new Date())
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (at >= today && at < tomorrow) {
    return <span className="text-xs text-slate-500">Hoje</span>
  }
  return <span className="text-xs text-slate-500">{formatDateOnly(client.next_followup_at)}</span>
}

const avatarRing: Record<'rose' | 'sky' | 'slate', { ring: string; fallback: string }> = {
  rose: { ring: 'border-2 border-red-100', fallback: 'bg-red-50 text-red-700' },
  sky: { ring: 'border-2 border-sky-200', fallback: 'bg-sky-50 text-[#185FA5]' },
  slate: { ring: 'border-2 border-slate-200', fallback: 'bg-slate-100 text-slate-700' },
}

export function FollowUpCRMGrid({ timelineClients }: { timelineClients: FollowUpCRMClient[] }) {
  return (
    <section>
      <Card className="border-0 shadow-md ring-1 ring-slate-100/90">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#185FA5]/10 text-[#185FA5]">
              <CalendarClock size={18} aria-hidden />
            </span>
            <div>
              <CardTitle className="font-hub text-sm font-semibold text-slate-800">Timeline de follow-up</CardTitle>
              <p className="text-xs text-slate-500">
                Pendências com data agendada (status pendente). Cancelados e concluídos não aparecem aqui.
              </p>
            </div>
          </div>
          <Link
            to="/bem-aviv/follow-up"
            className="shrink-0 text-xs font-semibold text-[#185FA5] hover:underline"
          >
            Ver tudo
          </Link>
        </CardHeader>
        <CardContent className="pt-0">
          {timelineClients.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-600">Nenhum follow-up pendente com data agendada.</p>
          ) : (
            <div className="max-h-[min(520px,58vh)] overflow-y-auto pr-1">
              <ul className="relative space-y-0">
                {timelineClients.map((c, index) => {
                  const accent = timelineAccent(c)
                  const a = avatarRing[accent]
                  const wa = buildWhatsappUrl(c.phone_1 || c.phone_2)
                  const tel = telHref(c.phone_1, c.phone_2)
                  const isLast = index === timelineClients.length - 1
                  const note = (c.next_followup_note ?? '').trim()

                  return (
                    <li
                      key={c.id}
                      className={cn('flex gap-3 pb-5', !isLast && 'border-b border-slate-100')}
                    >
                      <Avatar className={cn('mt-0.5 shrink-0', a.ring)}>
                        <AvatarFallback className={a.fallback}>{initials(c.full_name)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900">{c.full_name}</p>
                            <div className="mt-0.5">
                              <TimelineSubtitle client={c} />
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            {wa ? (
                              <a
                                href={wa}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="rounded-full p-2 text-emerald-600 transition-colors hover:bg-emerald-50"
                                title="WhatsApp"
                                aria-label={`WhatsApp — ${c.full_name}`}
                              >
                                <MessageCircle size={18} strokeWidth={2} />
                              </a>
                            ) : null}
                            {tel ? (
                              <a
                                href={tel}
                                className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-[#185FA5]"
                                title="Ligar"
                                aria-label={`Ligar — ${c.full_name}`}
                              >
                                <Phone size={18} />
                              </a>
                            ) : null}
                            <Link
                              to={`/bem-aviv/follow-up/agendar/${c.id}`}
                              className="rounded-full p-2 text-[#185FA5] transition-colors hover:bg-sky-50"
                              title="Agendar / editar"
                              aria-label={`Abrir agendamento — ${c.full_name}`}
                            >
                              <CalendarClock size={18} />
                            </Link>
                          </div>
                        </div>
                        {note ? (
                          <p className="mt-2 line-clamp-2 rounded-lg border border-slate-100 bg-slate-50/90 px-2.5 py-2 text-xs leading-snug text-slate-600">
                            {note}
                          </p>
                        ) : null}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
