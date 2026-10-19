import { useState, useEffect } from 'react'
import {
  ShieldCheck,
  Check,
  Sliders,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react'
import {
  listRolesConfig,
  saveRoleConfig,
  RoleConfig,
  V2Role,
  MODULOS_INFO,
} from '../../services/v2PermissionsService'
import { registrarAuditoria } from '../../services/v2AuditoriaService'
import { getCurrentV2User } from '../../services/v2AuthService'

export function V2SettingsPapeis() {
  const [roles, setRoles] = useState<Record<V2Role, RoleConfig> | null>(null)
  const [selectedRoleKey, setSelectedRoleKey] = useState<V2Role>('vendedor')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const currentUser = getCurrentV2User()
  const nomeUsuario = currentUser?.full_name?.split(' ')[0] || currentUser?.username || 'Leonardo'

  useEffect(() => {
    async function load() {
      const data = await listRolesConfig()
      setRoles(data)
    }
    load()
  }, [])

  if (!roles) {
    return <div className="p-8 text-center text-slate-400 text-sm">Carregando permissões...</div>
  }

  const activeRole = roles[selectedRoleKey]

  const handleToggleModulePermission = (
    moduleKey: keyof RoleConfig['modulos'],
    field: 'ver' | 'criar_editar' | 'excluir_cancelar'
  ) => {
    setRoles((prev) => {
      if (!prev) return prev
      const currentVal = prev[selectedRoleKey].modulos[moduleKey][field]
      return {
        ...prev,
        [selectedRoleKey]: {
          ...prev[selectedRoleKey],
          modulos: {
            ...prev[selectedRoleKey].modulos,
            [moduleKey]: {
              ...prev[selectedRoleKey].modulos[moduleKey],
              [field]: !currentVal,
            },
          },
        },
      }
    })
  }

  const handleToggleSpecialPermission = (field: keyof RoleConfig['permissoes_especiais']) => {
    setRoles((prev) => {
      if (!prev) return prev
      const currentVal = Boolean(prev[selectedRoleKey].permissoes_especiais[field])
      return {
        ...prev,
        [selectedRoleKey]: {
          ...prev[selectedRoleKey],
          permissoes_especiais: {
            ...prev[selectedRoleKey].permissoes_especiais,
            [field]: !currentVal,
          },
        },
      }
    })
  }

  const handleNumberChange = (
    field: 'desconto_maximo' | 'ajuste_manual_maximo',
    value: number
  ) => {
    setRoles((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        [selectedRoleKey]: {
          ...prev[selectedRoleKey],
          permissoes_especiais: {
            ...prev[selectedRoleKey].permissoes_especiais,
            [field]: value,
          },
        },
      }
    })
  }

  const handleSalvar = async () => {
    setSaving(true)
    try {
      await saveRoleConfig(activeRole)

      // Registrar auditoria da alteração de permissão
      await registrarAuditoria({
        usuario_nome: nomeUsuario,
        area: 'Permissão',
        objeto: `Papel ${activeRole.nome}`,
        o_que_mudou: `Permissões de ${activeRole.nome} salvas`,
        detalhe: {
          acao_titulo: 'Alteração em papel e permissões',
          subtitulo: `Papel ${activeRole.nome}`,
          mudancas: [
            {
              campo: 'Ver custo e margem',
              antes: '—',
              depois: activeRole.permissoes_especiais.ver_custo_margem ? 'Ligado' : 'Desligado',
            },
            {
              campo: 'Desconto máximo',
              antes: '—',
              depois: `${activeRole.permissoes_especiais.desconto_maximo}%`,
            },
          ],
          campos_extras: [
            { label: 'Usuário responsável', valor: nomeUsuario },
            { label: 'Data e hora', valor: new Date().toLocaleString('pt-BR') },
          ],
          link_objeto: '/v2/configuracoes?tab=papeis',
        },
      })

      setToast({ type: 'success', text: `Permissões de ${activeRole.nome} salvas com sucesso!` })
      setTimeout(() => setToast(null), 3500)
    } catch {
      setToast({ type: 'error', text: 'Erro ao salvar permissões.' })
    } finally {
      setSaving(false)
    }
  }

  const roleKeys: V2Role[] = ['administrador', 'vendedor', 'financeiro', 'estoque']

  return (
    <div className="space-y-6">
      {/* Container Principal: 2 Colunas no Desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ── SUB-COLUNA ESQUERDA: LISTA DE PAPÉIS ── */}
        <div className="lg:col-span-4 space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-1">
            PAPÉIS
          </p>

          <div className="space-y-2">
            {roleKeys.map((key) => {
              const r = roles[key]
              const isSelected = selectedRoleKey === key

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedRoleKey(key)}
                  className={`w-full p-4 rounded-2xl text-left transition flex items-center justify-between border ${
                    isSelected
                      ? 'bg-sky-50/70 border-sky-400 shadow-xs'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div>
                    <p className="font-black text-slate-900 text-sm leading-tight">{r.nome}</p>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">{r.usuarios_resumo}</p>
                  </div>
                  <ChevronRight
                    className={`h-4 w-4 shrink-0 transition ${
                      isSelected ? 'text-sky-700 translate-x-0.5' : 'text-slate-300'
                    }`}
                  />
                </button>
              )
            })}
          </div>

          <p className="text-xs text-slate-400 font-medium px-1 leading-relaxed">
            Os 4 papéis são fixos. Cada usuário recebe um papel em Empresa e usuários.
          </p>
        </div>

        {/* ── COLUNA DIREITA: MATRIZ DE ACESSO E PERMISSÕES ESPECIAIS ── */}
        <div className="lg:col-span-8 space-y-5">
          {/* Card 1: Acesso aos Módulos */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 sm:p-6 space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
              <div className="h-9 w-9 rounded-xl bg-sky-50 text-sky-700 flex items-center justify-center shrink-0 border border-sky-200">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-black text-slate-900 text-base leading-tight">{activeRole.nome}</h3>
                <p className="text-xs text-slate-400 font-medium">Acesso aos módulos</p>
              </div>
            </div>

            {/* Tabela de Acesso por Módulo */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-2">
                    <th className="py-2.5 font-bold">MÓDULO</th>
                    <th className="py-2.5 text-center font-bold">VER</th>
                    <th className="py-2.5 text-center font-bold">CRIAR E EDITAR</th>
                    <th className="py-2.5 text-center font-bold">EXCLUIR E CANCELAR</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(Object.keys(MODULOS_INFO) as (keyof RoleConfig['modulos'])[]).map((mKey) => {
                    const info = MODULOS_INFO[mKey]
                    const access = activeRole.modulos[mKey]

                    return (
                      <tr key={mKey} className="hover:bg-slate-50/60 transition">
                        <td className="py-3 font-bold text-slate-800 text-xs sm:text-sm">
                          {info.label}
                        </td>

                        {/* Coluna Ver */}
                        <td className="py-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleModulePermission(mKey, 'ver')}
                            className={`h-6 w-6 rounded-md inline-flex items-center justify-center transition border ${
                              access.ver
                                ? 'bg-emerald-600 border-emerald-600 text-white'
                                : 'border-slate-300 bg-white hover:border-slate-400'
                            }`}
                          >
                            {access.ver && <Check className="h-4 w-4 stroke-[3]" />}
                          </button>
                        </td>

                        {/* Coluna Criar e Editar */}
                        <td className="py-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleModulePermission(mKey, 'criar_editar')}
                            className={`h-6 w-6 rounded-md inline-flex items-center justify-center transition border ${
                              access.criar_editar
                                ? 'bg-emerald-600 border-emerald-600 text-white'
                                : 'border-slate-300 bg-white hover:border-slate-400'
                            }`}
                          >
                            {access.criar_editar && <Check className="h-4 w-4 stroke-[3]" />}
                          </button>
                        </td>

                        {/* Coluna Excluir e Cancelar */}
                        <td className="py-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleModulePermission(mKey, 'excluir_cancelar')}
                            className={`h-6 w-6 rounded-md inline-flex items-center justify-center transition border ${
                              access.excluir_cancelar
                                ? 'bg-emerald-600 border-emerald-600 text-white'
                                : 'border-slate-300 bg-white hover:border-slate-400'
                            }`}
                          >
                            {access.excluir_cancelar && <Check className="h-4 w-4 stroke-[3]" />}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Card 2: Permissões Especiais */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 sm:p-6 space-y-5">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
              <div className="h-9 w-9 rounded-xl bg-sky-50 text-sky-700 flex items-center justify-center shrink-0 border border-sky-200">
                <Sliders className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-black text-slate-900 text-base leading-tight">Permissões especiais</h3>
                <p className="text-xs text-slate-400 font-medium">Limites e ações sensíveis</p>
              </div>
            </div>

            <div className="space-y-4 divide-y divide-slate-100">
              {/* 1. Ver custo e margem */}
              <div className="flex items-center justify-between pt-3 gap-4">
                <div>
                  <p className="font-bold text-slate-900 text-sm">Ver custo e margem</p>
                  <p className="text-xs text-slate-500 font-medium">Mostra custo e margem estimada nas vendas e produtos</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleSpecialPermission('ver_custo_margem')}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition duration-200 shrink-0 ${
                    activeRole.permissoes_especiais.ver_custo_margem ? 'bg-sky-700' : 'bg-slate-300'
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition duration-200 ${
                      activeRole.permissoes_especiais.ver_custo_margem ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* 2. Desconto máximo */}
              <div className="flex items-center justify-between pt-3 gap-4">
                <div>
                  <p className="font-bold text-slate-900 text-sm">Desconto máximo</p>
                  <p className="text-xs text-slate-500 font-medium">Acima disso a venda precisa de um Administrador</p>
                </div>
                <div className="relative w-24 shrink-0">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={activeRole.permissoes_especiais.desconto_maximo}
                    onChange={(e) => handleNumberChange('desconto_maximo', parseFloat(e.target.value) || 0)}
                    className="w-full text-right pr-6 pl-3 py-1.5 rounded-xl border border-slate-200 font-bold text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    %
                  </span>
                </div>
              </div>

              {/* 3. Ajuste manual máximo */}
              <div className="flex items-center justify-between pt-3 gap-4">
                <div>
                  <p className="font-bold text-slate-900 text-sm">Ajuste manual máximo</p>
                  <p className="text-xs text-slate-500 font-medium">Valor máximo de arredondamento ou ajuste no total</p>
                </div>
                <div className="relative w-28 shrink-0">
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={activeRole.permissoes_especiais.ajuste_manual_maximo}
                    onChange={(e) => handleNumberChange('ajuste_manual_maximo', parseFloat(e.target.value) || 0)}
                    className="w-full text-right pr-3 pl-8 py-1.5 rounded-xl border border-slate-200 font-bold text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                  />
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    R$
                  </span>
                </div>
              </div>

              {/* 4. Aprovar venda com margem abaixo do mínimo */}
              <div className="flex items-center justify-between pt-3 gap-4">
                <div>
                  <p className="font-bold text-slate-900 text-sm">Aprovar venda com margem abaixo do mínimo</p>
                  <p className="text-xs text-slate-500 font-medium">Sem isso, a aprovação fica bloqueada</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleSpecialPermission('aprovar_margem_baixa')}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition duration-200 shrink-0 ${
                    activeRole.permissoes_especiais.aprovar_margem_baixa ? 'bg-sky-700' : 'bg-slate-300'
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition duration-200 ${
                      activeRole.permissoes_especiais.aprovar_margem_baixa ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* 5. Ajustar estoque */}
              <div className="flex items-center justify-between pt-3 gap-4">
                <div>
                  <p className="font-bold text-slate-900 text-sm">Ajustar estoque</p>
                  <p className="text-xs text-slate-500 font-medium">Entradas, saídas e contagem manuais</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleSpecialPermission('ajustar_estoque')}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition duration-200 shrink-0 ${
                    activeRole.permissoes_especiais.ajustar_estoque ? 'bg-sky-700' : 'bg-slate-300'
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition duration-200 ${
                      activeRole.permissoes_especiais.ajustar_estoque ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* 6. Estornar baixa e excluir lançamento */}
              <div className="flex items-center justify-between pt-3 gap-4">
                <div>
                  <p className="font-bold text-slate-900 text-sm">Estornar baixa e excluir lançamento</p>
                  <p className="text-xs text-slate-500 font-medium">Ações sensíveis do Financeiro</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleSpecialPermission('estornar_excluir_financeiro')}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition duration-200 shrink-0 ${
                    activeRole.permissoes_especiais.estornar_excluir_financeiro ? 'bg-sky-700' : 'bg-slate-300'
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition duration-200 ${
                      activeRole.permissoes_especiais.estornar_excluir_financeiro ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* 7. Ver auditoria */}
              <div className="flex items-center justify-between pt-3 gap-4">
                <div>
                  <p className="font-bold text-slate-900 text-sm">Ver auditoria</p>
                  <p className="text-xs text-slate-500 font-medium">Histórico de alterações do sistema</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleSpecialPermission('ver_auditoria')}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition duration-200 shrink-0 ${
                    activeRole.permissoes_especiais.ver_auditoria ? 'bg-sky-700' : 'bg-slate-300'
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition duration-200 ${
                      activeRole.permissoes_especiais.ver_auditoria ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Botão de Salvar Permissões (Verde) */}
          <div className="flex justify-end pt-2">
            <button
              type="button"
              disabled={saving}
              onClick={handleSalvar}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm bg-emerald-700 text-white hover:bg-emerald-800 transition shadow-xs disabled:opacity-50"
            >
              <Check className="h-4 w-4 stroke-[3]" />
              {saving ? 'Salvando...' : 'Salvar permissões'}
            </button>
          </div>
        </div>
      </div>

      {/* Toast Alert */}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2.5 px-5 py-3 rounded-2xl shadow-xl text-xs font-bold z-50 transition-all ${
            toast.type === 'success' ? 'bg-emerald-800 text-white' : 'bg-rose-800 text-white'
          }`}
        >
          {toast.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {toast.text}
        </div>
      )}
    </div>
  )
}
