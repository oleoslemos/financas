import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getCurrentV2User } from '../services/v2AuthService'
import {
  listV2Products,
  saveV2Product,
  deleteV2Product,
  V2Product,
  ProductType,
  ProductCategory,
  ProductVariation,
  KitItem,
} from '../services/v2ProdutosService'
import {
  Package,
  Plus,
  Search,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Layers,
  Box,
  Boxes,
  ChevronDown,
  ChevronUp,
  DollarSign,
} from 'lucide-react'

function formatCurrency(val: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val)
}

function maskDimensions(w?: number | null, l?: number | null, h?: number | null): string {
  if (!w && !l && !h) return '—'
  const wStr = w ? `${(w / 100).toFixed(2).replace('.', ',')}m` : ''
  const lStr = l ? `${(l / 100).toFixed(2).replace('.', ',')}m` : ''
  const hStr = h ? `${h}cm` : ''
  return [wStr, lStr, hStr].filter(Boolean).join(' x ')
}

type Toast = { type: 'success' | 'error'; text: string }

export function V2ProdutosPage() {
  const navigate = useNavigate()

  useEffect(() => {
    if (!getCurrentV2User()) navigate('/v2/login', { replace: true })
  }, [navigate])

  const [products, setProducts] = useState<V2Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState<string>('TODOS')
  const [filterType, setFilterType] = useState<string>('TODOS')

  // Expanded rows state (for variations & kit items preview)
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({})

  // Toast state
  const [toast, setToast] = useState<Toast | null>(null)
  const showToast = (t: Toast) => {
    setToast(t)
    setTimeout(() => setToast(null), 4000)
  }

  // Load data
  const loadData = async () => {
    setLoading(true)
    const data = await listV2Products()
    setProducts(data)
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  const toggleRowExpand = (id: string) => {
    setExpandedRows((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  // ──────────────────────────────────────────────────────────────────────────
  // MODAL & FORM STATE
  // ──────────────────────────────────────────────────────────────────────────
  const [modalOpen, setModalOpen] = useState(false)
  const [editingProd, setEditingProd] = useState<V2Product | null>(null)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState<{
    code_sku: string
    name: string
    type: ProductType
    category: ProductCategory
    product_line: string
    model: string
    description: string
    unit: string
    cost_price: number
    sale_price: number
    dim_width_cm: string
    dim_length_cm: string
    dim_height_cm: string
    active: boolean
    variations: ProductVariation[]
    kit_items: KitItem[]
    kit_price_mode: 'AUTO' | 'MANUAL'
  }>({
    code_sku: '',
    name: '',
    type: 'SIMPLES',
    category: 'PLATAFORMA DE DESCANSO',
    product_line: 'SUPER PREMIUM',
    model: '',
    description: '',
    unit: 'UN',
    cost_price: 0,
    sale_price: 0,
    dim_width_cm: '',
    dim_length_cm: '',
    dim_height_cm: '',
    active: true,
    variations: [],
    kit_items: [],
    kit_price_mode: 'AUTO',
  })

  const openNewModal = () => {
    setEditingProd(null)
    const nextNum = products.length + 1
    const sku = `EKO-PRD-${String(nextNum).padStart(3, '0')}`

    setForm({
      code_sku: sku,
      name: '',
      type: 'SIMPLES',
      category: 'PLATAFORMA DE DESCANSO',
      product_line: 'SUPER PREMIUM',
      model: '',
      description: '',
      unit: 'UN',
      cost_price: 0,
      sale_price: 0,
      dim_width_cm: '',
      dim_length_cm: '',
      dim_height_cm: '',
      active: true,
      variations: [
        {
          id: 'v-1',
          name: 'Solteiro (0,78m x 1,88m x 41cm)',
          sku: `${sku}-SOL`,
          cost_price: 2000,
          sale_price: 4000,
          dim_width_cm: 78,
          dim_length_cm: 188,
          dim_height_cm: 41,
        },
        {
          id: 'v-2',
          name: 'Casal (1,38m x 1,88m x 41cm)',
          sku: `${sku}-CAS`,
          cost_price: 2400,
          sale_price: 4900,
          dim_width_cm: 138,
          dim_length_cm: 188,
          dim_height_cm: 41,
        },
      ],
      kit_items: [],
      kit_price_mode: 'AUTO',
    })
    setModalOpen(true)
  }

  const openEditModal = (p: V2Product) => {
    setEditingProd(p)
    setForm({
      code_sku: p.code_sku || '',
      name: p.name || '',
      type: p.type || 'SIMPLES',
      category: p.category || 'PLATAFORMA DE DESCANSO',
      product_line: p.product_line || 'SUPER PREMIUM',
      model: p.model || '',
      description: p.description || '',
      unit: p.unit || 'UN',
      cost_price: p.cost_price || 0,
      sale_price: p.sale_price || 0,
      dim_width_cm: p.dim_width_cm != null ? String(p.dim_width_cm) : '',
      dim_length_cm: p.dim_length_cm != null ? String(p.dim_length_cm) : '',
      dim_height_cm: p.dim_height_cm != null ? String(p.dim_height_cm) : '',
      active: p.active,
      variations: p.variations ? [...p.variations] : [],
      kit_items: p.kit_items ? [...p.kit_items] : [],
      kit_price_mode: p.kit_price_mode || 'AUTO',
    })
    setModalOpen(true)
  }

  // ── VARIATION FORM HELPERS ──
  const addVariationRow = () => {
    const count = form.variations.length + 1
    const newVar: ProductVariation = {
      id: 'v-' + Date.now() + '-' + count,
      name: `Nova Variação ${count}`,
      sku: `${form.code_sku || 'SKU'}-VAR${count}`,
      cost_price: form.cost_price || 0,
      sale_price: form.sale_price || 0,
      dim_width_cm: 138,
      dim_length_cm: 188,
      dim_height_cm: 41,
    }
    setForm((prev) => ({ ...prev, variations: [...prev.variations, newVar] }))
  }

  const updateVariationRow = (id: string, field: keyof ProductVariation, value: any) => {
    setForm((prev) => ({
      ...prev,
      variations: prev.variations.map((v) => (v.id === id ? { ...v, [field]: value } : v)),
    }))
  }

  const removeVariationRow = (id: string) => {
    setForm((prev) => ({
      ...prev,
      variations: prev.variations.filter((v) => v.id !== id),
    }))
  }

  // ── KIT ITEM FORM HELPERS ──
  const addKitItemRow = (selectedProdId: string) => {
    const prod = products.find((p) => p.id === selectedProdId)
    if (!prod) return

    const newItem: KitItem = {
      product_id: prod.id,
      product_name: prod.name,
      quantity: 1,
      unit_price: prod.sale_price,
    }
    setForm((prev) => {
      const updatedKit = [...prev.kit_items, newItem]
      // Recalculate auto kit sale price
      const autoPrice = updatedKit.reduce((sum, item) => sum + item.quantity * item.unit_price, 0)
      return {
        ...prev,
        kit_items: updatedKit,
        sale_price: prev.kit_price_mode === 'AUTO' ? autoPrice : prev.sale_price,
      }
    })
  }

  const updateKitItemRow = (index: number, quantity: number, unit_price: number) => {
    setForm((prev) => {
      const updatedKit = prev.kit_items.map((item, i) =>
        i === index ? { ...item, quantity, unit_price } : item
      )
      const autoPrice = updatedKit.reduce((sum, item) => sum + item.quantity * item.unit_price, 0)
      return {
        ...prev,
        kit_items: updatedKit,
        sale_price: prev.kit_price_mode === 'AUTO' ? autoPrice : prev.sale_price,
      }
    })
  }

  const removeKitItemRow = (index: number) => {
    setForm((prev) => {
      const updatedKit = prev.kit_items.filter((_, i) => i !== index)
      const autoPrice = updatedKit.reduce((sum, item) => sum + item.quantity * item.unit_price, 0)
      return {
        ...prev,
        kit_items: updatedKit,
        sale_price: prev.kit_price_mode === 'AUTO' ? autoPrice : prev.sale_price,
      }
    })
  }

  // Save product
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) {
      showToast({ type: 'error', text: 'Informe o nome do produto.' })
      return
    }

    if (form.type === 'VARIACAO' && form.variations.length === 0) {
      showToast({ type: 'error', text: 'Adicione ao menos 1 variação para o produto.' })
      return
    }

    if (form.type === 'KIT' && form.kit_items.length === 0) {
      showToast({ type: 'error', text: 'Adicione ao menos 1 item no kit.' })
      return
    }

    setSaving(true)

    // Calculate prices for variations or kits
    let finalSalePrice = form.sale_price
    let finalCostPrice = form.cost_price

    if (form.type === 'KIT' && form.kit_price_mode === 'AUTO') {
      finalSalePrice = form.kit_items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0)
    }

    await saveV2Product({
      ...(editingProd ? { id: editingProd.id } : {}),
      code_sku: form.code_sku,
      name: form.name,
      type: form.type,
      category: form.category,
      product_line: form.product_line,
      model: form.model,
      description: form.description,
      unit: form.unit,
      cost_price: finalCostPrice,
      sale_price: finalSalePrice,
      dim_width_cm: form.dim_width_cm ? parseFloat(form.dim_width_cm) : null,
      dim_length_cm: form.dim_length_cm ? parseFloat(form.dim_length_cm) : null,
      dim_height_cm: form.dim_height_cm ? parseFloat(form.dim_height_cm) : null,
      variations: form.type === 'VARIACAO' ? form.variations : undefined,
      kit_items: form.type === 'KIT' ? form.kit_items : undefined,
      kit_price_mode: form.kit_price_mode,
      active: form.active,
    })

    setSaving(false)
    setModalOpen(false)
    await loadData()
    showToast({
      type: 'success',
      text: editingProd ? 'Produto atualizado com sucesso!' : 'Produto cadastrado com sucesso!',
    })
  }

  const handleToggleActive = async (p: V2Product) => {
    await saveV2Product({ ...p, active: !p.active })
    await loadData()
    showToast({ type: 'success', text: `Produto ${!p.active ? 'ativado' : 'desativado'} com sucesso!` })
  }

  const handleDelete = async (id: string) => {
    if (window.confirm('Tem certeza que deseja remover este produto?')) {
      await deleteV2Product(id)
      await loadData()
      showToast({ type: 'success', text: 'Produto removido com sucesso.' })
    }
  }

  // Filtered products
  const filteredProducts = products.filter((p) => {
    const q = search.toLowerCase()
    const matchesSearch =
      p.name.toLowerCase().includes(q) ||
      (p.code_sku && p.code_sku.toLowerCase().includes(q)) ||
      (p.model && p.model.toLowerCase().includes(q)) ||
      (p.product_line && p.product_line.toLowerCase().includes(q))

    const matchesCategory = filterCategory === 'TODOS' || p.category === filterCategory
    const matchesType = filterType === 'TODOS' || p.type === filterType

    return matchesSearch && matchesCategory && matchesType
  })

  const categoryList: (ProductCategory | 'TODOS')[] = [
    'TODOS',
    'PLATAFORMA DE DESCANSO',
    'CABECEIRAS',
    'BASES / CAMAS',
    'ACESSÓRIOS',
    'OUTROS',
  ]

  const typeList: (ProductType | 'TODOS')[] = ['TODOS', 'SIMPLES', 'VARIACAO', 'KIT']

  return (
    <div
      className="min-h-screen font-sans pb-16"
      style={{ background: 'linear-gradient(135deg, #EEF5F9 0%, #F0F7EE 100%)' }}
    >
      {/* Background Blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div
          className="absolute -top-40 -left-40 w-96 h-96 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #0D6BAF, transparent 70%)' }}
        />
        <div
          className="absolute -bottom-40 -right-20 w-96 h-96 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #7DC344, transparent 70%)' }}
        />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Title Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight" style={{ color: '#1A2E1A' }}>
              Catálogo de Produtos
            </h1>
            <p className="text-sm font-medium mt-1" style={{ color: '#4A6A4A' }}>
              Cadastre e gerencie produtos simples, grupos com variações de medidas e kits promocionais.
            </p>
          </div>
          <button
            onClick={openNewModal}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition shadow-sm justify-center"
            style={{ background: '#0D6BAF' }}
          >
            <Plus className="h-4 w-4" />
            Novo Produto
          </button>
        </div>

        {/* ── TOP STATS BAR ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white p-4 rounded-2xl border border-blue-100 shadow-2xs flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <Box className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total de Produtos</p>
              <p className="text-xl font-black text-slate-900">{products.length}</p>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-purple-100 shadow-2xs flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Com Variações</p>
              <p className="text-xl font-black text-slate-900">
                {products.filter((p) => p.type === 'VARIACAO').length}
              </p>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-amber-100 shadow-2xs flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
              <Boxes className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Kits / Combos</p>
              <p className="text-xl font-black text-slate-900">
                {products.filter((p) => p.type === 'KIT').length}
              </p>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-emerald-100 shadow-2xs flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <DollarSign className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Valor em Catálogo</p>
              <p className="text-lg font-black text-emerald-800">
                {formatCurrency(
                  products.reduce((acc, p) => acc + (p.sale_price || 0), 0)
                )}
              </p>
            </div>
          </div>
        </div>

        {/* ── SEARCH & FILTER BAR ── */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
          <div className="flex flex-col md:flex-row items-center gap-3 justify-between">
            <div className="relative w-full md:w-96">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por nome, SKU, linha ou modelo..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl text-xs border border-slate-200 bg-slate-50 outline-none focus:border-blue-500"
              />
            </div>

            {/* Type selector pills */}
            <div className="flex items-center gap-1.5 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
              <span className="text-[11px] font-bold text-slate-400 mr-1 uppercase">Tipo:</span>
              {typeList.map((t) => (
                <button
                  key={t}
                  onClick={() => setFilterType(t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                    filterType === t
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {t === 'VARIACAO' ? 'VARIAÇÃO' : t}
                </button>
              ))}
            </div>
          </div>

          {/* Category Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pt-2 border-t border-slate-100">
            <span className="text-[11px] font-bold text-slate-400 mr-1 uppercase">Categoria:</span>
            {categoryList.map((cat) => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                className={`px-3 py-1 rounded-full text-xs font-bold transition whitespace-nowrap border ${
                  filterCategory === cat
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* ── PRODUCTS TABLE ── */}
        {loading ? (
          <div className="py-16 text-center bg-white rounded-2xl border border-slate-200">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600 mb-2" />
            <p className="text-sm font-medium text-slate-500">Carregando produtos...</p>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="py-16 text-center bg-white rounded-2xl border border-dashed border-slate-200">
            <Package className="h-10 w-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-600">Nenhum produto encontrado</p>
            <p className="text-xs text-slate-400 mt-1">Tente ajustar a busca ou adicionar um novo produto.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-black uppercase text-slate-500 tracking-wider">
                    <th className="p-3.5">SKU / Produto</th>
                    <th className="p-3.5">Tipo</th>
                    <th className="p-3.5">Categoria / Linha</th>
                    <th className="p-3.5">Dimensões</th>
                    <th className="p-3.5">Preço Custo</th>
                    <th className="p-3.5">Preço Venda</th>
                    <th className="p-3.5">Status</th>
                    <th className="p-3.5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                  {filteredProducts.map((p) => {
                    const isExpanded = expandedRows[p.id] || false
                    const hasDetails = (p.variations && p.variations.length > 0) || (p.kit_items && p.kit_items.length > 0)

                    return (
                      <React.Fragment key={p.id}>
                        <tr className="hover:bg-slate-50/80 transition">
                          <td className="p-3.5">
                            <div className="flex items-center gap-2">
                              {hasDetails && (
                                <button
                                  type="button"
                                  onClick={() => toggleRowExpand(p.id)}
                                  className="text-slate-400 hover:text-slate-700 p-0.5 rounded"
                                >
                                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                </button>
                              )}
                              <div>
                                <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded mr-2">
                                  {p.code_sku || 'SKU'}
                                </span>
                                <span className="font-bold text-slate-900 text-sm">{p.name}</span>
                              </div>
                            </div>
                          </td>

                          <td className="p-3.5">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border ${
                                p.type === 'SIMPLES'
                                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                                  : p.type === 'VARIACAO'
                                  ? 'bg-purple-50 text-purple-700 border-purple-200'
                                  : 'bg-amber-50 text-amber-700 border-amber-200'
                              }`}
                            >
                              {p.type === 'SIMPLES' && <Box className="h-3 w-3" />}
                              {p.type === 'VARIACAO' && <Layers className="h-3 w-3" />}
                              {p.type === 'KIT' && <Boxes className="h-3 w-3" />}
                              {p.type === 'VARIACAO' ? 'VARIAÇÃO' : p.type}
                            </span>
                          </td>

                          <td className="p-3.5">
                            <p className="font-bold text-slate-800">{p.category}</p>
                            {p.product_line && <p className="text-[10px] text-slate-400">{p.product_line}</p>}
                          </td>

                          <td className="p-3.5 text-slate-600">
                            {maskDimensions(p.dim_width_cm, p.dim_length_cm, p.dim_height_cm)}
                          </td>

                          <td className="p-3.5 font-medium text-slate-500">
                            {formatCurrency(p.cost_price || 0)}
                          </td>

                          <td className="p-3.5 font-bold text-emerald-700">
                            {formatCurrency(p.sale_price || 0)}
                          </td>

                          <td className="p-3.5">
                            <button
                              onClick={() => handleToggleActive(p)}
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider transition ${
                                p.active
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                  : 'bg-slate-100 text-slate-500 border border-slate-200'
                              }`}
                            >
                              {p.active ? 'Ativo' : 'Inativo'}
                            </button>
                          </td>

                          <td className="p-3.5 text-right space-x-2">
                            <button
                              onClick={() => openEditModal(p)}
                              className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition"
                              title="Editar Produto"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(p.id)}
                              className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 transition"
                              title="Excluir Produto"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>

                        {/* EXPANDABLE DETAILS ROW */}
                        {isExpanded && hasDetails && (
                          <tr className="bg-slate-50/70 border-b border-slate-200">
                            <td colSpan={8} className="p-4 pl-12">
                              {p.type === 'VARIACAO' && p.variations && (
                                <div className="space-y-2">
                                  <p className="text-[11px] font-black uppercase tracking-wider text-purple-800">
                                    Variações de Tamanho & Preço ({p.variations.length})
                                  </p>
                                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                    {p.variations.map((v) => (
                                      <div
                                        key={v.id}
                                        className="bg-white p-2.5 rounded-xl border border-purple-100 text-xs shadow-2xs flex justify-between items-center"
                                      >
                                        <div>
                                          <p className="font-bold text-slate-800">{v.name}</p>
                                          <p className="text-[10px] text-slate-400 font-mono">{v.sku}</p>
                                        </div>
                                        <div className="text-right">
                                          <p className="font-bold text-emerald-700">{formatCurrency(v.sale_price)}</p>
                                          <p className="text-[10px] text-slate-400 font-medium">
                                            Custo: {formatCurrency(v.cost_price)}
                                          </p>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {p.type === 'KIT' && p.kit_items && (
                                <div className="space-y-2">
                                  <p className="text-[11px] font-black uppercase tracking-wider text-amber-800">
                                    Itens Inclusos no Kit Combo ({p.kit_items.length})
                                  </p>
                                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                    {p.kit_items.map((item, idx) => (
                                      <div
                                        key={idx}
                                        className="bg-white p-2.5 rounded-xl border border-amber-100 text-xs shadow-2xs flex justify-between items-center"
                                      >
                                        <div>
                                          <p className="font-bold text-slate-800">{item.product_name}</p>
                                          <p className="text-[10px] font-semibold text-slate-500">
                                            Qtd: {item.quantity}x
                                          </p>
                                        </div>
                                        <div className="text-right">
                                          <p className="font-bold text-emerald-700">
                                            {formatCurrency(item.unit_price * item.quantity)}
                                          </p>
                                          <p className="text-[10px] text-slate-400">
                                            Un: {formatCurrency(item.unit_price)}
                                          </p>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ────────────────────────────────────────────────────────────────── */}
      {/* MODAL DE CADASTRO / EDIÇÃO DE PRODUTO */}
      {/* ────────────────────────────────────────────────────────────────── */}
      {modalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-2xl w-full my-8 space-y-5 animate-in fade-in zoom-in duration-200">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                  <Package className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    {editingProd ? 'Editar Produto' : 'Novo Produto'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Escolha o tipo (Simples, Variação ou Kit) e configure os preços
                  </p>
                </div>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="space-y-4">
              {/* SELECTOR DE TIPO (3 MODOS) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2 uppercase tracking-wider">
                  Tipo de Produto *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, type: 'SIMPLES' })}
                    className={`flex items-center justify-center gap-1.5 p-3 rounded-xl text-xs font-black uppercase transition border ${
                      form.type === 'SIMPLES'
                        ? 'bg-blue-600 text-white border-blue-600 shadow-2xs ring-2 ring-blue-300'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <Box className="h-4 w-4" />
                    SIMPLES
                  </button>

                  <button
                    type="button"
                    onClick={() => setForm({ ...form, type: 'VARIACAO' })}
                    className={`flex items-center justify-center gap-1.5 p-3 rounded-xl text-xs font-black uppercase transition border ${
                      form.type === 'VARIACAO'
                        ? 'bg-purple-600 text-white border-purple-600 shadow-2xs ring-2 ring-purple-300'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <Layers className="h-4 w-4" />
                    COM VARIAÇÃO
                  </button>

                  <button
                    type="button"
                    onClick={() => setForm({ ...form, type: 'KIT' })}
                    className={`flex items-center justify-center gap-1.5 p-3 rounded-xl text-xs font-black uppercase transition border ${
                      form.type === 'KIT'
                        ? 'bg-amber-600 text-white border-amber-600 shadow-2xs ring-2 ring-amber-300'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <Boxes className="h-4 w-4" />
                    KIT / COMBO
                  </button>
                </div>
              </div>

              {/* BASIC FIELDS */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Código SKU *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: EKO-PRD-001"
                    value={form.code_sku}
                    onChange={(e) => setForm({ ...form, code_sku: e.target.value })}
                    className="w-full rounded-xl px-3.5 py-2.5 border border-slate-200 font-medium text-sm outline-none focus:border-blue-500 uppercase"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Nome do Produto / Grupo *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Plataforma Conforto Super Premium"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full rounded-xl px-3.5 py-2.5 border border-slate-200 font-medium text-sm outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Categoria</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value as ProductCategory })}
                    className="w-full rounded-xl px-3.5 py-2.5 border border-slate-200 font-medium text-sm outline-none focus:border-blue-500 bg-white"
                  >
                    <option value="PLATAFORMA DE DESCANSO">PLATAFORMA DE DESCANSO</option>
                    <option value="CABECEIRAS">CABECEIRAS</option>
                    <option value="BASES / CAMAS">BASES / CAMAS</option>
                    <option value="ACESSÓRIOS">ACESSÓRIOS</option>
                    <option value="OUTROS">OUTROS</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Linha do Produto</label>
                  <select
                    value={form.product_line}
                    onChange={(e) => setForm({ ...form, product_line: e.target.value })}
                    className="w-full rounded-xl px-3.5 py-2.5 border border-slate-200 font-medium text-sm outline-none focus:border-blue-500 bg-white"
                  >
                    <option value="SUPER PREMIUM">SUPER PREMIUM</option>
                    <option value="PREMIUM">PREMIUM</option>
                    <option value="EXECUTIVE">EXECUTIVE</option>
                    <option value="PADRÃO">PADRÃO</option>
                  </select>
                </div>

                {form.type === 'SIMPLES' && (
                  <>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Preço de Custo (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={form.cost_price}
                        onChange={(e) => setForm({ ...form, cost_price: parseFloat(e.target.value) || 0 })}
                        className="w-full rounded-xl px-3.5 py-2.5 border border-slate-200 font-medium text-sm outline-none focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">Preço de Venda Padrão (R$) *</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        required
                        value={form.sale_price}
                        onChange={(e) => setForm({ ...form, sale_price: parseFloat(e.target.value) || 0 })}
                        className="w-full rounded-xl px-3.5 py-2.5 border border-slate-200 font-bold text-sm text-emerald-800 outline-none focus:border-blue-500"
                      />
                    </div>

                    {/* Dimensions */}
                    <div className="md:col-span-2 grid grid-cols-3 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                      <div>
                        <label className="block font-bold text-slate-600 mb-1 text-[11px]">Largura (cm)</label>
                        <input
                          type="number"
                          placeholder="Ex: 158"
                          value={form.dim_width_cm}
                          onChange={(e) => setForm({ ...form, dim_width_cm: e.target.value })}
                          className="w-full rounded-lg px-2.5 py-1.5 border border-slate-200 text-xs bg-white"
                        />
                      </div>
                      <div>
                        <label className="block font-bold text-slate-600 mb-1 text-[11px]">Comprimento (cm)</label>
                        <input
                          type="number"
                          placeholder="Ex: 198"
                          value={form.dim_length_cm}
                          onChange={(e) => setForm({ ...form, dim_length_cm: e.target.value })}
                          className="w-full rounded-lg px-2.5 py-1.5 border border-slate-200 text-xs bg-white"
                        />
                      </div>
                      <div>
                        <label className="block font-bold text-slate-600 mb-1 text-[11px]">Altura (cm)</label>
                        <input
                          type="number"
                          placeholder="Ex: 41"
                          value={form.dim_height_cm}
                          onChange={(e) => setForm({ ...form, dim_height_cm: e.target.value })}
                          className="w-full rounded-lg px-2.5 py-1.5 border border-slate-200 text-xs bg-white"
                        />
                      </div>
                    </div>
                  </>
                )}

                <div className="md:col-span-2">
                  <label className="block font-bold text-slate-700 mb-1">Descrição / Detalhes</label>
                  <textarea
                    rows={2}
                    placeholder="Descrição para catálogo e propostas comercial..."
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="w-full rounded-xl p-3 border border-slate-200 font-medium text-sm outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* ── MODE 2: VARIAÇÕES ── */}
              {form.type === 'VARIACAO' && (
                <div className="bg-purple-50/60 p-4 rounded-2xl border border-purple-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-black uppercase text-purple-900 tracking-wide flex items-center gap-1.5">
                        <Layers className="h-4 w-4 text-purple-700" />
                        Lista de Variações do Grupo ({form.variations.length})
                      </h4>
                      <p className="text-[11px] text-purple-800">
                        Cada variação possui seu tamanho, SKU e preço de venda individual
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={addVariationRow}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 transition shadow-2xs"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Adicionar Variação
                    </button>
                  </div>

                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {form.variations.map((v) => (
                      <div
                        key={v.id}
                        className="bg-white p-3 rounded-xl border border-purple-200 text-xs space-y-2 shadow-2xs"
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <div className="sm:col-span-2">
                            <label className="block font-bold text-slate-700 text-[10px] mb-0.5">
                              Nome da Variação (ex: Casal 1,38m x 1,88m x 41cm)
                            </label>
                            <input
                              type="text"
                              value={v.name}
                              onChange={(e) => updateVariationRow(v.id, 'name', e.target.value)}
                              className="w-full rounded-lg px-2.5 py-1.5 border border-slate-200 font-semibold"
                            />
                          </div>
                          <div>
                            <label className="block font-bold text-slate-700 text-[10px] mb-0.5">SKU Variação</label>
                            <input
                              type="text"
                              value={v.sku || ''}
                              onChange={(e) => updateVariationRow(v.id, 'sku', e.target.value)}
                              className="w-full rounded-lg px-2.5 py-1.5 border border-slate-200 uppercase"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="block font-bold text-slate-600 text-[10px] mb-0.5">Custo (R$)</label>
                            <input
                              type="number"
                              step="0.01"
                              value={v.cost_price}
                              onChange={(e) => updateVariationRow(v.id, 'cost_price', parseFloat(e.target.value) || 0)}
                              className="w-full rounded-lg px-2.5 py-1 border border-slate-200"
                            />
                          </div>
                          <div>
                            <label className="block font-bold text-emerald-800 text-[10px] mb-0.5">Preço Venda (R$)</label>
                            <input
                              type="number"
                              step="0.01"
                              value={v.sale_price}
                              onChange={(e) => updateVariationRow(v.id, 'sale_price', parseFloat(e.target.value) || 0)}
                              className="w-full rounded-lg px-2.5 py-1 border border-emerald-300 font-bold text-emerald-800 bg-emerald-50/40"
                            />
                          </div>
                          <div className="flex items-end justify-end">
                            <button
                              type="button"
                              onClick={() => removeVariationRow(v.id)}
                              className="px-2.5 py-1 text-red-600 hover:bg-red-50 rounded-lg text-xs font-bold transition flex items-center gap-1"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Remover
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── MODE 3: KIT / COMBO ── */}
              {form.type === 'KIT' && (
                <div className="bg-amber-50/60 p-4 rounded-2xl border border-amber-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-black uppercase text-amber-900 tracking-wide flex items-center gap-1.5">
                        <Boxes className="h-4 w-4 text-amber-700" />
                        Composição do Kit Combo ({form.kit_items.length} itens)
                      </h4>
                      <p className="text-[11px] text-amber-800">
                        Selecione produtos existentes para compor o combo promocional
                      </p>
                    </div>

                    <select
                      onChange={(e) => {
                        if (e.target.value) {
                          addKitItemRow(e.target.value)
                          e.target.value = ''
                        }
                      }}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-600 text-white outline-none cursor-pointer"
                    >
                      <option value="">+ Incluir Produto no Kit</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({formatCurrency(p.sale_price)})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {form.kit_items.map((item, idx) => (
                      <div
                        key={idx}
                        className="bg-white p-2.5 rounded-xl border border-amber-200 text-xs flex items-center justify-between gap-2 shadow-2xs"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-slate-800 truncate">{item.product_name}</p>
                          <p className="text-[10px] text-slate-400">Preço Unitário: {formatCurrency(item.unit_price)}</p>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] font-bold text-slate-500">Qtd:</span>
                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) =>
                                updateKitItemRow(idx, parseInt(e.target.value) || 1, item.unit_price)
                              }
                              className="w-14 text-center font-bold py-1 rounded-lg border border-slate-200"
                            />
                          </div>

                          <span className="font-black text-emerald-800 text-xs w-24 text-right">
                            {formatCurrency(item.quantity * item.unit_price)}
                          </span>

                          <button
                            type="button"
                            onClick={() => removeKitItemRow(idx)}
                            className="text-red-500 hover:text-red-700 p-1"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Kit Price calculation mode */}
                  <div className="pt-2 border-t border-amber-200/60 flex items-center justify-between">
                    <div className="flex items-center gap-4 text-xs font-bold text-amber-900">
                      <span>Cálculo do Preço:</span>
                      <label className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="kit_price_mode"
                          checked={form.kit_price_mode === 'AUTO'}
                          onChange={() => {
                            const autoPrice = form.kit_items.reduce(
                              (sum, i) => sum + i.quantity * i.unit_price,
                              0
                            )
                            setForm({ ...form, kit_price_mode: 'AUTO', sale_price: autoPrice })
                          }}
                        />
                        Automático (Soma dos itens)
                      </label>
                      <label className="inline-flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="kit_price_mode"
                          checked={form.kit_price_mode === 'MANUAL'}
                          onChange={() => setForm({ ...form, kit_price_mode: 'MANUAL' })}
                        />
                        Manual (Desconto Kit)
                      </label>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] text-amber-800 font-bold uppercase block">Preço Final Kit</span>
                      {form.kit_price_mode === 'AUTO' ? (
                        <span className="text-base font-black text-emerald-800">
                          {formatCurrency(
                            form.kit_items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0)
                          )}
                        </span>
                      ) : (
                        <input
                          type="number"
                          step="0.01"
                          value={form.sale_price}
                          onChange={(e) => setForm({ ...form, sale_price: parseFloat(e.target.value) || 0 })}
                          className="w-28 text-right font-black text-sm py-1 rounded-lg border border-amber-300 text-emerald-800 bg-white"
                        />
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 border border-slate-200 hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2.5 rounded-xl text-xs font-bold text-white shadow-sm"
                  style={{ background: '#0D6BAF' }}
                >
                  {saving ? 'Salvando...' : 'Salvar Produto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2.5 px-5 py-3 rounded-2xl shadow-xl text-sm font-bold z-50 transition-all"
          style={{
            background: toast.type === 'success' ? '#EBF5E8' : '#FEE8E8',
            border: `1px solid ${toast.type === 'success' ? '#C8E6C0' : '#FFCDD2'}`,
            color: toast.type === 'success' ? '#3A7A2A' : '#C62828',
          }}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          {toast.text}
        </div>
      )}
    </div>
  )
}
