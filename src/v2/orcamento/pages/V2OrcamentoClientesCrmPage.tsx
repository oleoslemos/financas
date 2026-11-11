import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Users,
  Search,
  Phone,
  MessageCircle,
  Clock,
  UserPlus,
  Cake,
  X,
  Calculator,
  UserCheck,
  Check,
  RefreshCw,
} from 'lucide-react'
import {
  fetchClients,
  createClient,
  BemAvivClient,
} from '../../services/v2ClientesService'
import {
  fetchContatos,
  criarContato,
  fetchAgendaItems,
  concluirAgendaItem,
  CrmContato,
  CrmAgendaItem,
  CrmTipoContato,
  CrmDirecao,
} from '../../services/v2CrmService'
import { getCurrentV2User } from '../../services/v2AuthService'
import { V2ClientDrawer } from '../../components/V2ClientDrawer'

function daysSinceLastContact(iso?: string | null): number | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  const diffMs = Date.now() - d.getTime()
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
}

export function V2OrcamentoClientesCrmPage() {
  const navigate = useNavigate()
  const user = getCurrentV2User()
  const userId = user?.id || ''

  const [activeTab, setActiveTab] = useState<'clientes' | 'crm'>('clientes')
  const [loading, setLoading] = useState(true)

  // Data states
  const [clients, setClients] = useState<BemAvivClient[]>([])
  const [contatos, setContatos] = useState<CrmContato[]>([])
  const [agendaItems, setAgendaItems] = useState<CrmAgendaItem[]>([])

  // Clientes Tab State
  const [clientSearch, setClientSearch] = useState('')
  const [clientFilter, setClientFilter] = useState<'todos' | 'sem_contato' | 'aniversariantes'>('todos')
  const [drawerClient, setDrawerClient] = useState<BemAvivClient | null>(null)

  // Quick Client Creation Modal
  const [isQuickClientOpen, setIsQuickClientOpen] = useState(false)
  const [quickName, setQuickName] = useState('')
  const [quickPhone, setQuickPhone] = useState('')
  const [quickBirthDate, setQuickBirthDate] = useState('')
  const [quickRef, setQuickRef] = useState('')
  const [quickError, setQuickError] = useState<string | null>(null)

  // Quick Contact Modal (Bottom Sheet)
  const [isContactModalOpen, setIsContactModalOpen] = useState(false)
  const [targetClient, setTargetClient] = useState<BemAvivClient | null>(null)
  const [contactTipo, setContactTipo] = useState<CrmTipoContato>('whatsapp')
  const [contactDirecao] = useState<CrmDirecao>('realizado')
  const [contactAssunto, setContactAssunto] = useState('')
  const [contactResultado, setContactResultado] = useState('')
  const [nextContactShortcut, setNextContactShortcut] = useState<'amanha' | '3dias' | '1semana' | 'outro' | null>('3dias')
  const [customNextDate, setCustomNextDate] = useState('')
  const [savingContact, setSavingContact] = useState(false)

  // Load all initial data
  const loadAll = async () => {
    setLoading(true)
    try {
      const hoje = new Date().toISOString().split('T')[0]
      const inicioMes = `${hoje.slice(0, 7)}-01T00:00:00Z`
      const fimMes = `${hoje.slice(0, 7)}-31T23:59:59Z`

      const [cRes, ctList, agList] = await Promise.all([
        fetchClients(null),
        fetchContatos().catch(() => []),
        fetchAgendaItems(inicioMes, fimMes).catch(() => []),
      ])

      setClients(cRes.data || [])
      setContatos(ctList)
      setAgendaItems(agList)
    } catch (e) {
      console.error('Erro ao carregar dados:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAll()
  }, [])

  // Birthday helper
  const isBirthdayUpcoming = (birthDateStr?: string | null) => {
    if (!birthDateStr) return false
    const [, m, d] = birthDateStr.split('-')
    if (!m || !d) return false

    const today = new Date()
    const birthMonth = parseInt(m, 10) - 1
    const birthDay = parseInt(d, 10)

    const thisYearBirth = new Date(today.getFullYear(), birthMonth, birthDay)
    const diffDays = Math.ceil((thisYearBirth.getTime() - today.getTime()) / (1000 * 3600 * 24))
    return diffDays >= 0 && diffDays <= 7
  }

  // Clientes Filtering
  const filteredClients = useMemo(() => {
    let result = clients

    if (clientFilter === 'sem_contato') {
      result = result.filter((c) => {
        const d = daysSinceLastContact(c.last_contact_at)
        return d == null || d >= 30
      })
    } else if (clientFilter === 'aniversariantes') {
      result = result.filter((c) => isBirthdayUpcoming(c.birth_date))
    }

    if (!clientSearch.trim()) return result
    const q = clientSearch.toLowerCase()

    return result.filter(
      (c) =>
        c.full_name.toLowerCase().includes(q) ||
        (c.cpf && c.cpf.includes(q)) ||
        (c.phone_1 && c.phone_1.includes(q)) ||
        (c.phone_2 && c.phone_2.includes(q)) ||
        (c.address_city && c.address_city.toLowerCase().includes(q))
    )
  }, [clients, clientFilter, clientSearch])

  // Quick Client Save
  const handleQuickClientSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setQuickError(null)

    if (!quickName.trim()) {
      setQuickError('Nome do cliente é obrigatório.')
      return
    }
    if (!quickPhone.trim()) {
      setQuickError('Telefone é obrigatório.')
      return
    }
    if (!quickBirthDate) {
      setQuickError('Data de nascimento é obrigatória.')
      return
    }

    try {
      const res = await createClient({
        full_name: quickName.trim(),
        phone_1: quickPhone.trim(),
        birth_date: quickBirthDate,
        group_reference: quickRef.trim() || null,
        cpf: '',
        phone_2: null,
        email: null,
        cep: null,
        address_street: null,
        address_number: null,
        address_complement: null,
        address_district: null,
        address_city: null,
        address_state: null,
        commercial_stage: 'CONTATO',
        eko7_presentation_at: null,
        company_id: null,
        next_followup_at: null,
        next_followup_note: null,
        next_followup_status: null,
        last_contact_at: null,
      })

      if (res.data) {
        setClients((prev) => [res.data!, ...prev])
        setIsQuickClientOpen(false)
        setQuickName('')
        setQuickPhone('')
        setQuickBirthDate('')
        setQuickRef('')
      } else {
        setQuickError(res.error || 'Erro ao cadastrar cliente.')
      }
    } catch {
      setQuickError('Erro ao cadastrar cliente.')
    }
  }

  // Quick Contact Save
  const handleSaveContact = async () => {
    if (!targetClient) return
    if (!contactAssunto.trim()) {
      alert('Informe o assunto do contato.')
      return
    }

    setSavingContact(true)

    // Calculate next contact date
    let proximoContatoEm: string | null = null
    const hoje = new Date()
    if (nextContactShortcut === 'amanha') {
      hoje.setDate(hoje.getDate() + 1)
      proximoContatoEm = hoje.toISOString()
    } else if (nextContactShortcut === '3dias') {
      hoje.setDate(hoje.getDate() + 3)
      proximoContatoEm = hoje.toISOString()
    } else if (nextContactShortcut === '1semana') {
      hoje.setDate(hoje.getDate() + 7)
      proximoContatoEm = hoje.toISOString()
    } else if (nextContactShortcut === 'outro' && customNextDate) {
      proximoContatoEm = new Date(customNextDate + 'T09:00:00').toISOString()
    }

    try {
      const created = await criarContato(
        {
          cliente_id: targetClient.id,
          tipo: contactTipo,
          direcao: contactDirecao,
          assunto: contactAssunto.trim(),
          resultado: contactResultado.trim() || null,
          ocorrido_em: new Date().toISOString(),
          proximo_contato_em: proximoContatoEm,
        },
        userId
      )

      setContatos((prev) => [created, ...prev])
      setIsContactModalOpen(false)
      setTargetClient(null)
      setContactAssunto('')
      setContactResultado('')
    } catch (e: any) {
      alert(e?.message || 'Erro ao registrar contato.')
    } finally {
      setSavingContact(false)
    }
  }

  const handleConcluirAgenda = async (itemId: string) => {
    try {
      await concluirAgendaItem(itemId)
      setAgendaItems((prev) =>
        prev.map((it) => (it.id === itemId ? { ...it, concluido_em: new Date().toISOString() } : it))
      )
    } catch (e: any) {
      alert(e?.message || 'Erro ao concluir item de agenda.')
    }
  }

  // WhatsApp Link Helper
  const getWhatsAppLink = (phone?: string | null) => {
    if (!phone) return null
    const clean = phone.replace(/\D/g, '')
    if (clean.length < 10) return null
    return `https://wa.me/55${clean}`
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      
      {/* ── CONTROLE SEGMENTADO DE ABAS (CLIENTES E CRM) ── */}
      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex rounded-2xl p-1 bg-white border border-slate-200 shadow-2xs text-xs font-bold w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setActiveTab('clientes')}
            className={`flex-1 sm:flex-initial px-5 py-2.5 rounded-xl flex items-center justify-center gap-2 transition ${
              activeTab === 'clientes'
                ? 'bg-[#0D6BAF] text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Clientes ({clients.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('crm')}
            className={`flex-1 sm:flex-initial px-5 py-2.5 rounded-xl flex items-center justify-center gap-2 transition ${
              activeTab === 'crm'
                ? 'bg-[#0D6BAF] text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            <span>CRM & Follow-up</span>
          </button>
        </div>

        {activeTab === 'clientes' && (
          <button
            type="button"
            onClick={() => setIsQuickClientOpen(true)}
            className="min-h-[44px] px-4 rounded-xl bg-[#0D6BAF] text-white font-bold text-xs flex items-center gap-1.5 hover:bg-[#0b5a93] transition shadow-xs shrink-0"
          >
            <UserPlus className="w-4 h-4" />
            <span>+ Cliente Rápido</span>
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
          <RefreshCw className="w-6 h-6 animate-spin text-[#0D6BAF]" />
          <span className="text-sm font-semibold">Carregando dados...</span>
        </div>
      ) : activeTab === 'clientes' ? (
        
        /* ═════════════════════════════════════════════════════════════════════
           ABA 1: CLIENTES
        ═════════════════════════════════════════════════════════════════════ */
        <div className="space-y-3">
          
          {/* Busca Fixa no Topo */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por nome, telefone, CPF ou cidade..."
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-3 rounded-2xl border border-slate-200 bg-white text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0D6BAF]/20 focus:border-[#0D6BAF] shadow-2xs"
            />
          </div>

          {/* Chips de Filtro */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs font-bold select-none">
            <button
              type="button"
              onClick={() => setClientFilter('todos')}
              className={`px-3 py-1.5 rounded-xl border transition shrink-0 ${
                clientFilter === 'todos'
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              Todos ({clients.length})
            </button>
            <button
              type="button"
              onClick={() => setClientFilter('sem_contato')}
              className={`px-3 py-1.5 rounded-xl border transition shrink-0 ${
                clientFilter === 'sem_contato'
                  ? 'bg-amber-600 text-white border-amber-600'
                  : 'bg-white text-amber-800 border-amber-200 hover:bg-amber-50'
              }`}
            >
              Sem contato há +30 dias
            </button>
            <button
              type="button"
              onClick={() => setClientFilter('aniversariantes')}
              className={`px-3 py-1.5 rounded-xl border transition shrink-0 ${
                clientFilter === 'aniversariantes'
                  ? 'bg-rose-600 text-white border-rose-600'
                  : 'bg-white text-rose-700 border-rose-200 hover:bg-rose-50'
              }`}
            >
              Aniversariantes
            </button>
          </div>

          {/* Lista de Cartões de Clientes */}
          {filteredClients.length === 0 ? (
            <div className="bg-white rounded-3xl p-8 text-center border border-slate-200 text-slate-400 text-sm">
              Nenhum cliente encontrado com os filtros selecionados.
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredClients.map((client) => {
                const days = daysSinceLastContact(client.last_contact_at)
                const isBirthday = isBirthdayUpcoming(client.birth_date)
                const waLink = getWhatsAppLink(client.phone_1)

                return (
                  <div
                    key={client.id}
                    className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs space-y-3 hover:border-slate-300 transition"
                  >
                    {/* Linha Superior: Nome & Badges */}
                    <div className="flex items-start justify-between gap-2">
                      <div
                        onClick={() => setDrawerClient(client)}
                        className="cursor-pointer group flex-1 min-w-0"
                      >
                        <div className="font-bold text-slate-900 text-sm sm:text-base group-hover:text-[#0D6BAF] transition truncate">
                          {client.full_name}
                        </div>
                        <div className="text-xs text-slate-400 font-medium truncate">
                          {client.address_city || 'Cidade não informada'} {client.group_reference ? `• Ref: ${client.group_reference}` : ''}
                        </div>
                      </div>

                      {/* Selos de Status / Contato */}
                      <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                        {isBirthday && (
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black bg-rose-50 text-rose-700 border border-rose-200">
                            <Cake className="w-3 h-3" /> Aniversário
                          </span>
                        )}
                        {days != null ? (
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              days >= 30
                                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {days} dias sem contato
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-500">
                            Sem histórico
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Linha Inferior: 4 Ações Rápidas (>= 48px) */}
                    <div className="grid grid-cols-4 gap-2 pt-2 border-t border-slate-100">
                      {/* 1. Ligar */}
                      {client.phone_1 ? (
                        <a
                          href={`tel:${client.phone_1.replace(/\D/g, '')}`}
                          className="min-h-[44px] rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 flex items-center justify-center gap-1.5 text-xs font-bold border border-slate-200 transition active:bg-slate-200"
                          title="Ligar para o cliente"
                        >
                          <Phone className="w-3.5 h-3.5 text-slate-500" />
                          <span className="hidden sm:inline">Ligar</span>
                        </a>
                      ) : (
                        <button disabled className="min-h-[44px] rounded-xl bg-slate-50 text-slate-300 flex items-center justify-center text-xs font-bold border border-slate-100 cursor-not-allowed">
                          <Phone className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {/* 2. WhatsApp */}
                      {waLink ? (
                        <a
                          href={waLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-h-[44px] rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 flex items-center justify-center gap-1.5 text-xs font-bold border border-emerald-200 transition active:scale-98"
                          title="Conversar no WhatsApp"
                        >
                          <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="hidden sm:inline">WhatsApp</span>
                        </a>
                      ) : (
                        <button disabled className="min-h-[44px] rounded-xl bg-slate-50 text-slate-300 flex items-center justify-center text-xs font-bold border border-slate-100 cursor-not-allowed">
                          <MessageCircle className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {/* 3. Registrar Contato */}
                      <button
                        type="button"
                        onClick={() => {
                          setTargetClient(client)
                          setIsContactModalOpen(true)
                        }}
                        className="min-h-[44px] rounded-xl bg-sky-50 hover:bg-sky-100 text-[#0D6BAF] flex items-center justify-center gap-1.5 text-xs font-bold border border-sky-200 transition active:scale-98"
                        title="Registrar novo contato"
                      >
                        <UserCheck className="w-3.5 h-3.5 text-[#0D6BAF]" />
                        <span className="hidden sm:inline">Contato</span>
                      </button>

                      {/* 4. Novo Orçamento */}
                      <button
                        type="button"
                        onClick={() => navigate(`/v2/orcamento/propostas/nova?clienteId=${client.id}`)}
                        className="min-h-[44px] rounded-xl bg-[#0D6BAF] hover:bg-[#0b5a93] text-white flex items-center justify-center gap-1.5 text-xs font-bold transition shadow-xs active:scale-98"
                        title="Criar proposta para este cliente"
                      >
                        <Calculator className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Orçamento</span>
                      </button>
                    </div>

                  </div>
                )
              })}
            </div>
          )}

        </div>

      ) : (

        /* ═════════════════════════════════════════════════════════════════════
           ABA 2: CRM & FOLLOW-UP
        ═════════════════════════════════════════════════════════════════════ */
        <div className="space-y-4">
          
          {/* SEÇÃO 1: HOJE */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-2xs space-y-3">
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-600" />
              Prioridades de Hoje
            </h2>

            {/* Itens de Agenda do dia */}
            {agendaItems.filter((it) => !it.concluido_em).length === 0 ? (
              <div className="py-4 text-center text-slate-400 text-xs font-medium">
                Nenhuma tarefa pendente para hoje. Bom trabalho!
              </div>
            ) : (
              <div className="space-y-2">
                {agendaItems
                  .filter((it) => !it.concluido_em)
                  .map((item) => (
                    <div
                      key={item.id}
                      className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-slate-900">{item.titulo}</div>
                        {item.cliente_nome && (
                          <div className="text-[11px] text-slate-500 font-medium">
                            Cliente: {item.cliente_nome}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleConcluirAgenda(item.id)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white border border-emerald-200 text-xs font-bold transition flex items-center gap-1 shrink-0"
                      >
                        <Check className="w-3.5 h-3.5" /> Concluir
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* SEÇÃO 2: HISTÓRICO RECENTE DE CONTATOS */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-[#0D6BAF]" />
                Últimos Contatos Realizados
              </h2>
              <span className="text-xs text-slate-400 font-bold">{contatos.length} registros</span>
            </div>

            {contatos.length === 0 ? (
              <div className="py-6 text-center text-slate-400 text-xs font-medium">
                Nenhum contato registrado recentemente.
              </div>
            ) : (
              <div className="space-y-2.5 divide-y divide-slate-100">
                {contatos.slice(0, 20).map((ct) => {
                  const dataFormatada = new Date(ct.ocorrido_em).toLocaleString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })

                  return (
                    <div key={ct.id} className="pt-2.5 space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-900">{ct.cliente_nome || 'Cliente'}</span>
                        <span className="text-[10px] text-slate-400 tabular-nums">{dataFormatada}</span>
                      </div>
                      <div className="text-xs text-slate-700 font-medium">
                        <span className="font-bold text-[#0D6BAF] uppercase text-[10px] mr-1.5">
                          [{ct.tipo}]
                        </span>
                        {ct.assunto}
                      </div>
                      {ct.resultado && (
                        <div className="text-[11px] text-slate-500 italic">
                          Resultado: {ct.resultado}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

        </div>

      )}

      {/* ── DRAWER DE DETALHES DO CLIENTE ── */}
      {drawerClient && (
        <V2ClientDrawer
          open={Boolean(drawerClient)}
          client={drawerClient}
          companyId={null}
          onClose={() => setDrawerClient(null)}
          onSaved={() => void loadAll()}
        />
      )}

      {/* ── MODAL DE NOVO CLIENTE RÁPIDO ── */}
      {isQuickClientOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-5 sm:p-6 max-w-md w-full border border-slate-200 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="font-black text-slate-900 text-base">Novo Cliente Rápido</h3>
              <button
                type="button"
                onClick={() => setIsQuickClientOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {quickError && (
              <div className="p-3 rounded-xl bg-red-50 text-red-700 text-xs font-bold">
                {quickError}
              </div>
            )}

            <form onSubmit={handleQuickClientSubmit} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Nome Completo *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Nome do cliente"
                  value={quickName}
                  onChange={(e) => setQuickName(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#0D6BAF]"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Telefone celular (WhatsApp) *
                </label>
                <input
                  type="tel"
                  required
                  placeholder="(49) 99999-9999"
                  value={quickPhone}
                  onChange={(e) => setQuickPhone(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#0D6BAF]"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Data de Nascimento *
                </label>
                <input
                  type="date"
                  required
                  value={quickBirthDate}
                  onChange={(e) => setQuickBirthDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#0D6BAF]"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Referência / Indicação (opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ex.: Vizinho do Sr. Paulo..."
                  value={quickRef}
                  onChange={(e) => setQuickRef(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#0D6BAF]"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsQuickClientOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-[#0D6BAF] text-white font-black text-xs hover:bg-[#0b5a93]"
                >
                  Cadastrar Cliente
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── BOTTOM SHEET / MODAL DE REGISTRAR CONTATO ── */}
      {isContactModalOpen && targetClient && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-2xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 max-w-lg w-full border border-slate-200 shadow-2xl space-y-4 animate-in slide-in-from-bottom sm:zoom-in-95">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div>
                <h3 className="font-black text-slate-900 text-base">Registrar Contato</h3>
                <p className="text-xs text-slate-400 font-medium">{targetClient.full_name}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsContactModalOpen(false)
                  setTargetClient(null)
                }}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              
              {/* Tipo de Contato */}
              <div>
                <label className="font-bold text-slate-700 block mb-1">Tipo de interação</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['whatsapp', 'ligacao', 'visita', 'reuniao', 'email', 'outro'] as CrmTipoContato[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setContactTipo(t)}
                      className={`py-2 rounded-xl border text-xs font-bold capitalize transition ${
                        contactTipo === t
                          ? 'bg-[#0D6BAF] text-white border-[#0D6BAF]'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Assunto */}
              <div>
                <label className="font-bold text-slate-700 block mb-1">Assunto / Motivo *</label>
                <input
                  type="text"
                  placeholder="Ex.: Apresentação da linha Ouro Health, envio de proposta..."
                  value={contactAssunto}
                  onChange={(e) => setContactAssunto(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#0D6BAF]"
                />
              </div>

              {/* Resultado */}
              <div>
                <label className="font-bold text-slate-700 block mb-1">Resultado / Parecer do cliente</label>
                <textarea
                  rows={2}
                  placeholder="Ex.: Gostou da proposta, vai conversar com a esposa à noite..."
                  value={contactResultado}
                  onChange={(e) => setContactResultado(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-[#0D6BAF] resize-none"
                />
              </div>

              {/* Próximo Contato (Atalhos) */}
              <div>
                <label className="font-bold text-slate-700 block mb-1">Agendar retorno em:</label>
                <div className="grid grid-cols-4 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setNextContactShortcut('amanha')}
                    className={`py-2 rounded-xl border font-bold text-xs transition ${
                      nextContactShortcut === 'amanha'
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-200'
                    }`}
                  >
                    Amanhã
                  </button>
                  <button
                    type="button"
                    onClick={() => setNextContactShortcut('3dias')}
                    className={`py-2 rounded-xl border font-bold text-xs transition ${
                      nextContactShortcut === '3dias'
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-200'
                    }`}
                  >
                    3 dias
                  </button>
                  <button
                    type="button"
                    onClick={() => setNextContactShortcut('1semana')}
                    className={`py-2 rounded-xl border font-bold text-xs transition ${
                      nextContactShortcut === '1semana'
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-200'
                    }`}
                  >
                    1 semana
                  </button>
                  <button
                    type="button"
                    onClick={() => setNextContactShortcut('outro')}
                    className={`py-2 rounded-xl border font-bold text-xs transition ${
                      nextContactShortcut === 'outro'
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-200'
                    }`}
                  >
                    Data
                  </button>
                </div>

                {nextContactShortcut === 'outro' && (
                  <input
                    type="date"
                    value={customNextDate}
                    onChange={(e) => setCustomNextDate(e.target.value)}
                    className="w-full mt-2 px-3 py-2 rounded-xl border border-slate-200 font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#0D6BAF]"
                  />
                )}
              </div>

            </div>

            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsContactModalOpen(false)
                  setTargetClient(null)
                }}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={savingContact || !contactAssunto.trim()}
                onClick={handleSaveContact}
                className="px-5 py-2.5 rounded-xl bg-[#0D6BAF] text-white font-black text-xs hover:bg-[#0b5a93] disabled:opacity-50"
              >
                {savingContact ? 'Gravando...' : 'Salvar Contato'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
