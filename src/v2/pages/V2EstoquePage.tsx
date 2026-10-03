import { useState } from 'react'
import {
  Warehouse,
  Search,
  ArrowUpCircle,
  ArrowDownCircle,
  Wrench,
  TrendingUp,
  TrendingDown,
  Package,
} from 'lucide-react'

type TipoMovimentacao = 'entrada' | 'saida' | 'ajuste'

type ItemEstoque = {
  id: string
  codigo: string
  produto: string
  categoria: string
  saldo: number
  unidade: string
  custoMedio: number
  ultimoCusto: number
  ultimaMovimentacao: string
}

type Movimentacao = {
  id: string
  produto: string
  tipo: TipoMovimentacao
  quantidade: number
  origem: string
  data: string
  custo: number | null
}

const ESTOQUE_DEMO: ItemEstoque[] = [
  { id: '1', codigo: 'COL-1001', produto: 'Colchão Solteiro Molas', categoria: 'Colchões', saldo: 12, unidade: 'un', custoMedio: 280.00, ultimoCusto: 280.00, ultimaMovimentacao: '2026-09-28' },
  { id: '2', codigo: 'COL-1002', produto: 'Colchão Casal Espuma D33', categoria: 'Colchões', saldo: 8, unidade: 'un', custoMedio: 195.00, ultimoCusto: 210.00, ultimaMovimentacao: '2026-10-01' },
  { id: '3', codigo: 'CAB-2001', produto: 'Cabeceira Estofada Queen', categoria: 'Cabeceiras', saldo: 5, unidade: 'un', custoMedio: 320.50, ultimoCusto: 320.50, ultimaMovimentacao: '2026-09-15' },
  { id: '4', codigo: 'BAS-3001', produto: 'Base Box Solteiro', categoria: 'Bases', saldo: 3, unidade: 'un', custoMedio: 125.00, ultimoCusto: 130.00, ultimaMovimentacao: '2026-09-20' },
  { id: '5', codigo: 'ACE-4001', produto: 'Travesseiro Látex', categoria: 'Acessórios', saldo: 0, unidade: 'un', custoMedio: 68.00, ultimoCusto: 68.00, ultimaMovimentacao: '2026-09-10' },
  { id: '6', codigo: 'COL-1003', produto: 'Colchão King Molas Ensacadas', categoria: 'Colchões', saldo: 2, unidade: 'un', custoMedio: 890.00, ultimoCusto: 900.00, ultimaMovimentacao: '2026-10-02' },
]

const MOVIMENTACOES_DEMO: Movimentacao[] = [
  { id: 'm1', produto: 'Colchão Solteiro Molas', tipo: 'entrada', quantidade: 5, origem: 'Pedido #1001', data: '2026-10-01', custo: 280.00 },
  { id: 'm2', produto: 'Colchão Casal Espuma D33', tipo: 'saida', quantidade: -2, origem: 'Venda #5020', data: '2026-10-01', custo: null },
  { id: 'm3', produto: 'Colchão Casal Espuma D33', tipo: 'entrada', quantidade: 3, origem: 'Pedido #1002', data: '2026-09-28', custo: 210.00 },
  { id: 'm4', produto: 'Travesseiro Látex', tipo: 'saida', quantidade: -6, origem: 'Venda #5018', data: '2026-09-25', custo: null },
  { id: 'm5', produto: 'Base Box Solteiro', tipo: 'ajuste', quantidade: -1, origem: 'Ajuste manual: Avaria', data: '2026-09-20', custo: null },
  { id: 'm6', produto: 'Colchão King Molas Ensacadas', tipo: 'entrada', quantidade: 2, origem: 'Pedido #1000', data: '2026-10-02', custo: 900.00 },
]

