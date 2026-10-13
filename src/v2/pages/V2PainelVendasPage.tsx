import { useState } from 'react'
import {
  TrendingUp,
  DollarSign,
  ShoppingBag,
  Award,
  Target,
  Sparkles,
  ArrowUpRight,
} from 'lucide-react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
} from 'recharts'

export function V2PainelVendasPage() {
  const [periodo, setPeriodo] = useState<'mes' | 'ano' | 'tudo'>('mes')

  const fmt = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

  // Métricas de Vendas (Simuladas e integradas com os dados locais)
  const vendasConfirmadas = 98631.18
  const metaMes = 120000.00
  const totalPedidos = 42
  const ticketMedio = vendasConfirmadas / (totalPedidos || 1)
  const atingimentoMeta = (vendasConfirmadas / metaMes) * 100

  // Dados para Histórico Mensal (Storytelling de evolução)
  const evolucaoMeses = [
    { mes: 'Mai/26', vendas: 54200, meta: 50000, taxa: 108 },
    { mes: 'Jun/26', vendas: 62100, meta: 60000, taxa: 103 },
    { mes: 'Jul/26', vendas: 71500, meta: 75000, taxa: 95 },
    { mes: 'Ago/26', vendas: 84900, meta: 80000, taxa: 106 },
    { mes: 'Set/26', vendas: 91400, meta: 90000, taxa: 101 },
    { mes: 'Out/26', vendas: 98631, meta: 120000, taxa: 82 },
  ]

  // Mix de Produtos Mais Vendidos
  const produtosDestaque = [
    { nome: 'Colchão Queen Bio Quântico', qtd: 14, valor: 42000, fatia: 42 },
    { nome: 'Colchão Casal Magnético', qtd: 11, valor: 28600, fatia: 29 },
    { nome: 'Travesseiro Cervical Ergonômico', qtd: 26, valor: 10400, fatia: 11 },
    { nome: 'Tênis FN1 Ortopédico', qtd: 18, valor: 8820, fatia: 9 },
    { nome: 'Acessórios & Terapias', qtd: 15, valor: 8811, fatia: 9 },
  ]

  // Canal de Aquisição / Origem das Vendas
  const origensVendas = [
    { name: 'Indicação de Clientes', value: 45, color: '#16A34A' },
    { name: 'Visitas Comerciais (Presencial)', value: 35, color: '#2563EB' },
    { name: 'Redes Sociais & WhatsApp', value: 15, color: '#9333EA' },
    { name: 'Outros Canais', value: 5, color: '#D97706' },
  ]

  return (
    <div style={{ padding: '24px', maxWidth: 1200, margin: '0 auto', fontFamily: 'inherit' }}>
      {/* ── HEADER DA HISTÓRIA COMERCIAL ───────────────────────────── */}
      <div style={{ marginBottom: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ background: '#EFF6FF', border: '1.5px solid #BFDBFE', padding: '10px', borderRadius: 12 }}>
              <TrendingUp size={24} color="#1D4ED8" />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#0F172A' }}>
                Painel Comercial & Storytelling de Vendas
              </h1>
              <p style={{ margin: '3px 0 0', fontSize: 13, color: '#64748B' }}>
                Análise narrativa de crescimento, evolução das metas e comportamento de faturamento.
              </p>
            </div>
          </div>
        </div>

        {/* Filtro de Período */}
        <div style={{ display: 'flex', background: '#E2E8F0', padding: 4, borderRadius: 10 }}>
          <button
            onClick={() => setPeriodo('mes')}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              border: 'none',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              background: periodo === 'mes' ? '#FFFFFF' : 'transparent',
              color: periodo === 'mes' ? '#0F172A' : '#64748B',
              boxShadow: periodo === 'mes' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            Mês Atual
          </button>
          <button
            onClick={() => setPeriodo('ano')}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              border: 'none',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              background: periodo === 'ano' ? '#FFFFFF' : 'transparent',
              color: periodo === 'ano' ? '#0F172A' : '#64748B',
              boxShadow: periodo === 'ano' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            Ano 2026
          </button>
          <button
            onClick={() => setPeriodo('tudo')}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              border: 'none',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              background: periodo === 'tudo' ? '#FFFFFF' : 'transparent',
              color: periodo === 'tudo' ? '#0F172A' : '#64748B',
              boxShadow: periodo === 'tudo' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            Histórico Completo
          </button>
        </div>
      </div>

      {/* ── HISTÓRIA EXECUTIVA (STORYTELLING BANNER) ────────────────── */}
      <div
        style={{
          background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
          borderRadius: 20,
          padding: '24px 28px',
          color: '#FFFFFF',
          marginBottom: 28,
          boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.25)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, background: '#16A34A33', border: '1px solid #16A34A66', fontSize: 11, fontWeight: 800, color: '#4ADE80', textTransform: 'uppercase' }}>
            <Sparkles size={13} />
            Insight Comercial
          </span>
          <span style={{ fontSize: 12, color: '#94A3B8' }}>Atualizado em tempo real</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24, alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, lineHeight: 1.3 }}>
              Crescimento constante: faturamento já atingiu {fmt(vendasConfirmadas)}
            </h2>
            <p style={{ margin: '8px 0 0', fontSize: 13, color: '#CBD5E1', lineHeight: 1.6 }}>
              O ritmo comercial demonstra alta conversão de ticket alto, liderado pelos colchões tecnológicos. Você já completou <strong>{atingimentoMeta.toFixed(1)}%</strong> da meta estipulada para o ciclo.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 16, background: '#FFFFFF0D', padding: '16px 20px', borderRadius: 14, border: '1px solid #FFFFFF1A' }}>
            <div>
              <p style={{ margin: 0, fontSize: 11, color: '#94A3B8', fontWeight: 700, textTransform: 'uppercase' }}>Meta do Ciclo</p>
              <p style={{ margin: '4px 0 0', fontSize: 20, fontWeight: 900, color: '#FFFFFF' }}>{fmt(metaMes)}</p>
              <div style={{ marginTop: 8, height: 6, width: 140, background: '#334155', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(100, atingimentoMeta)}%`, background: '#22C55E', borderRadius: 10 }} />
              </div>
            </div>
            <div style={{ borderLeft: '1px solid #FFFFFF1A', paddingLeft: 16 }}>
              <p style={{ margin: 0, fontSize: 11, color: '#94A3B8', fontWeight: 700, textTransform: 'uppercase' }}>Ticket Médio</p>
              <p style={{ margin: '4px 0 0', fontSize: 20, fontWeight: 900, color: '#38BDF8' }}>{fmt(ticketMedio)}</p>
              <p style={{ margin: '4px 0 0', fontSize: 11, color: '#94A3B8' }}>em {totalPedidos} negociações</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── CARDS DE KPIS NARRATIVOS ───────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 28 }}>
        <div style={{ background: '#FFFFFF', padding: '18px 20px', borderRadius: 16, border: '1.5px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>Faturamento Realizado</span>
            <span style={{ padding: 6, borderRadius: 8, background: '#EFF6FF', color: '#1D4ED8' }}><DollarSign size={16} /></span>
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 22, fontWeight: 900, color: '#0F172A' }}>{fmt(vendasConfirmadas)}</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, fontSize: 12, color: '#16A34A', fontWeight: 700 }}>
            <ArrowUpRight size={14} /> +8.2% vs. mês anterior
          </div>
        </div>

        <div style={{ background: '#FFFFFF', padding: '18px 20px', borderRadius: 16, border: '1.5px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>Total de Pedidos</span>
            <span style={{ padding: 6, borderRadius: 8, background: '#F0FDF4', color: '#16A34A' }}><ShoppingBag size={16} /></span>
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 22, fontWeight: 900, color: '#0F172A' }}>{totalPedidos}</p>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: '#64748B', fontWeight: 500 }}>pedidos faturados e confirmados</p>
        </div>

        <div style={{ background: '#FFFFFF', padding: '18px 20px', borderRadius: 16, border: '1.5px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>Ticket Médio por Venda</span>
            <span style={{ padding: 6, borderRadius: 8, background: '#FAF5FF', color: '#9333EA' }}><Award size={16} /></span>
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 22, fontWeight: 900, color: '#0F172A' }}>{fmt(ticketMedio)}</p>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: '#64748B', fontWeight: 500 }}>foco em produtos de alto valor agregado</p>
        </div>

        <div style={{ background: '#FFFFFF', padding: '18px 20px', borderRadius: 16, border: '1.5px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>Atingimento da Meta</span>
            <span style={{ padding: 6, borderRadius: 8, background: '#FFFBEB', color: '#D97706' }}><Target size={16} /></span>
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 22, fontWeight: 900, color: '#0F172A' }}>{atingimentoMeta.toFixed(1)}%</p>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: '#D97706', fontWeight: 700 }}>
            Faltam {fmt(Math.max(0, metaMes - vendasConfirmadas))}
          </p>
        </div>
      </div>

      {/* ── EVOLUÇÃO TEMPORAL (STORYTELLING DE VENDAS X METAS) ──────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 20, marginBottom: 28 }}>
        {/* Gráfico de Evolução */}
        <div style={{ background: '#FFFFFF', padding: '22px 24px', borderRadius: 18, border: '1.5px solid #E2E8F0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0F172A' }}>Evolução de Faturamento x Meta</h3>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748B' }}>Histórico dos últimos 6 meses</p>
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 8px', borderRadius: 6, background: '#F1F5F9', color: '#475569' }}>
              Mês a Mês
            </span>
          </div>

          <div style={{ height: 260, width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={evolucaoMeses} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} tickFormatter={(v) => `R$${v / 1000}k`} />
                <Tooltip
                  formatter={(value: any) => [fmt(Number(value)), '']}
                  labelFormatter={(lbl) => `Período: ${lbl}`}
                  contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #E2E8F0' }}
                />
                <Bar dataKey="meta" fill="#E2E8F0" radius={[4, 4, 0, 0]} name="Meta Planejada" maxBarSize={32} />
                <Bar dataKey="vendas" fill="#2563EB" radius={[4, 4, 0, 0]} name="Vendas Confirmadas" maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 12, fontSize: 11, color: '#64748B' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: '#2563EB' }} /> Vendas Realizadas
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: '#E2E8F0' }} /> Meta Mensal
            </span>
          </div>
        </div>

        {/* Origem das Vendas & Canais de Conversão */}
        <div style={{ background: '#FFFFFF', padding: '22px 24px', borderRadius: 18, border: '1.5px solid #E2E8F0', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0F172A' }}>Canais e Origens de Conversão</h3>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748B' }}>De onde vieram os clientes compradores</p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, margin: '14px 0', flexWrap: 'wrap' }}>
            <div style={{ width: 160, height: 160 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={origensVendas}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {origensVendas.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: any) => [`${v}%`, 'Participação']} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {origensVendas.map((o) => (
                <div key={o.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: o.color }} />
                  <span style={{ color: '#334155', fontWeight: 600 }}>{o.name}</span>
                  <span style={{ color: '#64748B', fontWeight: 700, marginLeft: 'auto' }}>{o.value}%</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: '#F8FAFC', padding: '12px 14px', borderRadius: 10, fontSize: 12, color: '#475569', lineHeight: 1.5 }}>
            💡 <strong>Ponto de Atenção:</strong> As indicações e contatos presenciais respondem por 80% do volume. Fortalecer pós-venda para incentivar indicações contínuas.
          </div>
        </div>
      </div>

      {/* ── PRODUTOS DE MAIOR IMPACTO NO FATURAMENTO ───────────────── */}
      <div style={{ background: '#FFFFFF', padding: '24px', borderRadius: 18, border: '1.5px solid #E2E8F0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0F172A' }}>Mix de Produtos mais Vendidos</h3>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748B' }}>Produtos líderes que puxam o faturamento da empresa</p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {produtosDestaque.map((p, idx) => (
            <div
              key={p.nome}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                borderRadius: 12,
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    background: idx === 0 ? '#FEF08A' : idx === 1 ? '#E2E8F0' : '#FFFFFF',
                    color: '#0F172A',
                    fontSize: 12,
                    fontWeight: 900,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1px solid #CBD5E1',
                  }}
                >
                  #{idx + 1}
                </span>
                <div>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{p.nome}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: '#64748B' }}>{p.qtd} unidades negociadas</p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#0F172A' }}>{fmt(p.valor)}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: '#16A34A', fontWeight: 700 }}>{p.fatia}% do faturamento</p>
                </div>

                <div style={{ width: 80, height: 6, background: '#E2E8F0', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${p.fatia}%`, background: '#2563EB', borderRadius: 4 }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
