import { supabase } from '../../lib/supabaseClient'

export type V2Role = 'administrador' | 'vendedor' | 'financeiro' | 'estoque'

export interface ModuleAccess {
  ver: boolean
  criar_editar: boolean
  excluir_cancelar: boolean
}

export interface SpecialPermissions {
  ver_custo_margem: boolean
  desconto_maximo: number // em % (ex: 10)
  ajuste_manual_maximo: number // em R$ (ex: 5.00)
  aprovar_margem_baixa: boolean
  ajustar_estoque: boolean
  estornar_excluir_financeiro: boolean
  ver_auditoria: boolean
}

export interface RoleConfig {
  id: V2Role
  nome: string
  subtitulo: string
  usuarios_resumo: string
  modulos: {
    clientes_crm: ModuleAccess
    propostas_vendas: ModuleAccess
    produtos_tabelas: ModuleAccess
    estoque: ModuleAccess
    pedidos_compra: ModuleAccess
    financeiro: ModuleAccess
    configuracoes: ModuleAccess
  }
  permissoes_especiais: SpecialPermissions
}

export const MODULOS_INFO: Record<string, { label: string; desc: string }> = {
  clientes_crm: { label: 'Clientes e CRM', desc: 'Contatos, ficha e relacionamento' },
  propostas_vendas: { label: 'Propostas e vendas', desc: 'Orçamentos e pedidos comerciais' },
  produtos_tabelas: { label: 'Produtos e tabelas de preço', desc: 'Catálogo e preços de venda' },
  estoque: { label: 'Estoque', desc: 'Posição física e movimentações' },
  pedidos_compra: { label: 'Pedidos de compra', desc: 'Aquisição com fornecedores' },
  financeiro: { label: 'Financeiro', desc: 'Contas a pagar e extrato de baixas' },
  configuracoes: { label: 'Configurações', desc: 'Parâmetros, papéis e empresa' },
}