const TIPO_MOV_CONFIG: Record<TipoMovimentacao, { label: string; color: string; bg: string; icon: React.ReactNode; sinal: string }> = {
  entrada: { label: 'Entrada', color: '#16A34A', bg: '#F0FDF4', icon: <ArrowUpCircle size={14} />, sinal: '+' },
  saida: { label: 'Saída', color: '#DC2626', bg: '#FEF2F2', icon: <ArrowDownCircle size={14} />, sinal: '-' },
  ajuste: { label: 'Ajuste', color: '#D97706', bg: '#FFFBEB', icon: <Wrench size={14} />, sinal: '' },
}

type TabAtiva = 'posicao' | 'movimentacoes'

export function V2EstoquePage() {
  const [tab, setTab] = useState<TabAtiva>('posicao')
  const [busca, setBusca] = useState('')

  const itensFiltrados = ESTOQUE_DEMO.filter(
    (i) =>
      !busca ||
      i.produto.toLowerCase().includes(busca.toLowerCase()) ||
      i.codigo.toLowerCase().includes(busca.toLowerCase()) ||
      i.categoria.toLowerCase().includes(busca.toLowerCase()),
  )

  const totalSKUs = ESTOQUE_DEMO.length
  const emEstoque = ESTOQUE_DEMO.filter((i) => i.saldo > 0).length
  const zerados = ESTOQUE_DEMO.filter((i) => i.saldo === 0).length
  const valorTotalEstoque = ESTOQUE_DEMO.reduce((acc, i) => acc + i.saldo * i.custoMedio, 0)

  return (
    <div style={{ padding: '24px', maxWidth: 1100, margin: '0 auto' }}>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            background: '#FFF7ED',
            border: '1.5px solid #FED7AA',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Warehouse size={22} color="#EA580C" />
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: '#111827' }}>Estoque</h1>
          <p style={{ margin: 0, fontSize: 13, color: '#6B7280', marginTop: 2 }}>
            Posição e movimentações de estoque
          </p>
        </div>
      </div>

      {/* Cards de resumo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
        <div style={{ padding: '16px', borderRadius: 12, background: '#FFFFFF', border: '1.5px solid #E5E7EB' }}>
          <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>SKUs</p>
          <p style={{ margin: 0, fontSize: 26, fontWeight: 900, color: '#111827' }}>{totalSKUs}</p>
        </div>
        <div style={{ padding: '16px', borderRadius: 12, background: '#FFFFFF', border: '1.5px solid #E5E7EB' }}>
          <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 700, color: '#16A34A', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <TrendingUp size={11} style={{ marginRight: 4 }} />Em Estoque
          </p>
          <p style={{ margin: 0, fontSize: 26, fontWeight: 900, color: '#111827' }}>{emEstoque}</p>
        </div>
        <div style={{ padding: '16px', borderRadius: 12, background: '#FEF2F2', border: '1.5px solid #FECACA' }}>
          <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 700, color: '#DC2626', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <TrendingDown size={11} style={{ marginRight: 4 }} />Zerados
          </p>
          <p style={{ margin: 0, fontSize: 26, fontWeight: 900, color: '#111827' }}>{zerados}</p>
        </div>
        <div style={{ padding: '16px', borderRadius: 12, background: '#FFFFFF', border: '1.5px solid #E5E7EB' }}>
          <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Valor em Estoque</p>
          <p style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#111827' }}>
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valorTotalEstoque)}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '2px solid #E5E7EB' }}>
        {([
          { key: 'posicao', label: 'Posição de Estoque' },
          { key: 'movimentacoes', label: 'Movimentações' },
        ] as { key: TabAtiva; label: string }[]).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '8px 16px',
              border: 'none',
              background: 'none',
              fontSize: 13,
              fontWeight: 700,
              color: tab === t.key ? '#0D6BAF' : '#6B7280',
              borderBottom: `2px solid ${tab === t.key ? '#0D6BAF' : 'transparent'}`,
              marginBottom: -2,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Busca */}
      <div style={{ position: 'relative', marginBottom: 16 }}>
        <Search
          size={15}
          style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }}
        />
        <input
          type="text"
          placeholder={tab === 'posicao' ? 'Buscar produto, código ou categoria…' : 'Buscar produto…'}
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

      {/* Conteúdo da tab */}
      {tab === 'posicao' ? (
        <div style={{ background: '#FFFFFF', borderRadius: 14, border: '1.5px solid #E5E7EB', overflow: 'hidden' }}>
          {itensFiltrados.map((item, idx) => (
            <div
              key={item.id}
              style={{
                padding: '14px 20px',
                borderBottom: idx < itensFiltrados.length - 1 ? '1px solid #F3F4F6' : 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                flexWrap: 'wrap',
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: item.saldo === 0 ? '#FEF2F2' : '#F0FDF4',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Package size={18} color={item.saldo === 0 ? '#DC2626' : '#16A34A'} />
              </div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#111827' }}>{item.produto}</p>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#9CA3AF' }}>
                  {item.codigo} · {item.categoria}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ margin: 0, fontSize: 11, color: '#9CA3AF', fontWeight: 600 }}>SALDO</p>
                  <p
                    style={{
                      margin: '2px 0 0',
                      fontSize: 18,
                      fontWeight: 900,
                      color: item.saldo === 0 ? '#DC2626' : '#111827',
                    }}
                  >
                    {item.saldo} {item.unidade}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ margin: 0, fontSize: 11, color: '#9CA3AF', fontWeight: 600 }}>CUSTO MÉDIO</p>
                  <p style={{ margin: '2px 0 0', fontSize: 14, fontWeight: 700, color: '#374151' }}>
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.custoMedio)}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ margin: 0, fontSize: 11, color: '#9CA3AF', fontWeight: 600 }}>VALOR TOTAL</p>
                  <p style={{ margin: '2px 0 0', fontSize: 14, fontWeight: 700, color: '#374151' }}>
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.saldo * item.custoMedio)}
                  </p>
                </div>
              </div>
            </div>
          ))}
          {itensFiltrados.length === 0 && (
            <div style={{ padding: '40px', textAlign: 'center', color: '#9CA3AF' }}>
              <Package size={32} style={{ marginBottom: 8 }} />
              <p style={{ margin: 0, fontWeight: 700 }}>Nenhum produto encontrado</p>
            </div>
          )}
        </div>
      ) : (
        <div style={{ background: '#FFFFFF', borderRadius: 14, border: '1.5px solid #E5E7EB', overflow: 'hidden' }}>
          {MOVIMENTACOES_DEMO.filter(
            (m) => !busca || m.produto.toLowerCase().includes(busca.toLowerCase()),
          ).map((mov, idx, arr) => {
            const cfg = TIPO_MOV_CONFIG[mov.tipo]
            const qtdAbs = Math.abs(mov.quantidade)
            return (
              <div
                key={mov.id}
                style={{
                  padding: '14px 20px',
                  borderBottom: idx < arr.length - 1 ? '1px solid #F3F4F6' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  flexWrap: 'wrap',
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: cfg.bg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    color: cfg.color,
                  }}
                >
                  {cfg.icon}
                </div>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#111827' }}>{mov.produto}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: '#9CA3AF' }}>{mov.origem}</p>
                </div>
                <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span
                    style={{
                      padding: '3px 10px',
                      borderRadius: 20,
                      fontSize: 12,
                      fontWeight: 700,
                      color: cfg.color,
                      background: cfg.bg,
                    }}
                  >
                    {cfg.label}
                  </span>
                  <span style={{ fontSize: 15, fontWeight: 900, color: cfg.color }}>
                    {cfg.sinal}{qtdAbs} un
                  </span>
                  {mov.custo && (
                    <span style={{ fontSize: 13, color: '#6B7280' }}>
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(mov.custo)}/un
                    </span>
                  )}
                  <span style={{ fontSize: 12, color: '#9CA3AF' }}>
                    {mov.data.split('-').reverse().join('/')}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
