import { useState } from 'react'
import {
  Tag,
  Building2,
  DollarSign,
  Plus,
  Search,
  X,
  Check,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'

type TipoTag = 'livre' | 'conta_financeira' | 'categoria_despesa'

interface TagItem {
  id: string
  tipo: TipoTag
  nome: string
  ativa: boolean
  usos?: number
}

const TIPO_CONFIG: Record<
  TipoTag,
  { label: string; color: string; bg: string; icon: React.ReactNode; descricao: string }
> = {
  livre: {
    label: 'Tag livre',
    color: '#7C3AED',
    bg: '#F5F3FF',
    icon: <Tag className="h-5 w-5" />,
    descricao: 'Organização e filtros gerais',
  },
  conta_financeira: {
    label: 'Conta financeira',
    color: '#0D6BAF',
    bg: '#EFF6FF',
    icon: <Building2 className="h-5 w-5" />,
    descricao: 'Contas bancárias e de caixa',
  },
  categoria_despesa: {
    label: 'Categoria de despesa',
    color: '#DC2626',
    bg: '#FEF2F2',
    icon: <DollarSign className="h-5 w-5" />,
    descricao: 'Classificação de despesas',
  },
}

const INITIAL_TAGS: TagItem[] = [
  { id: '1', tipo: 'conta_financeira', nome: 'Banco do Brasil', ativa: true, usos: 12 },
  { id: '2', tipo: 'conta_financeira', nome: 'Nubank', ativa: true, usos: 5 },
  { id: '3', tipo: 'conta_financeira', nome: 'Caixa física', ativa: true, usos: 8 },
  { id: '4', tipo: 'categoria_despesa', nome: 'Mercadoria', ativa: true, usos: 24 },
  { id: '5', tipo: 'categoria_despesa', nome: 'Aluguel', ativa: true, usos: 10 },
  { id: '6', tipo: 'categoria_despesa', nome: 'Contabilidade', ativa: true, usos: 10 },
  { id: '7', tipo: 'categoria_despesa', nome: 'Marketing', ativa: true, usos: 3 },
  { id: '8', tipo: 'categoria_despesa', nome: 'Manutenção', ativa: false, usos: 1 },
  { id: '9', tipo: 'livre', nome: "Eko'7", ativa: true, usos: 18 },
  { id: '10', tipo: 'livre', nome: 'Bem Aviv', ativa: true, usos: 32 },
  { id: '11', tipo: 'livre', nome: 'Urgente', ativa: true, usos: 4 },
]

export function V2SettingsTags() {
  const [tags, setTags] = useState<TagItem[]>(() => {
    try {
      const raw = localStorage.getItem('v2_settings_tags')
      return raw ? JSON.parse(raw) : INITIAL_TAGS
    } catch {
      return INITIAL_TAGS
    }
  })

  const [busca, setBusca] = useState('')
  const [filtroTipo, setFiltroTipo] = useState<TipoTag | 'todas'>('todas')
  const [modalAberto, setModalAberto] = useState(false)
  const [editandoTag, setEditandoTag] = useState<TagItem | null>(null)

  // Campos do modal
  const [tipoModal, setTipoModal] = useState<TipoTag>('conta_financeira')
  const [nomeModal, setNomeModal] = useState('')
  const [ativaModal, setAtivaModal] = useState(true)

  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const saveToStorage = (novas: TagItem[]) => {
    setTags(novas)
    try {
      localStorage.setItem('v2_settings_tags', JSON.stringify(novas))
    } catch {}
  }

  const handleAbrirCriar = () => {
    setEditandoTag(null)
    setTipoModal('conta_financeira')
    setNomeModal('')
    setAtivaModal(true)
    setModalAberto(true)
  }

  const handleSalvarTag = () => {
    const limpo = nomeModal.trim().replace(/^#+/, '')
    if (!limpo) {
      setToast({ type: 'error', text: 'Informe o nome da tag.' })
      setTimeout(() => setToast(null), 3500)
      return
    }

    if (editandoTag) {
      const atualizadas = tags.map((t) =>
        t.id === editandoTag.id ? { ...t, tipo: tipoModal, nome: limpo, ativa: ativaModal } : t
      )
      saveToStorage(atualizadas)
      setToast({ type: 'success', text: 'Tag atualizada com sucesso!' })
    } else {
      const nova: TagItem = {
        id: `tag-${Date.now()}`,
        tipo: tipoModal,
        nome: limpo,
        ativa: ativaModal,
        usos: 0,
      }
      saveToStorage([nova, ...tags])
      setToast({ type: 'success', text: 'Tag criada com sucesso!' })
    }

    setTimeout(() => setToast(null), 3500)
    setModalAberto(false)
  }

  const handleToggleAtiva = (id: string) => {
    const atualizadas = tags.map((t) => (t.id === id ? { ...t, ativa: !t.ativa } : t))
    saveToStorage(atualizadas)
  }

  const tagsFiltradas = tags.filter((t) => {
    const matchBusca =
      !busca ||
      t.nome.toLowerCase().includes(busca.toLowerCase()) ||
      `#${t.nome}`.toLowerCase().includes(busca.toLowerCase())

    const matchTipo = filtroTipo === 'todas' || t.tipo === filtroTipo

    return matchBusca && matchTipo
  })

  const countPorTipo = (tipo: TipoTag) => tags.filter((t) => t.tipo === tipo).length

  return (
    <div className="space-y-6">
      {/* ── 3 CARDS DE TIPO DE TAG NO TOPO ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {(Object.entries(TIPO_CONFIG) as [TipoTag, typeof TIPO_CONFIG[TipoTag]][]).map(
          ([tipo, cfg]) => {
            const isSelected = filtroTipo === tipo
            return (
              <button
                key={tipo}
                type="button"
                onClick={() => setFiltroTipo(isSelected ? 'todas' : tipo)}
                className={`p-4 rounded-2xl text-left border transition ${
                  isSelected ? 'bg-sky-50/70 border-sky-400 shadow-xs' : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-1" style={{ color: cfg.color }}>
                  {cfg.icon}
                  <span className="text-[11px] font-black uppercase tracking-wider">{cfg.label}</span>
                </div>
                <p className="text-2xl font-black text-slate-900">{countPorTipo(tipo)}</p>
                <p className="text-xs text-slate-400 font-medium mt-0.5">{cfg.descricao}</p>
              </button>
            )
          }
        )}
      </div>

      {/* ── CARD PRINCIPAL COM TABELA E BUSCA ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center shrink-0 border border-purple-200">
              <Tag className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-black text-slate-900 text-base leading-tight">Tags</h3>
              <p className="text-xs text-slate-400 font-medium">Organize contas e despesas com etiquetas</p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleAbrirCriar}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs bg-purple-700 text-white hover:bg-purple-800 transition shadow-xs self-start sm:self-auto"
          >
            <Plus className="h-4 w-4" />
            Nova tag
          </button>
        </div>

        {/* Busca */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar tags..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 text-slate-800 placeholder-slate-400"
          />
        </div>

        {/* Lista / Tabela de Tags */}
        <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden">
          {tagsFiltradas.map((tag) => {
            const cfg = TIPO_CONFIG[tag.tipo]
            return (
              <div
                key={tag.id}
                className="p-3.5 flex items-center justify-between gap-4 hover:bg-slate-50/70 transition"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold"
                    style={{
                      background: cfg.bg,
                      color: cfg.color,
                      border: `1px solid ${cfg.color}33`,
                    }}
                  >
                    {cfg.icon}
                    #{tag.nome}
                  </span>
                  <span className="text-xs text-slate-400 font-medium hidden sm:inline">
                    {cfg.label}
                  </span>
                </div>

                <div className="flex items-center gap-4">
                  <span className="text-xs text-slate-400 font-medium">
                    {tag.usos || 0} usos
                  </span>
                  <button
                    type="button"
                    onClick={() => handleToggleAtiva(tag.id)}
                    className={`px-2.5 py-1 rounded-full text-xs font-bold transition border ${
                      tag.ativa
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-slate-100 text-slate-400 border-slate-200'
                    }`}
                  >
                    {tag.ativa ? 'Ativa' : 'Inativa'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── MODAL NOVA / EDITAR TAG ── */}
      {modalAberto && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex justify-end z-50 transition-opacity">
          <div className="bg-white w-full max-w-lg h-full overflow-y-auto flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
            {/* Header */}
            <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-4 sticky top-0 bg-white z-10">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-purple-700 text-white flex items-center justify-center shrink-0">
                  <Tag className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-900 leading-tight">
                    {editandoTag ? 'Editar tag' : 'Nova tag'}
                  </h2>
                  <p className="text-xs text-slate-400 font-medium">
                    Etiqueta para contas, despesas ou filtros
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setModalAberto(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Form */}
            <div className="p-5 flex-1 space-y-5">
              {/* Tipo de tag */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">Tipo de tag *</label>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.entries(TIPO_CONFIG) as [TipoTag, typeof TIPO_CONFIG[TipoTag]][]).map(
                    ([tipo, cfg]) => {
                      const isSelected = tipoModal === tipo
                      return (
                        <button
                          key={tipo}
                          type="button"
                          onClick={() => setTipoModal(tipo)}
                          className={`p-3 rounded-2xl text-center border transition flex flex-col items-center justify-center gap-1.5 ${
                            isSelected
                              ? 'bg-sky-50/70 border-sky-500 shadow-xs'
                              : 'bg-white border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <div style={{ color: cfg.color }}>{cfg.icon}</div>
                          <span
                            className="text-[11px] font-bold"
                            style={{ color: isSelected ? '#0369A1' : '#334155' }}
                          >
                            {cfg.label}
                          </span>
                        </button>
                      )
                    }
                  )}
                </div>
              </div>

              {/* Nome da tag */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">Nome da tag *</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">
                    #
                  </span>
                  <input
                    type="text"
                    value={nomeModal}
                    onChange={(e) => setNomeModal(e.target.value)}
                    placeholder="Mercado Pago"
                    className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                  />
                </div>
                <p className="text-[11px] text-slate-400 font-medium">
                  {tipoModal === 'conta_financeira'
                    ? 'Contas financeiras aparecem na baixa de lançamentos, com o saldo de cada uma.'
                    : tipoModal === 'categoria_despesa'
                    ? 'Categorias organizam o plano de contas e despesas operacionais.'
                    : 'Tags livres servem para agrupar clientes, propostas e produtos.'}
                </p>
              </div>

              {/* Tag Ativa Toggle */}
              <div className="flex items-center justify-between p-4 rounded-2xl border border-slate-200 bg-slate-50/70">
                <div>
                  <p className="font-bold text-slate-900 text-sm">Tag ativa</p>
                  <p className="text-xs text-slate-500 font-medium">Tags inativas não aparecem para escolha.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setAtivaModal(!ativaModal)}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition duration-200 shrink-0 ${
                    ativaModal ? 'bg-emerald-600' : 'bg-slate-300'
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition duration-200 ${
                      ativaModal ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3 sticky bottom-0">
              <button
                type="button"
                onClick={() => setModalAberto(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-100 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSalvarTag}
                className="px-5 py-2.5 rounded-xl bg-emerald-700 text-white font-bold text-xs hover:bg-emerald-800 transition flex items-center gap-1.5 shadow-xs"
              >
                <Check className="h-4 w-4 stroke-[3]" />
                Salvar tag
              </button>
            </div>
          </div>
        </div>
      )}

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
