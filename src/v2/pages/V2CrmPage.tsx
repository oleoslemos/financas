import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Phone,
  MessageCircle,
  Plus,
  Search,
  X,
  Calendar,
  ChevronRight,
  ArrowUpRight,
  ArrowDownLeft,
  Clock,
  CheckCircle2,
  Users,
  Loader2,
  AlertCircle,

} from 'lucide-react'
import {
  CrmContato,
  CrmTipoContato,
  CrmDirecao,
  CrmTipoAgenda,
  CrmAgendaItem,
  ClienteResumido,
  fetchContatos,
  fetchContatosByCliente,
  criarContato,
  cancelarContato,
  fetchAgendaItems,
  criarAgendaItem,
  concluirAgendaItem,
  cancelarAgendaItem,
  fetchClientesParaSelect,
  formatarDataHora,
  formatarWaMe,
  obterTelefoneCliente,
} from '../services/v2CrmService'
import { getCurrentV2User } from '../services/v2AuthService'
import { useCompany } from '../../context/CompanyContext'

// ─────────────────────────────────────────────────────────────────────────────
// Config visual
// ─────────────────────────────────────────────────────────────────────────────

const TIPO_CONFIG: Record<CrmTipoContato, { label: string; color: string; bg: string }> = {
  ligacao:  { label: 'Ligação',  color: '#2563EB', bg: '#EFF6FF' },
  whatsapp: { label: 'WhatsApp', color: '#16A34A', bg: '#F0FDF4' },
  email:    { label: 'E-mail',   color: '#D97706', bg: '#FFFBEB' },
  visita:   { label: 'Visita',   color: '#7C3AED', bg: '#F5F3FF' },
  reuniao:  { label: 'Reunião',  color: '#DB2777', bg: '#FDF2F8' },
  outro:    { label: 'Outro',    color: '#6B7280', bg: '#F3F4F6' },
}

const TIPO_OPTIONS: { value: CrmTipoContato; label: string }[] = [
  { value: 'ligacao',  label: 'Ligação' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email',    label: 'E-mail' },
  { value: 'visita',   label: 'Visita' },
  { value: 'reuniao',  label: 'Reunião' },
  { value: 'outro',    label: 'Outro' },
]

const DIRECAO_OPTIONS: { value: CrmDirecao; label: string }[] = [
  { value: 'realizado', label: 'Realizado (saída)' },
  { value: 'recebido',  label: 'Recebido (entrada)' },
]

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function TipoBadge({ tipo }: { tipo: CrmTipoContato }) {
  const cfg = TIPO_CONFIG[tipo]
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '2px 10px', borderRadius: 20,
        fontSize: 11, fontWeight: 700,
        color: cfg.color, background: cfg.bg,
        border: `1px solid ${cfg.color}33`,
        whiteSpace: 'nowrap',
      }}
    >
      {cfg.label}
    </span>
  )
}

function DirecaoIcon({ direcao }: { direcao: CrmDirecao }) {
  if (direcao === 'realizado') {
    return <span title="Realizado"><ArrowUpRight size={14} style={{ color: '#16A34A' }} /></span>
  }
  return <span title="Recebido"><ArrowDownLeft size={14} style={{ color: '#2563EB' }} /></span>
}

