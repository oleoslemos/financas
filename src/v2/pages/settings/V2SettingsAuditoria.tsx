import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FileText,
  Search,
  ChevronRight,
  X,
  Eye,
} from 'lucide-react'
import {
  listAuditoria,
  AuditoriaRegistro,
  AuditoriaArea,
} from '../../services/v2AuditoriaService'

type FiltroTab = 'tudo' | 'vendas' | 'estoque' | 'financeiro' | 'permissoes'

export function V2SettingsAuditoria() {
  const navigate = useNavigate()
  const [registros, setRegistros] = useState<AuditoriaRegistro[]>([])
  const [tabFiltro, setTabFiltro] = useState<FiltroTab>('tudo')
  const [busca, setBusca] = useState('')
  const [filtroUsuario, setFiltroUsuario] = useState('todos')
  const [filtroPeriodo, setFiltroPeriodo] = useState('outubro')

  // Drawer de Detalhe do Registro
  const [registroSelecionado, setRegistroSelecionado] = useState<AuditoriaRegistro | null>(null)

  useEffect(() => {
    async function load() {
      const data = await listAuditoria()
      setRegistros(data)
    }
    load()
  }, [])

  // Lista de usuários para o dropdown
  const usuarios = useMemo(() => {
    const set = new Set<string>()
    registros.forEach((r) => {
      if (r.usuario_nome) set.add(r.usuario_nome)
    })
    return Array.from(set).sort()
  }, [registros])

  // Contagens dos pills
  const contagens = useMemo(() => {
    return {
      tudo: registros.length,
      vendas: registros.filter((r) => r.area === 'Venda' || r.area === 'Desconto').length,
      estoque: registros.filter((r) => r.area === 'Estoque').length,
      financeiro: registros.filter((r) => r.area === 'Financeiro').length,
      permissoes: registros.filter((r) => r.area === 'Permissão' || r.area === 'Sistema').length,
    }
  }, [registros])

  // Filtragem
  const registrosFiltrados = useMemo(() => {
    return registros.filter((r) => {
      const matchBusca =
        !busca ||
        r.usuario_nome.toLowerCase().includes(busca.toLowerCase()) ||
        r.objeto.toLowerCase().includes(busca.toLowerCase()) ||
        r.o_que_mudou.toLowerCase().includes(busca.toLowerCase()) ||
        r.id.toLowerCase().includes(busca.toLowerCase())

      const matchUser = filtroUsuario === 'todos' || r.usuario_nome === filtroUsuario

      let matchTab = true
      if (tabFiltro === 'vendas') matchTab = r.area === 'Venda' || r.area === 'Desconto'
      if (tabFiltro === 'estoque') matchTab = r.area === 'Estoque'
      if (tabFiltro === 'financeiro') matchTab = r.area === 'Financeiro'
      if (tabFiltro === 'permissoes') matchTab = r.area === 'Permissão' || r.area === 'Sistema'

      return matchBusca && matchUser && matchTab
    })
  }, [registros, busca, filtroUsuario, tabFiltro])

  const renderAreaBadge = (area: AuditoriaArea) => {
    switch (area) {
      case 'Venda':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-sky-50 text-sky-700 border border-sky-200">
            Venda
          </span>
        )
      case 'Desconto':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
            Desconto
          </span>
        )
      case 'Estoque':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-orange-50 text-orange-800 border border-orange-200">
            Estoque
          </span>
        )
      case 'Financeiro':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            Financeiro
          </span>
        )
      case 'Permissão':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200">
            Permissão
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
            Sistema
          </span>
        )
    }
  }

  return (
    <div className="space-y-5">
      {/* ── CARD PRINCIPAL COM CABEÇALHO, FILTROS E TABELA ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 sm:p-6 space-y-5">
        {/* Cabeçalho da Seção */}
        <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
          <div className="h-9 w-9 rounded-xl bg-sky-50 text-sky-700 flex items-center justify-center shrink-0 border border-sky-200">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-black text-slate-900 text-base leading-tight">Auditoria</h3>
            <p className="text-xs text-slate-400 font-medium">
              Quem alterou o quê, quando e de qual valor para qual
            </p>
          </div>
        </div>

        {/* Tabs de Filtro de Área */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <button
            type="button"
            onClick={() => setTabFiltro('tudo')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 ${
              tabFiltro === 'tudo'
                ? 'bg-sky-700 text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            Tudo <span className={`text-[11px] px-1.5 py-0.2 rounded-full ${tabFiltro === 'tudo' ? 'bg-sky-800 text-white' : 'bg-slate-100 text-slate-600'}`}>{contagens.tudo}</span>
          </button>

          <button
            type="button"
            onClick={() => setTabFiltro('vendas')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 ${
              tabFiltro === 'vendas'
                ? 'bg-sky-700 text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            Vendas <span className={`text-[11px] px-1.5 py-0.2 rounded-full ${tabFiltro === 'vendas' ? 'bg-sky-800 text-white' : 'bg-sky-100 text-sky-800'}`}>{contagens.vendas}</span>
          </button>

          <button
            type="button"
            onClick={() => setTabFiltro('estoque')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 ${
              tabFiltro === 'estoque'
                ? 'bg-sky-700 text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            Estoque <span className={`text-[11px] px-1.5 py-0.2 rounded-full ${tabFiltro === 'estoque' ? 'bg-sky-800 text-white' : 'bg-orange-100 text-orange-800'}`}>{contagens.estoque}</span>
          </button>

          <button
            type="button"
            onClick={() => setTabFiltro('financeiro')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 ${
              tabFiltro === 'financeiro'
                ? 'bg-sky-700 text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            Financeiro <span className={`text-[11px] px-1.5 py-0.2 rounded-full ${tabFiltro === 'financeiro' ? 'bg-sky-800 text-white' : 'bg-emerald-100 text-emerald-800'}`}>{contagens.financeiro}</span>
          </button>

          <button
            type="button"
            onClick={() => setTabFiltro('permissoes')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 ${
              tabFiltro === 'permissoes'
                ? 'bg-sky-700 text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            Permissões <span className={`text-[11px] px-1.5 py-0.2 rounded-full ${tabFiltro === 'permissoes' ? 'bg-sky-800 text-white' : 'bg-purple-100 text-purple-800'}`}>{contagens.permissoes}</span>
          </button>
        </div>

        {/* Barra de Busca e Filtros Dropdown */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por usuário, venda ou produto"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/20 text-slate-800 placeholder-slate-400"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={filtroUsuario}
              onChange={(e) => setFiltroUsuario(e.target.value)}
              className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            >
              <option value="todos">Todos os usuários</option>
              {usuarios.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>

            <select
              value={filtroPeriodo}
              onChange={(e) => setFiltroPeriodo(e.target.value)}
              className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            >
              <option value="outubro">Período: Outubro</option>
              <option value="setembro">Período: Setembro</option>
              <option value="ano_2026">Ano: 2026</option>
            </select>
          </div>
        </div>

        {/* TABELA DE AUDITORIA (DESKTOP) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider pb-2">
                <th className="py-3 px-3">DATA</th>
                <th className="py-3 px-3">USUÁRIO</th>
                <th className="py-3 px-3 text-center">ÁREA</th>
                <th className="py-3 px-3">OBJETO</th>
                <th className="py-3 px-3">O QUE MUDOU</th>
                <th className="py-3 px-2 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {registrosFiltrados.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => setRegistroSelecionado(item)}
                  className="hover:bg-slate-50/80 cursor-pointer transition group"
                >
                  <td className="py-3.5 px-3 text-xs font-medium text-slate-500 whitespace-nowrap">
                    {item.data_hora}
                  </td>
                  <td className="py-3.5 px-3 font-bold text-slate-900">
                    {item.usuario_nome}
                  </td>
                  <td className="py-3.5 px-3 text-center">
                    {renderAreaBadge(item.area)}
                  </td>
                  <td className="py-3.5 px-3 font-bold text-slate-800 text-xs">
                    {item.objeto}
                  </td>
                  <td className="py-3.5 px-3 text-xs text-slate-600 font-medium">
                    {item.o_que_mudou}
                  </td>
                  <td className="py-3.5 px-2 text-right">
                    <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-sky-700 group-hover:translate-x-0.5 transition" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* LISTA DE AUDITORIA (MOBILE) - Conforme Configurações · Auditoria (celular).png */}
        <div className="md:hidden space-y-3">
          {registrosFiltrados.map((item) => (
            <div
              key={item.id}
              onClick={() => setRegistroSelecionado(item)}
              className="p-4 rounded-2xl border border-slate-200 bg-white shadow-xs cursor-pointer active:bg-slate-50 transition space-y-2"
            >
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>{item.data_hora} · <span className="font-semibold text-slate-600">{item.usuario_nome}</span></span>
                {renderAreaBadge(item.area)}
              </div>
              <p className="font-bold text-slate-900 text-sm">{item.objeto}</p>
              <p className="text-xs text-slate-600 font-medium leading-relaxed">{item.o_que_mudou}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Nota de rodapé da Auditoria */}
      <p className="text-xs text-slate-400 text-center sm:text-left px-1 font-medium leading-relaxed">
        O histórico é gravado automaticamente e não pode ser editado nem apagado. Só perfis com a permissão "Ver auditoria" acessam esta tela.
      </p>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* DRAWER: DETALHE DO REGISTRO DE AUDITORIA (Conforme screenshot) */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {registroSelecionado && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex justify-end z-50 transition-opacity">
          <div className="bg-white w-full max-w-lg h-full overflow-y-auto flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
            {/* Header Drawer */}
            <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-4 sticky top-0 bg-white z-10">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-sky-700 text-white flex items-center justify-center shrink-0">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-900 leading-tight">Detalhe do registro</h2>
                  <p className="text-xs text-slate-400 font-medium">Registro {registroSelecionado.id}</p>
                </div>
              </div>

              <button
                onClick={() => setRegistroSelecionado(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Conteúdo Drawer */}
            <div className="p-5 flex-1 space-y-6">
              {/* Card de Ação */}
              <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-1">
                <div className="flex items-center justify-between">
                  <h4 className="font-black text-slate-900 text-sm leading-tight">
                    {registroSelecionado.detalhe?.acao_titulo || registroSelecionado.o_que_mudou}
                  </h4>
                  {renderAreaBadge(registroSelecionado.area)}
                </div>
                <p className="text-xs text-slate-500 font-medium">
                  {registroSelecionado.detalhe?.subtitulo || registroSelecionado.objeto}
                </p>
              </div>

              {/* Seção O QUE MUDOU */}
              <div className="space-y-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  O QUE MUDOU
                </p>

                {registroSelecionado.detalhe?.mudancas && registroSelecionado.detalhe.mudancas.length > 0 ? (
                  <div className="rounded-2xl border border-slate-200 overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="bg-slate-50/80 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase">
                          <th className="py-2.5 px-3">CAMPO</th>
                          <th className="py-2.5 px-3 text-slate-500">ANTES</th>
                          <th className="py-2.5 px-3 text-slate-900 font-bold">DEPOIS</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {registroSelecionado.detalhe.mudancas.map((m, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="py-2.5 px-3 font-medium text-slate-600">{m.campo}</td>
                            <td className="py-2.5 px-3 text-slate-400 font-medium">{m.antes}</td>
                            <td className="py-2.5 px-3 font-black text-slate-900">{m.depois}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl">
                    {registroSelecionado.o_que_mudou}
                  </p>
                )}
              </div>

              {/* Detalhes Extras */}
              <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400 font-medium">Usuário</span>
                  <span className="font-bold text-slate-900">{registroSelecionado.usuario_nome}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-medium">Data e hora</span>
                  <span className="font-bold text-slate-900">{registroSelecionado.data_hora}</span>
                </div>
                {registroSelecionado.detalhe?.campos_extras?.map((c, i) => (
                  <div key={i} className="flex justify-between">
                    <span className="text-slate-400 font-medium">{c.label}</span>
                    <span className="font-bold text-slate-900">{c.valor}</span>
                  </div>
                ))}
              </div>

              {/* Disclaimer */}
              <p className="text-[11px] text-slate-400 leading-relaxed font-medium">
                Registro somente leitura. Para corrigir, faça um estorno ou novo ajuste, que também fica registrado.
              </p>
            </div>

            {/* Footer Drawer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3 sticky bottom-0">
              <button
                type="button"
                onClick={() => setRegistroSelecionado(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-100 transition"
              >
                Fechar
              </button>

              {registroSelecionado.detalhe?.link_objeto && (
                <button
                  type="button"
                  onClick={() => {
                    navigate(registroSelecionado.detalhe!.link_objeto!)
                  }}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-800 font-bold text-xs hover:bg-slate-100 transition flex items-center gap-1.5 shadow-xs"
                >
                  <Eye className="h-4 w-4 text-slate-600" />
                  Ver lançamento
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
