import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Phone,
  MessageCircle,
  Mail,
  MapPin,
  Users,
  Calendar,
  Plus,
  X,
  Search,
  Clock,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  ChevronRight,
} from 'lucide-react'
import {
  fetchContatos,
  fetchContatosByCliente,
  criarContato,
  cancelarContato,
  fetchAgendaItems,
  criarAgendaItem,
  concluirAgendaItem,
  fetchClientesParaSelect,
  formatarWaMe,
  CrmContato,
  CrmContatoInput,
  CrmAgendaItem,
  CrmAgendaItemInput,
  ClienteResumido,
  CrmTipoContato,
  CrmDirecao,
  CrmTipoAgenda,
} from '../services/v2CrmService'
import { getCurrentV2User } from '../services/v2AuthService'

// ─────────────────────────────────────────────────────────────────────────────
// Constants / configs
// ─────────────────────────────────────────────────────────────────────────────

const TIPO_CONFIG: Record<
  CrmTipoContato,
  { label: string; color: string; bg: string; icon: React.ReactNode }
> = {
  ligacao: {
    label: 'Ligação',
    color: '#0D6BAF',
    bg: '#EFF6FF',
    icon: <Phone size={11} />,
  },
  whatsapp: {
    label: 'WhatsApp',
    color: '#16A34A',
    bg: '#F0FDF4',
    icon: <MessageCircle size={11} />,
  },
  email: {
    label: 'E-mail',
    color: '#EA580C',
    bg: '#FFF7ED',
    icon: <Mail size={11} />,
  },
  visita: {
    label: 'Visita',
    color: '#7C3AED',
    bg: '#F5F3FF',
    icon: <MapPin size={11} />,
  },
  reuniao: {
    label: 'Reunião',
    color: '#DB2777',
    bg: '#FDF2F8',
    icon: <Users size={11} />,
  },
  outro: {
    label: 'Outro',
    color: '#6B7280',
    bg: '#F3F4F6',
    icon: <Clock size={11} />,
  },
}

const TIPO_OPTIONS: { value: CrmTipoContato; label: string }[] = [
  { value: 'ligacao', label: 'Ligação' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email', label: 'E-mail' },
  { value: 'visita', label: 'Visita' },
  { value: 'reuniao', label: 'Reunião' },
  { value: 'outro', label: 'Outro' },
]

const DIRECAO_OPTIONS: { value: CrmDirecao; label: string }[] = [
  { value: 'realizado', label: 'Realizado' },
  { value: 'recebido', label: 'Recebido' },
]

const fmtDt = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(iso),
  )

const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(iso))

const toDatetimeLocal = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function TipoBadge({ tipo }: { tipo: CrmTipoContato }) {
  const cfg = TIPO_CONFIG[tipo]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 700,
        color: cfg.color,
        background: cfg.bg,
        border: `1px solid ${cfg.color}33`,
        whiteSpace: 'nowrap',
      }}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  )
}

function DirecaoBadge({ direcao }: { direcao: CrmDirecao }) {
  if (direcao === 'realizado') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 3,
          fontSize: 11,
          fontWeight: 700,
          color: '#16A34A',
        }}
        title="Realizado"
      >
        <ArrowRight size={12} />
        Realizado
      </span>
    )
  }
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        fontSize: 11,
        fontWeight: 700,
        color: '#0D6BAF',
      }}
      title="Recebido"
    >
      <ArrowLeft size={12} />
      Recebido
    </span>
  )
}