export const DEFAULT_ROLES_CONFIG: Record<V2Role, RoleConfig> = {
  administrador: {
    id: 'administrador',
    nome: 'Administrador',
    subtitulo: 'Acesso total ao sistema',
    usuarios_resumo: 'Acesso total · Leonardo',
    modulos: {
      clientes_crm: { ver: true, criar_editar: true, excluir_cancelar: true },
      propostas_vendas: { ver: true, criar_editar: true, excluir_cancelar: true },
      produtos_tabelas: { ver: true, criar_editar: true, excluir_cancelar: true },
      estoque: { ver: true, criar_editar: true, excluir_cancelar: true },
      pedidos_compra: { ver: true, criar_editar: true, excluir_cancelar: true },
      financeiro: { ver: true, criar_editar: true, excluir_cancelar: true },
      configuracoes: { ver: true, criar_editar: true, excluir_cancelar: true },
    },
    permissoes_especiais: {
      ver_custo_margem: true,
      desconto_maximo: 100,
      ajuste_manual_maximo: 99999,
      aprovar_margem_baixa: true,
      ajustar_estoque: true,
      estornar_excluir_financeiro: true,
      ver_auditoria: true,
    },
  },
  vendedor: {
    id: 'vendedor',
    nome: 'Vendedor',
    subtitulo: 'Acesso comercial e atendimento a clientes',
    usuarios_resumo: 'Vende e acompanha clientes · Maria',
    modulos: {
      clientes_crm: { ver: true, criar_editar: true, excluir_cancelar: false },
      propostas_vendas: { ver: true, criar_editar: true, excluir_cancelar: false },
      produtos_tabelas: { ver: true, criar_editar: false, excluir_cancelar: false },
      estoque: { ver: true, criar_editar: false, excluir_cancelar: false },
      pedidos_compra: { ver: false, criar_editar: false, excluir_cancelar: false },
      financeiro: { ver: false, criar_editar: false, excluir_cancelar: false },
      configuracoes: { ver: false, criar_editar: false, excluir_cancelar: false },
    },
    permissoes_especiais: {
      ver_custo_margem: false,
      desconto_maximo: 10,
      ajuste_manual_maximo: 5.0,
      aprovar_margem_baixa: false,
      ajustar_estoque: false,
      estornar_excluir_financeiro: false,
      ver_auditoria: false,
    },
  },
  financeiro: {
    id: 'financeiro',
    nome: 'Financeiro',
    subtitulo: 'Gestão de contas a pagar, baixas e repasses',
    usuarios_resumo: 'Compras e financeiro · —',
    modulos: {
      clientes_crm: { ver: true, criar_editar: false, excluir_cancelar: false },
      propostas_vendas: { ver: true, criar_editar: false, excluir_cancelar: false },
      produtos_tabelas: { ver: true, criar_editar: false, excluir_cancelar: false },
      estoque: { ver: true, criar_editar: false, excluir_cancelar: false },
      pedidos_compra: { ver: true, criar_editar: true, excluir_cancelar: false },
      financeiro: { ver: true, criar_editar: true, excluir_cancelar: true },
      configuracoes: { ver: false, criar_editar: false, excluir_cancelar: false },
    },
    permissoes_especiais: {
      ver_custo_margem: true,
      desconto_maximo: 15,
      ajuste_manual_maximo: 20.0,
      aprovar_margem_baixa: false,
      ajustar_estoque: false,
      estornar_excluir_financeiro: true,
      ver_auditoria: true,
    },
  },
  estoque: {
    id: 'estoque',
    nome: 'Estoque',
    subtitulo: 'Entrada de mercadorias, expedição e conferência',
    usuarios_resumo: 'Recebe e ajusta estoque · —',
    modulos: {
      clientes_crm: { ver: false, criar_editar: false, excluir_cancelar: false },
      propostas_vendas: { ver: true, criar_editar: false, excluir_cancelar: false },
      produtos_tabelas: { ver: true, criar_editar: false, excluir_cancelar: false },
      estoque: { ver: true, criar_editar: true, excluir_cancelar: false },
      pedidos_compra: { ver: true, criar_editar: true, excluir_cancelar: false },
      financeiro: { ver: false, criar_editar: false, excluir_cancelar: false },
      configuracoes: { ver: false, criar_editar: false, excluir_cancelar: false },
    },
    permissoes_especiais: {
      ver_custo_margem: false,
      desconto_maximo: 0,
      ajuste_manual_maximo: 0,
      aprovar_margem_baixa: false,
      ajustar_estoque: true,
      estornar_excluir_financeiro: false,
      ver_auditoria: false,
    },
  },
}

const STORAGE_KEY = 'v2_papeis_configuracoes'
const SUPABASE_TABLE = 'v2_papeis_permissoes'

export async function listRolesConfig(): Promise<Record<V2Role, RoleConfig>> {
  let result = { ...DEFAULT_ROLES_CONFIG }

  if (supabase) {
    try {
      const { data, error } = await supabase.from(SUPABASE_TABLE).select('*')
      if (!error && data && data.length > 0) {
        data.forEach((row: any) => {
          if (row.id in result) {
            const roleKey = row.id as V2Role
            result[roleKey] = {
              ...result[roleKey],
              nome: row.nome || result[roleKey].nome,
              subtitulo: row.descricao || result[roleKey].subtitulo,
              modulos: row.modulos || result[roleKey].modulos,
              permissoes_especiais: row.permissoes_especiais || result[roleKey].permissoes_especiais,
            }
          }
        })
        return result
      }
    } catch {}
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return { ...DEFAULT_ROLES_CONFIG, ...parsed }
    }
  } catch {}

  return result
}

export async function saveRoleConfig(config: RoleConfig): Promise<void> {
  const all = await listRolesConfig()
  all[config.id] = config

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {}

  if (supabase) {
    try {
      await supabase.from(SUPABASE_TABLE).upsert({
        id: config.id,
        nome: config.nome,
        descricao: config.subtitulo,
        modulos: config.modulos,
        permissoes_especiais: config.permissoes_especiais,
        updated_at: new Date().toISOString(),
      })
    } catch {}
  }
}
