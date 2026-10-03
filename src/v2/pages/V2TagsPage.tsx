import { useState } from 'react'
import { Tag, Plus, Search, Edit2, Trash2, Building2, DollarSign } from 'lucide-react'
import { formatarChip, normalizarNomeTag } from '../../modules/tags/domain/tags'

type TipoTag = 'livre' | 'conta_financeira' | 'categoria_despesa'

type TagItem = {
  id: string
  tipo: TipoTag
  nome: string
  ativa: boolean
  usos?: number
}

const TIPO_CONFIG: Record<TipoTag, { label: string; color: string; bg: string; icon: React.ReactNode; descricao: string }> = {
  livre: {
    label: 'Tag Livre',
    color: '#7C3AED',
    bg: '#F5F3FF',
    icon: <Tag size={14} />,
    descricao: 'Organização e filtros gerais (#eko7, #bem aviv)',
  },
  conta_financeira: {
    label: 'Conta Financeira',
    color: '#0D6BAF',
    bg: '#EFF6FF',
    icon: <Building2 size={14} />,
    descricao: 'Contas bancárias e de caixa (BB, Caixa, Nubank)',
  },
  categoria_despesa: {
    label: 'Categoria de Despesa',
    color: '#DC2626',
    bg: '#FEF2F2',
    icon: <DollarSign size={14} />,
    descricao: 'Classificação de despesas (Mercadoria, Aluguel, Contabilidade)',
  },
}

const TAGS_DEMO: TagItem[] = [
  { id: '1', tipo: 'conta_financeira', nome: 'Banco do Brasil', ativa: true, usos: 12 },
  { id: '2', tipo: 'conta_financeira', nome: 'Nubank', ativa: true, usos: 5 },
  { id: '3', tipo: 'conta_financeira', nome: 'Caixa Física', ativa: true, usos: 8 },
  { id: '4', tipo: 'categoria_despesa', nome: 'Mercadoria', ativa: true, usos: 24 },
  { id: '5', tipo: 'categoria_despesa', nome: 'Aluguel', ativa: true, usos: 10 },
  { id: '6', tipo: 'categoria_despesa', nome: 'Contabilidade', ativa: true, usos: 10 },
  { id: '7', tipo: 'categoria_despesa', nome: 'Marketing', ativa: true, usos: 3 },
  { id: '8', tipo: 'categoria_despesa', nome: 'Manutenção', ativa: false, usos: 1 },
  { id: '9', tipo: 'livre', nome: "eko'7", ativa: true, usos: 18 },
  { id: '10', tipo: 'livre', nome: 'bem aviv', ativa: true, usos: 32 },
  { id: '11', tipo: 'livre', nome: 'urgente', ativa: true, usos: 4 },
]

