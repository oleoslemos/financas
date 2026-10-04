import { useState, useEffect } from 'react'
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
import {
  listSaldosEstoque,
  listMovimentacoesEstoque,
  ItemSaldoEstoque,
  MovimentacaoEstoqueV2,
  TipoMovimentacaoEstoque,
} from '../services/v2EstoqueService'
import { formatarMoeda } from '../../modules/lib/money'

const TIPO_MOV_CONFIG: Record<
  TipoMovimentacaoEstoque,
  { label: string; color: string; bg: string; icon: React.ReactNode; sinal: string }
> = {
  entrada: { label: 'Entrada', color: '#16A34A', bg: '#F0FDF4', icon: <ArrowUpCircle size={14} />, sinal: '+' },
  saida: { label: 'Saída', color: '#DC2626', bg: '#FEF2F2', icon: <ArrowDownCircle size={14} />, sinal: '-' },
  ajuste: { label: 'Ajuste', color: '#D97706', bg: '#FFFBEB', icon: <Wrench size={14} />, sinal: '' },
}

type TabAtiva = 'posicao' | 'movimentacoes'

export function V2EstoquePage() {
  const [tab, setTab] = useState<TabAtiva>('posicao')
  const [busca, setBusca] = useState('')
  const [saldos, setSaldos] = useState<ItemSaldoEstoque[]>([])
  const [movimentacoes, setMovimentacoes] = useState<MovimentacaoEstoqueV2[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const s = await listSaldosEstoque()
      const m = await listMovimentacoesEstoque()
      setSaldos(s)
      setMovimentacoes(m)
      setLoading(false)
    }
    load()
  }, [])

  const itensFiltrados = saldos.filter(
    (i) =>
      !busca ||
      i.produto_nome.toLowerCase().includes(busca.toLowerCase()) ||
      i.codigo_sku.toLowerCase().includes(busca.toLowerCase()) ||
      i.categoria.toLowerCase().includes(busca.toLowerCase()),
  )

  const totalSKUs = saldos.length
  const emEstoque = saldos.filter((i) => i.saldo > 0).length
  const zerados = saldos.filter((i) => i.saldo === 0).length
  const valorTotalEstoque = saldos.reduce((acc, i) => acc + i.saldo * i.custo_medio, 0)

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
            Posição e movimentações de estoque em tempo real
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
            {formatarMoeda(valorTotalEstoque)}
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
      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#9CA3AF' }}>
          Carregando dados de estoque...
        </div>
      ) : tab === 'posicao' ? (
        <div style={{ background: '#FFFFFF', borderRadius: 14, border: '1.5px solid #E5E7EB', overflow: 'hidden' }}>
          {itensFiltrados.map((item, idx) => (
            <div
              key={item.produto_id}
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
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#111827' }}>{item.produto_nome}</p>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#9CA3AF' }}>
                  {item.codigo_sku} · {item.categoria}
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
                    {formatarMoeda(item.custo_medio)}
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ margin: 0, fontSize: 11, color: '#9CA3AF', fontWeight: 600 }}>VALOR TOTAL</p>
                  <p style={{ margin: '2px 0 0', fontSize: 14, fontWeight: 700, color: '#374151' }}>
                    {formatarMoeda(item.saldo * item.custo_medio)}
                  </p>
                </div>
              </div>
            </div>
          ))}
          {itensFiltrados.length === 0 && (
            <div style={{ padding: '40px', textAlign: 'center', color: '#9CA3AF' }}>
              <Package size={32} style={{ marginBottom: 8 }} />
              <p style={{ margin: 0, fontWeight: 700 }}>Nenhum produto em estoque</p>
            </div>
          )}
        </div>
      ) : (
        <div style={{ background: '#FFFFFF', borderRadius: 14, border: '1.5px solid #E5E7EB', overflow: 'hidden' }}>
          {movimentacoes
            .filter((m) => !busca || m.produto_nome.toLowerCase().includes(busca.toLowerCase()))
            .map((mov, idx, arr) => {
              const cfg = TIPO_MOV_CONFIG[mov.tipo] || TIPO_MOV_CONFIG.entrada
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
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#111827' }}>{mov.produto_nome}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 12, color: '#9CA3AF' }}>{mov.referencia || mov.origem}</p>
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
                    {mov.custo_unitario && (
                      <span style={{ fontSize: 13, color: '#6B7280' }}>
                        {formatarMoeda(mov.custo_unitario)}/un
                      </span>
                    )}
                    <span style={{ fontSize: 12, color: '#9CA3AF' }}>
                      {mov.data.split('-').reverse().join('/')}
                    </span>
                  </div>
                </div>
              )
            })}
          {movimentacoes.length === 0 && (
            <div style={{ padding: '40px', textAlign: 'center', color: '#9CA3AF' }}>
              <p style={{ margin: 0, fontWeight: 700 }}>Nenhuma movimentação de estoque registrada ainda.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