function ClienteAvatar({ nome }: { nome: string }) {
  const inicial = (nome || '?').charAt(0).toUpperCase()
  return (
    <div
      style={{
        width: 38,
        height: 38,
        borderRadius: 12,
        background: '#0D6BAF',
        color: '#fff',
        fontWeight: 900,
        fontSize: 15,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {inicial}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal: Novo Contato
// ─────────────────────────────────────────────────────────────────────────────

interface ModalContatoProps {
  clientes: ClienteResumido[]
  onClose: () => void
  onSalvo: (contato: CrmContato) => void
}

function ModalNovoContato({ clientes, onClose, onSalvo }: ModalContatoProps) {
  const user = getCurrentV2User()

  const [clienteId, setClienteId] = useState('')
  const [clienteBusca, setClienteBusca] = useState('')
  const [tipo, setTipo] = useState<CrmTipoContato>('ligacao')
  const [direcao, setDirecao] = useState<CrmDirecao>('realizado')
  const [assunto, setAssunto] = useState('')
  const [descricao, setDescricao] = useState('')
  const [ocorrido, setOcorrido] = useState(toDatetimeLocal(new Date()))
  const [resultado, setResultado] = useState('')
  const [proximoContato, setProximoContato] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const clientesFiltrados = useMemo(
    () =>
      clientes.filter((c) =>
        c.full_name.toLowerCase().includes(clienteBusca.toLowerCase()),
      ),
    [clientes, clienteBusca],
  )

  const clienteSelecionado = clientes.find((c) => c.id === clienteId)

  async function handleSalvar() {
    if (!clienteId) { setErro('Selecione um cliente.'); return }
    if (!assunto.trim()) { setErro('Informe o assunto.'); return }

    setSalvando(true)
    setErro(null)

    try {
      const input: CrmContatoInput = {
        cliente_id: clienteId,
        tipo,
        direcao,
        assunto,
        descricao: descricao || null,
        resultado: resultado || null,
        ocorrido_em: new Date(ocorrido).toISOString(),
        proximo_contato_em: proximoContato ? new Date(proximoContato).toISOString() : null,
      }
      const contato = await criarContato(input, user?.id ?? '')
      onSalvo(contato)
    } catch (e: unknown) {
      setErro(typeof e === 'string' ? e : 'Erro ao salvar contato.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 18,
          width: '100%',
          maxWidth: 520,
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '20px 24px 16px',
            borderBottom: '1px solid #F3F4F6',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 11,
                background: '#EFF6FF',
                border: '1.5px solid #BFDBFE',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <MessageCircle size={18} color="#0D6BAF" />
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 900, color: '#111827' }}>
                Novo Contato
              </p>
              <p style={{ margin: 0, fontSize: 12, color: '#9CA3AF' }}>
                Registre uma interação com o cliente
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: '1px solid #E5E7EB',
              borderRadius: 8,
              padding: 6,
              cursor: 'pointer',
              color: '#6B7280',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Cliente combobox */}
          <div>
            <label style={labelStyle}>Cliente *</label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="Buscar cliente por nome…"
                value={clienteSelecionado ? clienteSelecionado.full_name : clienteBusca}
                onFocus={() => { setDropdownOpen(true); if (clienteSelecionado) setClienteBusca('') }}
                onChange={(e) => {
                  setClienteBusca(e.target.value)
                  setClienteId('')
                  setDropdownOpen(true)
                }}
                style={inputStyle}
              />
              {dropdownOpen && clienteBusca && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    background: '#fff',
                    border: '1.5px solid #E5E7EB',
                    borderRadius: 10,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                    zIndex: 300,
                    maxHeight: 200,
                    overflowY: 'auto',
                  }}
                >
                  {clientesFiltrados.length === 0 ? (
                    <p style={{ padding: '10px 14px', margin: 0, color: '#9CA3AF', fontSize: 13 }}>
                      Nenhum cliente encontrado
                    </p>
                  ) : (
                    clientesFiltrados.slice(0, 30).map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setClienteId(c.id)
                          setClienteBusca('')
                          setDropdownOpen(false)
                        }}
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          padding: '8px 14px',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: 13,
                          color: '#111827',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#F0F7EE')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                      >
                        {c.full_name}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Tipo + Direção */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Tipo *</label>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as CrmTipoContato)}
                style={selectStyle}
              >
                {TIPO_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Direção *</label>
              <select
                value={direcao}
                onChange={(e) => setDirecao(e.target.value as CrmDirecao)}
                style={selectStyle}
              >
                {DIRECAO_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Assunto */}
          <div>
            <label style={labelStyle}>Assunto *</label>
            <input
              type="text"
              placeholder="Ex: Apresentação de produto, Dúvida sobre pedido…"
              value={assunto}
              onChange={(e) => setAssunto(e.target.value)}
              style={inputStyle}
            />
          </div>

          {/* Descrição */}
          <div>
            <label style={labelStyle}>Descrição</label>
            <textarea
              placeholder="Detalhes do contato…"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>

          {/* Data/hora */}
          <div>
            <label style={labelStyle}>Data/hora do contato *</label>
            <input
              type="datetime-local"
              value={ocorrido}
              onChange={(e) => setOcorrido(e.target.value)}
              style={inputStyle}
            />
          </div>

          {/* Resultado */}
          <div>
            <label style={labelStyle}>Resultado</label>
            <textarea
              placeholder="O que ficou acordado? Qual foi o desfecho?"
              value={resultado}
              onChange={(e) => setResultado(e.target.value)}
              rows={2}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>

          {/* Próximo contato */}
          <div>
            <label style={labelStyle}>Próximo contato (opcional)</label>
            <input
              type="datetime-local"
              value={proximoContato}
              onChange={(e) => setProximoContato(e.target.value)}
              style={inputStyle}
            />
            {proximoContato && (
              <p style={{ margin: '4px 0 0', fontSize: 11, color: '#7DC344' }}>
                ✓ Um item de agenda será criado automaticamente.
              </p>
            )}
          </div>

          {/* Erro */}
          {erro && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 10,
                background: '#FEF2F2',
                border: '1px solid #FECACA',
                color: '#DC2626',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {erro}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid #F3F4F6',
            display: 'flex',
            gap: 10,
            justifyContent: 'flex-end',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '9px 18px',
              borderRadius: 10,
              border: '1.5px solid #E5E7EB',
              background: '#fff',
              color: '#374151',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSalvar}
            disabled={salvando}
            style={{
              padding: '9px 22px',
              borderRadius: 10,
              border: 'none',
              background: salvando ? '#93C5FD' : '#0D6BAF',
              color: '#fff',
              fontSize: 14,
              fontWeight: 700,
              cursor: salvando ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {salvando ? 'Salvando…' : 'Salvar Contato'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal: Novo Item de Agenda
// ─────────────────────────────────────────────────────────────────────────────

interface ModalAgendaProps {
  clientes: ClienteResumido[]
  onClose: () => void
  onSalvo: () => void
}

function ModalNovoAgendaItem({ clientes, onClose, onSalvo }: ModalAgendaProps) {
  const user = getCurrentV2User()
  const [tipo, setTipo] = useState<CrmTipoAgenda>('tarefa')
  const [titulo, setTitulo] = useState('')
  const [inicio, setInicio] = useState(toDatetimeLocal(new Date()))
  const [fim, setFim] = useState('')
  const [clienteId, setClienteId] = useState('')
  const [clienteBusca, setClienteBusca] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const clientesFiltrados = useMemo(
    () => clientes.filter((c) => c.full_name.toLowerCase().includes(clienteBusca.toLowerCase())),
    [clientes, clienteBusca],
  )
  const clienteSelecionado = clientes.find((c) => c.id === clienteId)

  async function handleSalvar() {
    if (!titulo.trim()) { setErro('Informe o título.'); return }

    setSalvando(true)
    setErro(null)
    try {
      const input: CrmAgendaItemInput = {
        tipo,
        titulo,
        inicio: new Date(inicio).toISOString(),
        fim: fim ? new Date(fim).toISOString() : null,
        cliente_id: clienteId || null,
      }
      await criarAgendaItem(input, user?.id ?? '')
      onSalvo()
    } catch (e: unknown) {
      setErro(typeof e === 'string' ? e : 'Erro ao salvar item de agenda.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 18,
          width: '100%',
          maxWidth: 460,
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '20px 24px 16px',
            borderBottom: '1px solid #F3F4F6',
          }}
        >
          <p style={{ margin: 0, fontSize: 16, fontWeight: 900, color: '#111827' }}>
            Novo Evento / Tarefa
          </p>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: '1px solid #E5E7EB', borderRadius: 8, padding: 6, cursor: 'pointer', color: '#6B7280' }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={labelStyle}>Tipo *</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value as CrmTipoAgenda)} style={selectStyle}>
              <option value="tarefa">Tarefa</option>
              <option value="evento">Evento</option>
            </select>
          </div>

          <div>
            <label style={labelStyle}>Título *</label>
            <input
              type="text"
              placeholder="Título do evento ou tarefa…"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Início *</label>
              <input type="datetime-local" value={inicio} onChange={(e) => setInicio(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Fim (opcional)</label>
              <input type="datetime-local" value={fim} onChange={(e) => setFim(e.target.value)} style={inputStyle} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>Cliente (opcional)</label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="Buscar cliente…"
                value={clienteSelecionado ? clienteSelecionado.full_name : clienteBusca}
                onFocus={() => { setDropdownOpen(true); if (clienteSelecionado) setClienteBusca('') }}
                onChange={(e) => { setClienteBusca(e.target.value); setClienteId(''); setDropdownOpen(true) }}
                style={inputStyle}
              />
              {dropdownOpen && clienteBusca && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1.5px solid #E5E7EB', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 300, maxHeight: 160, overflowY: 'auto' }}>
                  {clientesFiltrados.slice(0, 20).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => { setClienteId(c.id); setClienteBusca(''); setDropdownOpen(false) }}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#111827' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#F0F7EE')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                    >
                      {c.full_name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {erro && (
            <div style={{ padding: '10px 14px', borderRadius: 10, background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', fontSize: 13, fontWeight: 600 }}>
              {erro}
            </div>
          )}
        </div>

        <div style={{ padding: '16px 24px', borderTop: '1px solid #F3F4F6', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={{ padding: '9px 18px', borderRadius: 10, border: '1.5px solid #E5E7EB', background: '#fff', color: '#374151', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
            Cancelar
          </button>
          <button type="button" onClick={handleSalvar} disabled={salvando} style={{ padding: '9px 22px', borderRadius: 10, border: 'none', background: salvando ? '#93C5FD' : '#0D6BAF', color: '#fff', fontSize: 14, fontWeight: 700, cursor: salvando ? 'not-allowed' : 'pointer' }}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Painel Direito: Detalhes do Contato / Linha do Tempo
// ─────────────────────────────────────────────────────────────────────────────

interface PainelDetalhesProps {
  clienteId: string
  clientes: ClienteResumido[]
  onContatoCancelado: () => void
}

function PainelDetalhes({ clienteId, clientes, onContatoCancelados: onContatoCancelado }: { clienteId: string; clientes: ClienteResumido[]; onContatoCancelados: () => void }) {
  const [contatos, setContatos] = useState<CrmContato[]>([])
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [cancelandoId, setCancelandoId] = useState<string | null>(null)
  const [confirmarCancelId, setConfirmarCancelId] = useState<string | null>(null)

  const cliente = clientes.find((c) => c.id === clienteId)

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    try {
      const data = await fetchContatosByCliente(clienteId)
      setContatos(data)
    } catch (e: unknown) {
      setErro(typeof e === 'string' ? e : 'Erro ao carregar linha do tempo.')
    } finally {
      setCarregando(false)
    }
  }, [clienteId])

  useEffect(() => { carregar() }, [carregar])

  async function handleCancelar(id: string) {
    setCancelandoId(id)
    try {
      await cancelarContato(id)
      setContatos((prev) => prev.map((c) => c.id === id ? { ...c, cancelado_em: new Date().toISOString() } : c))
      setConfirmarCancelId(null)
      onContatoCancelado()
    } catch (e: unknown) {
      setErro(typeof e === 'string' ? e : 'Erro ao cancelar contato.')
    } finally {
      setCancelandoId(null)
    }
  }

  const waLink = formatarWaMe(cliente?.phone_1 ?? null) ?? formatarWaMe(cliente?.phone_2 ?? null)

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Cabeçalho do cliente */}
      <div
        style={{
          padding: '20px 24px',
          borderBottom: '1px solid #E5E7EB',
          background: '#fff',
          borderRadius: '0 0 0 0',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <ClienteAvatar nome={cliente?.full_name ?? '?'} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 900, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {cliente?.full_name ?? 'Cliente'}
            </p>
            {(cliente?.phone_1 || cliente?.phone_2) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
                <span style={{ fontSize: 12, color: '#6B7280' }}>
                  {cliente?.phone_1 || cliente?.phone_2}
                </span>
                {waLink && (
                  <a
                    href={waLink}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '2px 8px',
                      borderRadius: 20,
                      fontSize: 11,
                      fontWeight: 700,
                      color: '#16A34A',
                      background: '#F0FDF4',
                      border: '1px solid #BBF7D0',
                      textDecoration: 'none',
                    }}
                  >
                    <MessageCircle size={11} />
                    WhatsApp
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Linha do tempo */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
        <p style={{ margin: '0 0 16px', fontSize: 12, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Linha do Tempo
        </p>

        {carregando && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#9CA3AF', fontSize: 13 }}>
            <Clock size={24} style={{ marginBottom: 8, opacity: 0.5 }} />
            <p style={{ margin: 0 }}>Carregando…</p>
          </div>
        )}

        {!carregando && erro && (
          <div style={{ padding: '12px 16px', borderRadius: 10, background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', fontSize: 13 }}>
            {erro}
          </div>
        )}

        {!carregando && !erro && contatos.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#9CA3AF' }}>
            <MessageCircle size={32} style={{ marginBottom: 8, opacity: 0.3 }} />
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Nenhum contato registrado</p>
          </div>
        )}

        {!carregando && contatos.map((c, idx) => {
          const cancelado = !!c.cancelado_em
          return (
            <div
              key={c.id}
              style={{
                position: 'relative',
                paddingLeft: 24,
                marginBottom: idx < contatos.length - 1 ? 20 : 0,
                opacity: cancelado ? 0.5 : 1,
              }}
            >
              {/* Linha vertical */}
              {idx < contatos.length - 1 && (
                <div
                  style={{
                    position: 'absolute',
                    left: 7,
                    top: 22,
                    bottom: -20,
                    width: 2,
                    background: '#E5E7EB',
                  }}
                />
              )}
              {/* Ponto */}
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 6,
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  background: cancelado ? '#D1D5DB' : TIPO_CONFIG[c.tipo].color,
                  border: '2px solid #fff',
                  boxShadow: '0 0 0 2px ' + (cancelado ? '#D1D5DB' : TIPO_CONFIG[c.tipo].color + '44'),
                }}
              />

              <div
                style={{
                  background: '#fff',
                  borderRadius: 12,
                  border: '1.5px solid #E5E7EB',
                  padding: '12px 14px',
                }}
              >
                {/* Topo */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                  <TipoBadge tipo={c.tipo} />
                  <DirecaoBadge direcao={c.direcao} />
                  <span style={{ fontSize: 11, color: '#9CA3AF', marginLeft: 'auto' }}>
                    {fmtDt(c.ocorrido_em)}
                  </span>
                </div>

                <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700, color: '#111827' }}>
                  {c.assunto}
                </p>

                {c.descricao && (
                  <p style={{ margin: '0 0 4px', fontSize: 12, color: '#4B5563', lineHeight: 1.5 }}>
                    {c.descricao}
                  </p>
                )}

                {c.resultado && (
                  <p style={{ margin: '4px 0', fontSize: 12, color: '#059669', fontWeight: 600 }}>
                    → {c.resultado}
                  </p>
                )}

                {c.proximo_contato_em && (
                  <p style={{ margin: '4px 0 0', fontSize: 11, color: '#7C3AED', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Calendar size={11} />
                    Próximo: {fmtDt(c.proximo_contato_em)}
                  </p>
                )}

                {cancelado && (
                  <p style={{ margin: '6px 0 0', fontSize: 11, color: '#DC2626', fontWeight: 700 }}>
                    Cancelado em {fmtDt(c.cancelado_em!)}
                  </p>
                )}

                {/* Ação cancelar */}
                {!cancelado && (
                  <div style={{ marginTop: 10, borderTop: '1px solid #F3F4F6', paddingTop: 8 }}>
                    {confirmarCancelId === c.id ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12, color: '#DC2626', fontWeight: 600 }}>
                          Confirmar cancelamento?
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCancelar(c.id)}
                          disabled={cancelandoId === c.id}
                          style={{ padding: '4px 12px', borderRadius: 8, border: 'none', background: '#DC2626', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                        >
                          {cancelandoId === c.id ? 'Aguarde…' : 'Sim, cancelar'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmarCancelId(null)}
                          style={{ padding: '4px 12px', borderRadius: 8, border: '1px solid #E5E7EB', background: '#fff', color: '#374151', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                        >
                          Manter
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmarCancelId(c.id)}
                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12, color: '#DC2626', fontWeight: 600 }}
                      >
                        Cancelar contato
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Aba Agenda
// ─────────────────────────────────────────────────────────────────────────────

function AbaAgenda({ clientes }: { clientes: ClienteResumido[] }) {
  const [items, setItems] = useState<CrmAgendaItem[]>([])
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [mostrarModal, setMostrarModal] = useState(false)
  const [concluidoId, setConcluidoId] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    try {
      const hoje = new Date()
      const em30 = new Date()
      em30.setDate(hoje.getDate() + 30)
      const data = await fetchAgendaItems(hoje.toISOString(), em30.toISOString())
      setItems(data)
    } catch (e: unknown) {
      setErro(typeof e === 'string' ? e : 'Erro ao carregar agenda.')
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  async function handleConcluir(id: string) {
    setConcluidoId(id)
    try {
      await concluirAgendaItem(id)
      setItems((prev) => prev.map((i) => i.id === id ? { ...i, concluido_em: new Date().toISOString() } : i))
    } catch (e: unknown) {
      setErro(typeof e === 'string' ? e : 'Erro ao concluir item.')
    } finally {
      setConcluidoId(null)
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#111827' }}>Agenda — Próximos 30 dias</h2>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: '#9CA3AF' }}>Eventos e tarefas agendados</p>
        </div>
        <button
          type="button"
          onClick={() => setMostrarModal(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 10, border: 'none', background: '#0D6BAF', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
        >
          <Plus size={14} />
          Novo Evento/Tarefa
        </button>
      </div>

      {erro && (
        <div style={{ padding: '12px 16px', borderRadius: 10, background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', fontSize: 13, marginBottom: 16 }}>
          {erro}
        </div>
      )}

      {carregando && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#9CA3AF', fontSize: 13 }}>
          Carregando agenda…
        </div>
      )}

      {!carregando && items.length === 0 && !erro && (
        <div style={{ textAlign: 'center', padding: '60px 0', background: '#fff', borderRadius: 14, border: '1.5px solid #E5E7EB' }}>
          <Calendar size={36} color="#D1D5DB" style={{ marginBottom: 12 }} />
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#374151' }}>Nenhum item nos próximos 30 dias</p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((item) => {
          const concluido = !!item.concluido_em
          return (
            <div
              key={item.id}
              style={{
                background: '#fff',
                borderRadius: 12,
                border: '1.5px solid #E5E7EB',
                padding: '14px 18px',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                opacity: concluido ? 0.6 : 1,
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 11,
                  background: item.tipo === 'evento' ? '#FDF2F8' : '#EFF6FF',
                  border: `1.5px solid ${item.tipo === 'evento' ? '#F9A8D4' : '#BFDBFE'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {item.tipo === 'evento'
                  ? <Calendar size={18} color="#DB2777" />
                  : <CheckCircle2 size={18} color="#0D6BAF" />}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: concluido ? '#9CA3AF' : '#111827', textDecoration: concluido ? 'line-through' : 'none' }}>
                  {item.titulo}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 3, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: '#6B7280' }}>
                    {fmtDt(item.inicio)}
                  </span>
                  {item.cliente_nome && (
                    <span style={{ fontSize: 12, color: '#0D6BAF', fontWeight: 600 }}>
                      · {item.cliente_nome}
                    </span>
                  )}
                  {/* badge origem */}
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: 20,
                      fontSize: 10,
                      fontWeight: 700,
                      color: item.origem === 'google' ? '#EA580C' : '#6B7280',
                      background: item.origem === 'google' ? '#FFF7ED' : '#F3F4F6',
                      border: `1px solid ${item.origem === 'google' ? '#FED7AA' : '#E5E7EB'}`,
                    }}
                  >
                    {item.origem === 'google' ? 'Google' : 'Sistema'}
                  </span>
                </div>
              </div>

              {!concluido && (
                <button
                  type="button"
                  onClick={() => handleConcluir(item.id)}
                  disabled={concluidoId === item.id}
                  title="Marcar como concluído"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '6px 12px',
                    borderRadius: 8,
                    border: '1.5px solid #7DC344',
                    background: 'none',
                    color: '#7DC344',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: concluidoId === item.id ? 'not-allowed' : 'pointer',
                    flexShrink: 0,
                  }}
                >
                  <CheckCircle2 size={13} />
                  {concluidoId === item.id ? '…' : 'Concluir'}
                </button>
              )}

              {concluido && (
                <span style={{ fontSize: 11, color: '#7DC344', fontWeight: 700, flexShrink: 0 }}>
                  ✓ Concluído
                </span>
              )}
            </div>
          )
        })}
      </div>

      {mostrarModal && (
        <ModalNovoAgendaItem
          clientes={clientes}
          onClose={() => setMostrarModal(false)}
          onSalvo={() => { setMostrarModal(false); carregar() }}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared input styles
// ─────────────────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  borderRadius: 10,
  border: '1.5px solid #E5E7EB',
  fontSize: 13,
  outline: 'none',
  background: '#fff',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
}

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 700,
  color: '#374151',
  marginBottom: 5,
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

type Tab = 'contatos' | 'agenda'
type MobileView = 'lista' | 'detalhe'

export function V2CrmPage() {
  // Data
  const [contatos, setContatos] = useState<CrmContato[]>([])
  const [clientes, setClientes] = useState<ClienteResumido[]>([])
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // UI state
  const [tab, setTab] = useState<Tab>('contatos')
  const [busca, setBusca] = useState('')
  const [clienteSelecionadoId, setClienteSelecionadoId] = useState<string | null>(null)
  const [mostrarModal, setMostrarModal] = useState(false)
  const [mobileView, setMobileView] = useState<MobileView>('lista')

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    try {
      const [contatosData, clientesData] = await Promise.all([
        fetchContatos({ somente_ativos: true }),
        fetchClientesParaSelect(),
      ])
      setContatos(contatosData)
      setClientes(clientesData)
    } catch (e: unknown) {
      setErro(typeof e === 'string' ? e : 'Erro ao carregar dados.')
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const contatosFiltrados = useMemo(() => {
    if (!busca) return contatos
    const q = busca.toLowerCase()
    return contatos.filter(
      (c) =>
        c.cliente_nome?.toLowerCase().includes(q) ||
        c.assunto.toLowerCase().includes(q),
    )
  }, [contatos, busca])

  function handleContatoSalvo(novoContato: CrmContato) {
    setContatos((prev) => [novoContato, ...prev])
    setMostrarModal(false)
    setClienteSelecionadoId(novoContato.cliente_id)
    setMobileView('detalhe')
  }

  function handleSelecionarContato(contato: CrmContato) {
    setClienteSelecionadoId(contato.cliente_id)
    setMobileView('detalhe')
  }

  function handleContatoCancelado() {
    // Recarrega a lista principal sem fechar o painel de detalhe
    carregar()
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#F0F7EE' }}>
      {/* ── Page Header ── */}
      <div
        style={{
          background: '#fff',
          borderBottom: '1px solid #E5E7EB',
          padding: '16px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              background: '#EFF6FF',
              border: '1.5px solid #BFDBFE',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Users size={22} color="#0D6BAF" />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: '#111827' }}>CRM</h1>
            <p style={{ margin: 0, fontSize: 13, color: '#6B7280', marginTop: 2 }}>
              {contatos.length} contato{contatos.length !== 1 ? 's' : ''} registrado{contatos.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, background: '#F0F7EE', borderRadius: 12, padding: 4 }}>
          {([['contatos', 'Contatos'], ['agenda', 'Agenda']] as [Tab, string][]).map(([t, label]) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              style={{
                padding: '6px 18px',
                borderRadius: 8,
                border: 'none',
                background: tab === t ? '#0D6BAF' : 'transparent',
                color: tab === t ? '#fff' : '#6B7280',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      {tab === 'agenda' ? (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <AbaAgenda clientes={clientes} />
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* ── Mobile tabs ── */}
          <div
            className="sm:hidden"
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 50,
              background: '#fff',
              borderTop: '1px solid #E5E7EB',
              display: 'flex',
            }}
          >
            {(['lista', 'detalhe'] as MobileView[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setMobileView(v)}
                disabled={v === 'detalhe' && !clienteSelecionadoId}
                style={{
                  flex: 1,
                  padding: '10px 0',
                  border: 'none',
                  background: mobileView === v ? '#EFF6FF' : '#fff',
                  color: mobileView === v ? '#0D6BAF' : '#6B7280',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: v === 'detalhe' && !clienteSelecionadoId ? 'not-allowed' : 'pointer',
                  opacity: v === 'detalhe' && !clienteSelecionadoId ? 0.4 : 1,
                }}
              >
                {v === 'lista' ? 'Lista' : 'Detalhe'}
              </button>
            ))}
          </div>

          {/* ── LEFT PANEL: Lista de Contatos ── */}
          <div
            style={{
              width: '380px',
              borderRight: '1px solid #E5E7EB',
              background: '#fff',
              display: 'flex',
              flexDirection: 'column',
              flexShrink: 0,
              // Mobile: esconde se detalhe ativo
            }}
            className={mobileView === 'detalhe' ? 'hidden sm:flex' : 'flex sm:flex'}
          >
            {/* Busca + Botão */}
            <div style={{ padding: '14px 16px', borderBottom: '1px solid #F3F4F6', display: 'flex', gap: 8 }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
                <input
                  type="text"
                  placeholder="Buscar contato…"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  style={{ ...inputStyle, paddingLeft: 30, fontSize: 12 }}
                />
              </div>
              <button
                type="button"
                onClick={() => setMostrarModal(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '9px 12px',
                  borderRadius: 10,
                  border: 'none',
                  background: '#0D6BAF',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                <Plus size={13} />
                Novo
              </button>
            </div>

            {/* Lista */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {carregando && (
                <div style={{ textAlign: 'center', padding: '40px 0', color: '#9CA3AF' }}>
                  <Clock size={28} style={{ opacity: 0.4, marginBottom: 8 }} />
                  <p style={{ margin: 0, fontSize: 13 }}>Carregando…</p>
                </div>
              )}

              {!carregando && erro && (
                <div style={{ padding: '16px', color: '#DC2626', fontSize: 13 }}>
                  {erro}
                </div>
              )}

              {!carregando && !erro && contatosFiltrados.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px 16px', color: '#9CA3AF' }}>
                  <MessageCircle size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>
                    {busca ? 'Nenhum resultado encontrado' : 'Nenhum contato ainda'}
                  </p>
                </div>
              )}

              {contatosFiltrados.map((c) => {
                const ativo = clienteSelecionadoId === c.cliente_id
                const waLink = formatarWaMe(c.cliente_phone_1 ?? null) ?? formatarWaMe(c.cliente_phone_2 ?? null)

                return (
                  <div
                    key={c.id}
                    onClick={() => handleSelecionarContato(c)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '12px 16px',
                      borderBottom: '1px solid #F3F4F6',
                      cursor: 'pointer',
                      background: ativo ? '#EFF6FF' : 'transparent',
                      borderLeft: ativo ? '3px solid #0D6BAF' : '3px solid transparent',
                      transition: 'background 0.1s',
                    }}
                  >
                    <ClienteAvatar nome={c.cliente_nome ?? '?'} />

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: 700,
                            color: '#111827',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            maxWidth: '140px',
                          }}
                        >
                          {c.cliente_nome ?? 'Cliente'}
                        </span>
                        <TipoBadge tipo={c.tipo} />
                      </div>
                      <p
                        style={{
                          margin: 0,
                          fontSize: 12,
                          color: '#6B7280',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {c.assunto}
                      </p>
                      <p style={{ margin: '2px 0 0', fontSize: 11, color: '#9CA3AF' }}>
                        {fmtDate(c.ocorrido_em)}
                      </p>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                      {waLink && (
                        <a
                          href={waLink}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          title="Abrir WhatsApp"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 28,
                            height: 28,
                            borderRadius: 8,
                            background: '#F0FDF4',
                            border: '1px solid #BBF7D0',
                            color: '#16A34A',
                            textDecoration: 'none',
                          }}
                        >
                          <MessageCircle size={13} />
                        </a>
                      )}
                      <ChevronRight size={14} color="#D1D5DB" />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── RIGHT PANEL: Detalhes ── */}
          <div
            style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}
            className={mobileView === 'lista' ? 'hidden sm:flex' : 'flex sm:flex'}
          >
            {!clienteSelecionadoId ? (
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#9CA3AF',
                  gap: 12,
                }}
              >
                <Users size={48} style={{ opacity: 0.2 }} />
                <p style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
                  Selecione um contato
                </p>
                <p style={{ margin: 0, fontSize: 13 }}>
                  Clique em um contato para ver a linha do tempo do cliente
                </p>
              </div>
            ) : (
              <PainelDetalhes
                clienteId={clienteSelecionadoId}
                clientes={clientes}
                onContatoCancelados={handleContatoCancelado}
              />
            )}
          </div>
        </div>
      )}

      {/* Modal Novo Contato */}
      {mostrarModal && (
        <ModalNovoContato
          clientes={clientes}
          onClose={() => setMostrarModal(false)}
          onSalvo={handleContatoSalvo}
        />
      )}
    </div>
  )
}
