/** Breadcrumb para o layout Hub (segmento / página atual). */

export type HubBreadcrumb = { segment: string; current: string }

const ROUTES: Array<{ prefix: string; segment: string; current: string }> = [
  { prefix: '/escolher-sistema', segment: 'Sistema', current: 'Escolher sistema' },
  { prefix: '/bem-aviv/follow-up/produtividade', segment: 'Hub', current: 'Produtividade' },
  { prefix: '/bem-aviv/follow-up/agendar', segment: 'Hub', current: 'Agendar follow-up' },
  { prefix: '/bem-aviv/follow-up', segment: 'Hub', current: 'Follow-up' },
  { prefix: '/bem-aviv/clientes', segment: 'Hub', current: 'Clientes' },
  { prefix: '/bem-aviv/pedidos/editar', segment: 'Hub', current: 'Editar pedido' },
  { prefix: '/bem-aviv/pedidos/novo', segment: 'Hub', current: 'Novo pedido' },
  { prefix: '/bem-aviv/pedidos', segment: 'Hub', current: 'Pedidos e orçamentos' },
  { prefix: '/bem-aviv/produtos-catalogo', segment: 'Hub', current: 'Produtos (catálogo)' },
  { prefix: '/bem-aviv/produtos', segment: 'Hub', current: 'Produtos' },
  { prefix: '/bem-aviv/categorias', segment: 'Hub', current: 'Categorias' },
  { prefix: '/bem-aviv/tabela-preco-catalogo', segment: 'Hub', current: 'Tabela de preço (catálogo)' },
  { prefix: '/bem-aviv/tabela-preco', segment: 'Hub', current: 'Tabela de preço Gold' },
  { prefix: '/bem-aviv/catalogos-preco', segment: 'Hub', current: 'Catálogos em grade' },
  { prefix: '/bem-aviv', segment: 'Hub', current: 'Visão geral' },
  { prefix: '/lsh/agenda', segment: 'Agenda', current: 'Agenda' },
  { prefix: '/lsh/tarefas', segment: 'Agenda', current: 'Tarefas' },
  { prefix: '/lsh/inicio', segment: 'Financeiro', current: 'Visão geral' },
  { prefix: '/lsh/resumo', segment: 'Financeiro', current: 'Visão geral' },
  { prefix: '/lsh/fluxo', segment: 'Financeiro', current: 'Movimentos financeiros' },
  { prefix: '/lsh/contas-bancarias', segment: 'Financeiro', current: 'Contas bancárias' },
  { prefix: '/lsh/categorias', segment: 'Financeiro', current: 'Categorias' },
  { prefix: '/lsh/cartoes', segment: 'Financeiro', current: 'Cartões' },
  { prefix: '/lsh', segment: 'Financeiro', current: 'Gestão financeira' },
  { prefix: '/projetos/kanban', segment: 'Projetos', current: 'Kanban' },
  { prefix: '/projetos/backlog', segment: 'Projetos', current: 'Backlog' },
  { prefix: '/projetos/clientes', segment: 'Projetos', current: 'Projetos / Clientes' },
  { prefix: '/projetos/responsaveis', segment: 'Projetos', current: 'Responsáveis' },
  { prefix: '/projetos/sprints', segment: 'Projetos', current: 'Sprints' },
  { prefix: '/projetos/atividades', segment: 'Projetos', current: 'Atividades' },
  { prefix: '/projetos/anotacoes', segment: 'Projetos', current: 'Anotações' },
  { prefix: '/projetos', segment: 'Projetos', current: 'Visão geral' },
]

export function getHubBreadcrumb(pathname: string): HubBreadcrumb {
  const ordered = [...ROUTES].sort((a, b) => b.prefix.length - a.prefix.length)
  for (const r of ordered) {
    if (pathname === r.prefix || pathname.startsWith(`${r.prefix}/`)) {
      return { segment: r.segment, current: r.current }
    }
  }
  return { segment: 'Sistema', current: 'Início' }
}