export function V2TagsPage() {
  const [busca, setBusca] = useState('')
  const [tabTipo, setTabTipo] = useState<TipoTag | 'todas'>('todas')

  const tagsFiltradas = TAGS_DEMO.filter((t) => {
    const matchBusca =
      !busca ||
      t.nome.toLowerCase().includes(busca.toLowerCase()) ||
      normalizarNomeTag(t.nome).includes(normalizarNomeTag(busca))
    const matchTipo = tabTipo === 'todas' || t.tipo === tabTipo
    return matchBusca && matchTipo
  })

  const contaPorTipo = (tipo: TipoTag) => TAGS_DEMO.filter((t) => t.tipo === tipo).length

  return (
    <div style={{ padding: '24px', maxWidth: 900, margin: '0 auto' }}>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              background: '#F5F3FF',
              border: '1.5px solid #DDD6FE',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Tag size={22} color="#7C3AED" />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: '#111827' }}>Tags</h1>
            <p style={{ margin: 0, fontSize: 13, color: '#6B7280', marginTop: 2 }}>
              Organize contas e despesas com etiquetas
            </p>
          </div>
        </div>
        <button
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 18px',
            borderRadius: 10,
            background: '#7C3AED',
            color: '#fff',
            border: 'none',
            fontSize: 14,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          <Plus size={16} />
          Nova Tag
        </button>
      </div>

      {/* Cards de tipo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
        {(Object.entries(TIPO_CONFIG) as [TipoTag, typeof TIPO_CONFIG[TipoTag]][]).map(([tipo, cfg]) => (
          <button
            key={tipo}
            onClick={() => setTabTipo(tabTipo === tipo ? 'todas' : tipo)}
            style={{
              padding: '16px',
              borderRadius: 12,
              background: tabTipo === tipo ? cfg.bg : '#FFFFFF',
              border: `1.5px solid ${tabTipo === tipo ? cfg.color + '66' : '#E5E7EB'}`,
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color: cfg.color }}>
              {cfg.icon}
              <span style={{ fontSize: 12, fontWeight: 700 }}>{cfg.label}</span>
            </div>
            <p style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#111827' }}>{contaPorTipo(tipo)}</p>
            <p style={{ margin: '4px 0 0', fontSize: 11, color: '#9CA3AF', lineHeight: 1.4 }}>{cfg.descricao}</p>
          </button>
        ))}
      </div>

      {/* Busca */}
      <div style={{ position: 'relative', marginBottom: 16 }}>
        <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
        <input
          type="text"
          placeholder="Buscar tags…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          style={{
            width: '100%',
            padding: '9px 12px 9px 36px',
            borderRadius: 10,
            border: '1.5px solid #E5E7EB',
            fontSize: 13,
            outline: 'none',
            background: '#FFFFFF',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Lista de tags */}
      {tagsFiltradas.length === 0 ? (
        <div style={{ padding: '60px 24px', textAlign: 'center', background: '#FFFFFF', borderRadius: 14, border: '1.5px solid #E5E7EB' }}>
          <Tag size={40} color="#D1D5DB" style={{ marginBottom: 12 }} />
          <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#374151' }}>Nenhuma tag encontrada</p>
        </div>
      ) : (
        <div style={{ background: '#FFFFFF', borderRadius: 14, border: '1.5px solid #E5E7EB', overflow: 'hidden' }}>
          {tagsFiltradas.map((tag, idx) => {
            const cfg = TIPO_CONFIG[tag.tipo]
            return (
              <div
                key={tag.id}
                style={{
                  padding: '12px 20px',
                  borderBottom: idx < tagsFiltradas.length - 1 ? '1px solid #F3F4F6' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  opacity: tag.ativa ? 1 : 0.5,
                }}
              >
                {/* Chip da tag */}
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '4px 12px',
                    borderRadius: 20,
                    fontSize: 13,
                    fontWeight: 700,
                    color: cfg.color,
                    background: cfg.bg,
                    border: `1px solid ${cfg.color}33`,
                    flexShrink: 0,
                  }}
                >
                  {cfg.icon}
                  {formatarChip(tag.nome)}
                </span>

                {/* Tipo */}
                <span style={{ fontSize: 12, color: '#9CA3AF', flex: 1 }}>{cfg.label}</span>

                {/* Usos */}
                {tag.usos !== undefined && (
                  <span style={{ fontSize: 12, color: '#9CA3AF', whiteSpace: 'nowrap' }}>
                    {tag.usos} uso{tag.usos !== 1 ? 's' : ''}
                  </span>
                )}

                {/* Status */}
                {!tag.ativa && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', padding: '2px 8px', background: '#F3F4F6', borderRadius: 20 }}>
                    Inativa
                  </span>
                )}

                {/* Ações */}
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    title="Editar"
                    style={{ padding: '6px', borderRadius: 8, border: '1px solid #E5E7EB', background: 'none', cursor: 'pointer', color: '#6B7280' }}
                  >
                    <Edit2 size={13} />
                  </button>
                  <button
                    title="Remover"
                    style={{ padding: '6px', borderRadius: 8, border: '1px solid #FECACA', background: 'none', cursor: 'pointer', color: '#DC2626' }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