function WhatsAppBtn({ phone }: { phone: string | null | undefined }) {
  const link = formatarWaMe(phone)
  if (!link) return null
  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      title="Abrir WhatsApp"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600,
        color: '#16A34A', background: '#F0FDF4',
        border: '1px solid #86EFAC', textDecoration: 'none',
        transition: 'opacity .15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.opacity = '0.8' }}
      onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
    >
      <MessageCircle size={13} />
      WhatsApp
    </a>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal de Novo Contato
// ─────────────────────────────────────────────────────────────────────────────

interface NovoContatoModalProps {
  clientes: ClienteResumido[]
  userId: string
  companyId: string | null
  onClose: () => void
  onSalvo: (c: CrmContato) => void
}

function NovoContatoModal({ clientes, userId, companyId, onClose, onSalvo }: NovoContatoModalProps) {
  const [clienteId, setClienteId] = useState('')
  const [clienteBusca, setClienteBusca] = useState('')
  const [tipo, setTipo] = useState<CrmTipoContato>('ligacao')
  const [direcao, setDirecao] = useState<CrmDirecao>('realizado')
  const [assunto, setAssunto] = useState('')
  const [descricao, setDescricao] = useState('')
  const [resultado, setResultado] = useState('')
  const [ocorridoEm, setOcorridoEm] = useState(() => {
    const now = new Date()
    now.setSeconds(0, 0)
    return now.toISOString().slice(0, 16)
  })
  const [proximoContato, setProximoContato] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [clienteDropdown, setClienteDropdown] = useState(false)

  const clientesFiltrados = useMemo(() => {
    if (!clienteBusca) return clientes.slice(0, 30)
    const q = clienteBusca.toLowerCase()
    return clientes.filter(c => c.full_name.toLowerCase().includes(q)).slice(0, 30)
  }, [clientes, clienteBusca])

  const clienteSelecionado = clientes.find(c => c.id === clienteId)

  const handleSalvar = async () => {
    if (!clienteId) { setErro('Selecione um cliente.'); return }
    if (!assunto.trim()) { setErro('Informe o assunto do contato.'); return }
    setErro(null)
    setSalvando(true)
    try {
      const contato = await criarContato({
        cliente_id: clienteId,
        tipo,
        direcao,
        assunto,
        descricao: descricao || null,
        resultado: resultado || null,
        ocorrido_em: new Date(ocorridoEm).toISOString(),
        proximo_contato_em: proximoContato ? new Date(proximoContato).toISOString() : null,
        criado_por: userId,
        company_id: companyId,
      }, userId)
      onSalvo(contato)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao salvar contato.')
    } finally {
      setSalvando(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13,
    border: '1.5px solid #D1D5DB', outline: 'none', background: '#FAFAFA',
    boxSizing: 'border-box',
  }
  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 4, display: 'block' }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{
          background: '#fff', borderRadius: 16, width: '100%', maxWidth: 540,
          maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: '#111827', margin: 0 }}>Registrar Contato</h2>
            <p style={{ fontSize: 12, color: '#6B7280', margin: '2px 0 0' }}>Registre a interação com o cliente</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: '20px 24px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Cliente */}
          <div style={{ position: 'relative' }}>
            <label style={labelStyle}>Cliente *</label>
            <div
              onClick={() => setClienteDropdown(!clienteDropdown)}
              style={{
                ...inputStyle, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                border: clienteDropdown ? '1.5px solid #0D6BAF' : '1.5px solid #D1D5DB',
              }}
            >
              <span style={{ color: clienteSelecionado ? '#111827' : '#9CA3AF' }}>
                {clienteSelecionado ? clienteSelecionado.full_name : 'Selecionar cliente...'}
              </span>
              <ChevronRight size={14} style={{ color: '#6B7280', transform: clienteDropdown ? 'rotate(90deg)' : 'none', transition: '.2s' }} />
            </div>
            {clienteDropdown && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                background: '#fff', border: '1.5px solid #0D6BAF', borderRadius: 8,
                boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: 220, overflow: 'auto',
              }}>
                <div style={{ padding: '8px 10px', borderBottom: '1px solid #F3F4F6' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 6, padding: '5px 10px' }}>
                    <Search size={13} style={{ color: '#9CA3AF' }} />
                    <input
                      autoFocus
                      value={clienteBusca}
                      onChange={e => setClienteBusca(e.target.value)}
                      placeholder="Buscar cliente..."
                      style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, width: '100%' }}
                    />
                  </div>
                </div>
                {clientesFiltrados.map(c => (
                  <div
                    key={c.id}
                    onClick={() => { setClienteId(c.id); setClienteDropdown(false); setClienteBusca('') }}
                    style={{
                      padding: '9px 14px', cursor: 'pointer', fontSize: 13,
                      background: c.id === clienteId ? '#EFF6FF' : 'transparent',
                      color: c.id === clienteId ? '#1D4ED8' : '#111827',
                    }}
                    onMouseEnter={e => { if (c.id !== clienteId) e.currentTarget.style.background = '#F9FAFB' }}
                    onMouseLeave={e => { if (c.id !== clienteId) e.currentTarget.style.background = 'transparent' }}
                  >
                    {c.full_name}
                  </div>
                ))}
                {clientesFiltrados.length === 0 && (
                  <div style={{ padding: 14, fontSize: 13, color: '#6B7280', textAlign: 'center' }}>Nenhum cliente encontrado</div>
                )}
              </div>
            )}
          </div>

          {/* Tipo e Direção */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>Tipo de Contato *</label>
              <select value={tipo} onChange={e => setTipo(e.target.value as CrmTipoContato)} style={{ ...inputStyle, cursor: 'pointer' }}>
                {TIPO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Direção *</label>
              <select value={direcao} onChange={e => setDirecao(e.target.value as CrmDirecao)} style={{ ...inputStyle, cursor: 'pointer' }}>
                {DIRECAO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          {/* Data/hora */}
          <div>
            <label style={labelStyle}>Data e Hora do Contato *</label>
            <input type="datetime-local" value={ocorridoEm} onChange={e => setOcorridoEm(e.target.value)} style={inputStyle} />
          </div>

          {/* Assunto */}
          <div>
            <label style={labelStyle}>Assunto *</label>
            <input
              type="text"
              value={assunto}
              onChange={e => setAssunto(e.target.value)}
              placeholder="Ex: Apresentação do produto, dúvida sobre entrega..."
              style={inputStyle}
            />
          </div>

          {/* Descrição */}
          <div>
            <label style={labelStyle}>Descrição</label>
            <textarea
              value={descricao}
              onChange={e => setDescricao(e.target.value)}
              placeholder="Detalhes do contato..."
              rows={3}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>

          {/* Resultado */}
          <div>
            <label style={labelStyle}>Resultado</label>
            <textarea
              value={resultado}
              onChange={e => setResultado(e.target.value)}
              placeholder="O que foi combinado ou decidido..."
              rows={2}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>

          {/* Próximo contato */}
          <div style={{ background: '#F0F7EE', borderRadius: 10, padding: '12px 14px', border: '1px solid #C6E6A0' }}>
            <label style={{ ...labelStyle, color: '#166534', marginBottom: 6 }}>
              <Calendar size={13} style={{ display: 'inline', marginRight: 4 }} />
              Próximo Contato (opcional)
            </label>
            <input
              type="datetime-local"
              value={proximoContato}
              onChange={e => setProximoContato(e.target.value)}
              style={{ ...inputStyle, background: '#fff' }}
            />
            {proximoContato && (
              <p style={{ fontSize: 11, color: '#16A34A', marginTop: 6, marginBottom: 0 }}>
                ✓ Um item de agenda será criado automaticamente
              </p>
            )}
          </div>

          {/* Erro */}
          {erro && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <AlertCircle size={15} style={{ color: '#DC2626', flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontSize: 13, color: '#DC2626' }}>{erro}</span>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
            <button
              onClick={onClose}
              style={{ padding: '9px 20px', borderRadius: 8, border: '1.5px solid #D1D5DB', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#374151' }}
            >
              Cancelar
            </button>
            <button
              onClick={handleSalvar}
              disabled={salvando}
              style={{
                padding: '9px 24px', borderRadius: 8, border: 'none',
                background: salvando ? '#93C5FD' : '#0D6BAF',
                color: '#fff', cursor: salvando ? 'not-allowed' : 'pointer',
                fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              {salvando && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
              {salvando ? 'Salvando...' : 'Registrar Contato'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal de Novo Item de Agenda
// ─────────────────────────────────────────────────────────────────────────────

interface NovaAgendaModalProps {
  clientes: ClienteResumido[]
  userId: string
  companyId: string | null
  onClose: () => void
  onSalvo: () => void
}

function NovaAgendaModal({ clientes, userId, companyId, onClose, onSalvo }: NovaAgendaModalProps) {
  const [tipo, setTipo] = useState<CrmTipoAgenda>('tarefa')
  const [titulo, setTitulo] = useState('')
  const [inicio, setInicio] = useState(() => {
    const now = new Date(); now.setSeconds(0, 0); return now.toISOString().slice(0, 16)
  })
  const [fim, setFim] = useState('')
  const [clienteId, setClienteId] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13,
    border: '1.5px solid #D1D5DB', outline: 'none', background: '#FAFAFA',
    boxSizing: 'border-box',
  }

  const handleSalvar = async () => {
    if (!titulo.trim()) { setErro('Informe o título.'); return }
    setErro(null); setSalvando(true)
    try {
      await criarAgendaItem({ tipo, titulo, inicio: new Date(inicio).toISOString(), fim: fim ? new Date(fim).toISOString() : null, cliente_id: clienteId || null, company_id: companyId }, userId)
      onSalvo()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao criar item.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'auto', maxHeight: '90vh' }}>
        <div style={{ padding: '20px 24px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: 17, fontWeight: 800, color: '#111827', margin: 0 }}>Novo Item de Agenda</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280' }}><X size={20} /></button>
        </div>
        <div style={{ padding: '16px 24px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 4, display: 'block' }}>Tipo</label>
              <select value={tipo} onChange={e => setTipo(e.target.value as CrmTipoAgenda)} style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="tarefa">Tarefa</option>
                <option value="evento">Evento</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 4, display: 'block' }}>Cliente (opcional)</label>
              <select value={clienteId} onChange={e => setClienteId(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="">— Nenhum —</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 4, display: 'block' }}>Título *</label>
            <input type="text" value={titulo} onChange={e => setTitulo(e.target.value)} placeholder="O que fazer..." style={inputStyle} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 4, display: 'block' }}>Início *</label>
              <input type="datetime-local" value={inicio} onChange={e => setInicio(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 4, display: 'block' }}>Fim (opcional)</label>
              <input type="datetime-local" value={fim} onChange={e => setFim(e.target.value)} style={inputStyle} />
            </div>
          </div>
          {erro && (
            <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#DC2626' }}>{erro}</div>
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={{ padding: '9px 20px', borderRadius: 8, border: '1.5px solid #D1D5DB', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#374151' }}>Cancelar</button>
            <button onClick={handleSalvar} disabled={salvando} style={{ padding: '9px 24px', borderRadius: 8, border: 'none', background: salvando ? '#93C5FD' : '#0D6BAF', color: '#fff', cursor: salvando ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700 }}>
              {salvando ? 'Salvando...' : 'Criar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Ficha do cliente (painel direito)
// ─────────────────────────────────────────────────────────────────────────────

interface FichaClienteProps {
  clienteId: string
  clienteNome: string
  phone: string | null
  onClose: () => void
  onContatoCancelado: () => void
}

function FichaCliente({ clienteId, clienteNome, phone, onClose, onContatoCancelado }: FichaClienteProps) {
  const [contatos, setContatos] = useState<CrmContato[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [cancelandoId, setCancelandoId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  useEffect(() => {
    setCarregando(true); setErro(null)
    fetchContatosByCliente(clienteId)
      .then(setContatos)
      .catch(e => setErro(e instanceof Error ? e.message : 'Erro ao carregar.'))
      .finally(() => setCarregando(false))
  }, [clienteId])

  const handleCancelar = async (id: string) => {
    setCancelandoId(id)
    try {
      await cancelarContato(id)
      setContatos(prev => prev.filter(c => c.id !== id))
      onContatoCancelado()
      setConfirmId(null)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao cancelar.')
    } finally {
      setCancelandoId(null)
    }
  }

  const waLink = formatarWaMe(phone)

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #E5E7EB', background: '#fff', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#0D6BAF', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15, flexShrink: 0 }}>
              {clienteNome.charAt(0).toUpperCase()}
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontWeight: 800, fontSize: 15, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{clienteNome}</p>
              {phone && (
                <p style={{ margin: 0, fontSize: 12, color: '#6B7280', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Phone size={11} />{phone}
                </p>
              )}
            </div>
          </div>
          {waLink && <WhatsAppBtn phone={phone} />}
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', flexShrink: 0 }}>
          <X size={18} />
        </button>
      </div>

      {/* Linha do tempo */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
          Histórico de Contatos
        </p>

        {carregando && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
            <Loader2 size={24} style={{ color: '#0D6BAF', animation: 'spin 1s linear infinite' }} />
          </div>
        )}

        {erro && (
          <div style={{ background: '#FEF2F2', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#DC2626' }}>{erro}</div>
        )}

        {!carregando && !erro && contatos.length === 0 && (
          <div style={{ textAlign: 'center', padding: '32px 0', color: '#9CA3AF', fontSize: 13 }}>
            <MessageCircle size={32} style={{ margin: '0 auto 10px', display: 'block', opacity: .4 }} />
            Nenhum contato registrado para este cliente.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {contatos.map(c => (
            <div key={c.id} style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', padding: '12px 14px', position: 'relative' }}>
              {/* Header do card */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                <DirecaoIcon direcao={c.direcao} />
                <TipoBadge tipo={c.tipo} />
                <span style={{ fontSize: 12, color: '#6B7280', marginLeft: 'auto' }}>
                  <Clock size={11} style={{ display: 'inline', marginRight: 3 }} />
                  {formatarDataHora(c.ocorrido_em)}
                </span>
              </div>

              {/* Assunto */}
              <p style={{ margin: '0 0 4px', fontWeight: 700, fontSize: 13, color: '#111827' }}>{c.assunto}</p>

              {/* Descrição */}
              {c.descricao && (
                <p style={{ margin: '0 0 6px', fontSize: 12, color: '#4B5563', lineHeight: 1.5 }}>{c.descricao}</p>
              )}

              {/* Resultado */}
              {c.resultado && (
                <div style={{ background: '#F0FDF4', border: '1px solid #D1FAE5', borderRadius: 6, padding: '6px 10px', fontSize: 12, color: '#065F46', marginBottom: 6 }}>
                  <strong>Resultado:</strong> {c.resultado}
                </div>
              )}

              {/* Próximo contato */}
              {c.proximo_contato_em && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#D97706', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 6, padding: '5px 10px', marginBottom: 6 }}>
                  <Calendar size={12} />
                  Próximo contato: {formatarDataHora(c.proximo_contato_em)}
                </div>
              )}

              {/* Cancelar */}
              {confirmId === c.id ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                  <span style={{ fontSize: 12, color: '#DC2626' }}>Confirmar cancelamento?</span>
                  <button onClick={() => handleCancelar(c.id)} disabled={cancelandoId === c.id}
                    style={{ padding: '4px 12px', borderRadius: 6, border: 'none', background: '#DC2626', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
                    {cancelandoId === c.id ? '...' : 'Sim'}
                  </button>
                  <button onClick={() => setConfirmId(null)} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #D1D5DB', background: '#fff', cursor: 'pointer', fontSize: 12 }}>
                    Não
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmId(c.id)}
                  style={{ marginTop: 6, fontSize: 11, color: '#9CA3AF', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', textDecoration: 'underline' }}
                >
                  Cancelar contato
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Aba Agenda
// ─────────────────────────────────────────────────────────────────────────────

function AbaAgenda({ clientes, userId, companyId }: { clientes: ClienteResumido[]; userId: string; companyId: string | null }) {
  const [itens, setItens] = useState<CrmAgendaItem[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [novaAgendaOpen, setNovaAgendaOpen] = useState(false)

  const carregar = useCallback(() => {
    setCarregando(true); setErro(null)
    const de = new Date(); de.setHours(0, 0, 0, 0)
    const ate = new Date(de); ate.setDate(ate.getDate() + 30)
    fetchAgendaItems(de.toISOString(), ate.toISOString())
      .then(setItens)
      .catch(e => setErro(e instanceof Error ? e.message : 'Erro ao carregar agenda.'))
      .finally(() => setCarregando(false))
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const handleConcluir = async (id: string) => {
    try {
      await concluirAgendaItem(id)
      setItens(prev => prev.map(i => i.id === id ? { ...i, concluido_em: new Date().toISOString() } : i))
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao concluir.')
    }
  }

  const handleCancelar = async (id: string) => {
    try {
      await cancelarAgendaItem(id)
      setItens(prev => prev.filter(i => i.id !== id))
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao cancelar.')
    }
  }

  const pendentes = itens.filter(i => !i.concluido_em)
  const concluidos = itens.filter(i => i.concluido_em)

  return (
    <div style={{ padding: '20px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#111827' }}>Próximos 30 dias</h3>
          <p style={{ margin: 0, fontSize: 12, color: '#6B7280' }}>{pendentes.length} pendente{pendentes.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => setNovaAgendaOpen(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: 'none', background: '#0D6BAF', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}
        >
          <Plus size={15} /> Novo
        </button>
      </div>

      {carregando && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
          <Loader2 size={24} style={{ color: '#0D6BAF', animation: 'spin 1s linear infinite' }} />
        </div>
      )}

      {erro && <div style={{ background: '#FEF2F2', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#DC2626', marginBottom: 12 }}>{erro}</div>}

      {!carregando && !erro && pendentes.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#9CA3AF' }}>
          <Calendar size={36} style={{ margin: '0 auto 10px', display: 'block', opacity: .4 }} />
          <p style={{ margin: 0, fontSize: 14 }}>Nenhum item nos próximos 30 dias.</p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {pendentes.map(item => (
          <div key={item.id} style={{ background: '#fff', borderRadius: 10, border: '1px solid #E5E7EB', padding: '12px 14px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <button
              onClick={() => handleConcluir(item.id)}
              title="Marcar como concluído"
              style={{ background: 'none', border: '2px solid #D1D5DB', borderRadius: '50%', width: 22, height: 22, cursor: 'pointer', flexShrink: 0, marginTop: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#7DC344'; e.currentTarget.style.background = '#F0FDF4' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#D1D5DB'; e.currentTarget.style.background = 'none' }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: '#111827' }}>{item.titulo}</span>
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: item.tipo === 'tarefa' ? '#EFF6FF' : '#F5F3FF', color: item.tipo === 'tarefa' ? '#1D4ED8' : '#7C3AED', fontWeight: 700, border: `1px solid ${item.tipo === 'tarefa' ? '#BFDBFE' : '#DDD6FE'}` }}>
                  {item.tipo === 'tarefa' ? 'Tarefa' : 'Evento'}
                </span>
                {item.origem === 'google' && (
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#FEF2F2', color: '#DC2626', fontWeight: 700, border: '1px solid #FECACA' }}>Google</span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 12, color: '#6B7280' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Clock size={11} />{formatarDataHora(item.inicio)}
                </span>
                {item.cliente_nome && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Users size={11} />{item.cliente_nome}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => handleCancelar(item.id)}
              title="Cancelar"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#D1D5DB', padding: 4, flexShrink: 0 }}
              onMouseEnter={e => { e.currentTarget.style.color = '#DC2626' }}
              onMouseLeave={e => { e.currentTarget.style.color = '#D1D5DB' }}
            >
              <X size={15} />
            </button>
          </div>
        ))}

        {concluidos.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 8px' }}>Concluídos</p>
            {concluidos.map(item => (
              <div key={item.id} style={{ background: '#F9FAFB', borderRadius: 10, border: '1px solid #F3F4F6', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6, opacity: .7 }}>
                <CheckCircle2 size={18} style={{ color: '#7DC344', flexShrink: 0 }} />
                <div>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#6B7280', textDecoration: 'line-through' }}>{item.titulo}</p>
                  <p style={{ margin: 0, fontSize: 11, color: '#9CA3AF' }}>{formatarDataHora(item.inicio)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {novaAgendaOpen && (
        <NovaAgendaModal
          clientes={clientes}
          userId={userId}
          companyId={companyId}
          onClose={() => setNovaAgendaOpen(false)}
          onSalvo={() => { setNovaAgendaOpen(false); carregar() }}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Página principal
// ─────────────────────────────────────────────────────────────────────────────

type Tab = 'contatos' | 'agenda'

export function V2CrmPage() {
  const { activeCompanyId: companyId } = useCompany()
  const v2User = getCurrentV2User()
  const userId = v2User?.id ?? ''

  const [tab, setTab] = useState<Tab>('contatos')
  const [contatos, setContatos] = useState<CrmContato[]>([])
  const [clientes, setClientes] = useState<ClienteResumido[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [novoContatoOpen, setNovoContatoOpen] = useState(false)
  const [fichaCliente, setFichaCliente] = useState<{ id: string; nome: string; phone: string | null } | null>(null)

  const carregar = useCallback(() => {
    setCarregando(true); setErro(null)
    Promise.all([fetchContatos(), fetchClientesParaSelect(companyId)])
      .then(([ct, cl]) => { setContatos(ct); setClientes(cl) })
      .catch(e => setErro(e instanceof Error ? e.message : 'Erro ao carregar CRM.'))
      .finally(() => setCarregando(false))
  }, [companyId])

  useEffect(() => { carregar() }, [carregar])

  const contatosFiltrados = useMemo(() => {
    if (!busca) return contatos
    const q = busca.toLowerCase()
    return contatos.filter(c =>
      (c.cliente_nome ?? '').toLowerCase().includes(q) ||
      c.assunto.toLowerCase().includes(q) ||
      (c.descricao ?? '').toLowerCase().includes(q)
    )
  }, [contatos, busca])

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
    border: 'none', background: 'none',
    color: active ? '#0D6BAF' : '#6B7280',
    borderBottom: active ? '2px solid #0D6BAF' : '2px solid transparent',
    transition: 'all .15s',
  })

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#F0F7EE' }}>
      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #E5E7EB', padding: '16px 24px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: '#111827' }}>CRM</h1>
            <p style={{ margin: 0, fontSize: 12, color: '#6B7280' }}>Acompanhamento de contatos com clientes</p>
          </div>
          {tab === 'contatos' && (
            <button
              onClick={() => setNovoContatoOpen(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 10, border: 'none', background: '#0D6BAF', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, boxShadow: '0 2px 8px rgba(13,107,175,.3)' }}
            >
              <Plus size={15} /> Registrar Contato
            </button>
          )}
        </div>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0 }}>
          <button style={tabStyle(tab === 'contatos')} onClick={() => setTab('contatos')}>
            <MessageCircle size={13} style={{ display: 'inline', marginRight: 6 }} />
            Contatos
          </button>
          <button style={tabStyle(tab === 'agenda')} onClick={() => setTab('agenda')}>
            <Calendar size={13} style={{ display: 'inline', marginRight: 6 }} />
            Agenda
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
        {tab === 'agenda' ? (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <AbaAgenda clientes={clientes} userId={userId} companyId={companyId} />
          </div>
        ) : (
          /* Layout 2 painéis */
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {/* Painel esquerdo: lista */}
            <div style={{
              width: fichaCliente ? '380px' : '100%',
              minWidth: fichaCliente ? '320px' : undefined,
              flexShrink: 0,
              display: 'flex', flexDirection: 'column',
              borderRight: fichaCliente ? '1px solid #E5E7EB' : 'none',
              background: '#fff',
              overflow: 'hidden',
            }}>
              {/* Busca */}
              <div style={{ padding: '14px 16px', borderBottom: '1px solid #F3F4F6', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#F9FAFB', border: '1.5px solid #E5E7EB', borderRadius: 10, padding: '8px 12px' }}>
                  <Search size={15} style={{ color: '#9CA3AF', flexShrink: 0 }} />
                  <input
                    value={busca}
                    onChange={e => setBusca(e.target.value)}
                    placeholder="Buscar por cliente ou assunto..."
                    style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, width: '100%', color: '#111827' }}
                  />
                  {busca && (
                    <button onClick={() => setBusca('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 0 }}>
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>

              {/* Lista */}
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {carregando && (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
                    <Loader2 size={28} style={{ color: '#0D6BAF', animation: 'spin 1s linear infinite' }} />
                  </div>
                )}

                {erro && (
                  <div style={{ margin: 16, background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '14px 16px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <AlertCircle size={16} style={{ color: '#DC2626', flexShrink: 0, marginTop: 1 }} />
                    <div>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#DC2626' }}>Erro ao carregar</p>
                      <p style={{ margin: '2px 0 0', fontSize: 12, color: '#DC2626' }}>{erro}</p>
                    </div>
                  </div>
                )}

                {!carregando && !erro && contatosFiltrados.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '48px 24px', color: '#9CA3AF' }}>
                    <MessageCircle size={40} style={{ margin: '0 auto 12px', display: 'block', opacity: .35 }} />
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
                      {busca ? 'Nenhum contato encontrado.' : 'Nenhum contato registrado ainda.'}
                    </p>
                    {!busca && (
                      <p style={{ margin: '6px 0 0', fontSize: 12 }}>
                        Clique em <strong>Registrar Contato</strong> para começar.
                      </p>
                    )}
                  </div>
                )}

                {contatosFiltrados.map(c => {
                  const phone = obterTelefoneCliente({ phone_1: c.cliente_phone_1, phone_2: c.cliente_phone_2 })
                  const isActive = fichaCliente?.id === c.cliente_id
                  return (
                    <div
                      key={c.id}
                      onClick={() => setFichaCliente({ id: c.cliente_id, nome: c.cliente_nome ?? '—', phone })}
                      style={{
                        padding: '13px 16px', cursor: 'pointer',
                        borderBottom: '1px solid #F3F4F6',
                        background: isActive ? '#EFF6FF' : '#fff',
                        transition: 'background .12s',
                        display: 'flex', alignItems: 'flex-start', gap: 12,
                      }}
                      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#F9FAFB' }}
                      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = '#fff' }}
                    >
                      {/* Avatar */}
                      <div style={{
                        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                        background: isActive ? '#0D6BAF' : '#E5E7EB',
                        color: isActive ? '#fff' : '#6B7280',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 800, fontSize: 14,
                      }}>
                        {(c.cliente_nome ?? 'C').charAt(0).toUpperCase()}
                      </div>

                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                          <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {c.cliente_nome ?? '—'}
                          </p>
                          <span style={{ fontSize: 11, color: '#9CA3AF', flexShrink: 0 }}>
                            {formatarDataHora(c.ocorrido_em)}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                          <DirecaoIcon direcao={c.direcao} />
                          <TipoBadge tipo={c.tipo} />
                        </div>
                        <p style={{ margin: 0, fontSize: 12, color: '#4B5563', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.assunto}
                        </p>
                        {phone && (
                          <div style={{ marginTop: 6 }}>
                            <WhatsAppBtn phone={phone} />
                          </div>
                        )}
                      </div>

                      <ChevronRight size={14} style={{ color: '#D1D5DB', flexShrink: 0, marginTop: 4 }} />
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Painel direito: ficha do cliente */}
            {fichaCliente && (
              <div style={{ flex: 1, overflow: 'hidden', background: '#FAFAFA', minWidth: 0 }}>
                <FichaCliente
                  clienteId={fichaCliente.id}
                  clienteNome={fichaCliente.nome}
                  phone={fichaCliente.phone}
                  onClose={() => setFichaCliente(null)}
                  onContatoCancelado={carregar}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal novo contato */}
      {novoContatoOpen && (
        <NovoContatoModal
          clientes={clientes}
          userId={userId}
          companyId={companyId}
          onClose={() => setNovoContatoOpen(false)}
          onSalvo={(novoContato) => {
            setNovoContatoOpen(false)
            // adiciona no topo da lista com nome do cliente
            const cliente = clientes.find(cl => cl.id === novoContato.cliente_id)
            setContatos(prev => [{
              ...novoContato,
              cliente_nome: cliente?.full_name ?? '—',
              cliente_phone_1: cliente?.phone_1 ?? null,
              cliente_phone_2: cliente?.phone_2 ?? null,
            }, ...prev])
          }}
        />
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
