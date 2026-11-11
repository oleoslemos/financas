import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  Search,
  Plus,
  Minus,
  Trash2,
  Undo2,
  UserPlus,
  AlertCircle,
  Calculator,
  Tag,
  User,
  ShoppingBag,
  CreditCard,
  X,
} from 'lucide-react'
import {
  listPedidosVenda,
  savePedidoVenda,
  updatePedidoVenda,
  PedidoVenda,
  PedidoVendaItem,
} from '../../services/v2PedidoVendasService'
import { listPriceTables, V2PriceTable } from '../../services/v2TabelaPrecoService'
import { listV2Products, V2Product } from '../../services/v2ProdutosService'
import { fetchClients, createClient, BemAvivClient } from '../../services/v2ClientesService'
import { getCommercialRules, CommercialRules, DEFAULT_COMMERCIAL_RULES } from '../../services/v2CommercialRulesService'
import { getCurrentV2User } from '../../services/v2AuthService'
import { listRolesConfig } from '../../services/v2PermissionsService'
import { registrarAuditoria } from '../../services/v2AuditoriaService'
import {
  saveOrcamentoDraft,
  getOrcamentoDraft,
  clearOrcamentoDraft,
  saveToOutbox,
} from '../services/v2OrcamentoOfflineService'

export function V2OrcamentoFormPage() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const preselectedClientId = searchParams.get('clienteId')

  const user = getCurrentV2User()
  const userRole = (user?.role || 'vendedor').toLowerCase()
  const isAdmin = userRole === 'administrador'
  const userName = user?.full_name || user?.username || 'Leonardo'

  // Global Configs
  const [commercialRules, setCommercialRules] = useState<CommercialRules>(DEFAULT_COMMERCIAL_RULES)
  const [maxDiscountAllowed, setMaxDiscountAllowed] = useState<number>(10)
  const [activeTable, setActiveTable] = useState<V2PriceTable | null>(null)
  const [products, setProducts] = useState<V2Product[]>([])
  const [clients, setClients] = useState<BemAvivClient[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [existingOrder, setExistingOrder] = useState<PedidoVenda | null>(null)

  // Form State
  const [step, setStep] = useState<'cliente' | 'itens' | 'condicoes'>('cliente')
  const [selectedClient, setSelectedClient] = useState<BemAvivClient | null>(null)
  const [canal, setCanal] = useState<'distribuicao' | 'representacao'>('distribuicao')
  const [items, setItems] = useState<PedidoVendaItem[]>([])
  const [frete, setFrete] = useState<number>(0)
  const [formaPagamento, setFormaPagamento] = useState<string>('Pix')
  const [condicaoSelecionada, setCondicaoSelecionada] = useState<'sem_desconto' | 'ate_5x' | 'a_vista'>('sem_desconto')
  const [observacao, setObservacao] = useState<string>('')

  // Search in Step 1 (Clientes)
  const [clientSearch, setClientSearch] = useState('')
  const [isQuickClientOpen, setIsQuickClientOpen] = useState(false)
  const [quickName, setQuickName] = useState('')
  const [quickPhone, setQuickPhone] = useState('')
  const [quickBirthDate, setQuickBirthDate] = useState('')
  const [quickRef, setQuickRef] = useState('')
  const [quickError, setQuickError] = useState<string | null>(null)

  // Search in Step 2 (Produtos)
  const [productSearch, setProductSearch] = useState('')
  const [lastRemovedItem, setLastRemovedItem] = useState<{ item: PedidoVendaItem; index: number } | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // Validation Error Banner
  const [validationError, setValidationError] = useState<string | null>(null)

  // 1. Initial Load
  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [rules, roles, tables, prods, clientRes] = await Promise.all([
          getCommercialRules(),
          listRolesConfig(),
          listPriceTables(),
          listV2Products(),
          fetchClients(null),
        ])

        const clientList = clientRes.data || []

        setCommercialRules(rules)
        setFormaPagamento(rules.forma_pagamento_padrao || 'Pix')

        // Role permissions
        const currentRoleConfig = roles[userRole as keyof typeof roles]
        if (currentRoleConfig?.permissoes_especiais) {
          setMaxDiscountAllowed(currentRoleConfig.permissoes_especiais.desconto_maximo ?? 10)
        }

        // Active price table
        const active = tables.find((t: V2PriceTable) => t.active && t.is_default) || tables.find((t: V2PriceTable) => t.active) || null
        setActiveTable(active)
        setProducts(prods)
        setClients(clientList)

        // If editing existing proposal
        if (id) {
          const allOrders = await listPedidosVenda()
          const found = allOrders.find((p) => p.id === id)
          if (found) {
            setExistingOrder(found)
            setSelectedClient({
              id: found.cliente_id || '',
              full_name: found.cliente_nome,
              cpf: found.cliente_documento || '',
              phone_1: '',
              phone_2: null,
              email: null,
              birth_date: null,
              cep: null,
              address_street: null,
              address_number: null,
              address_complement: null,
              address_district: null,
              address_city: found.cliente_cidade || null,
              address_state: null,
              client_status: 'PROSPECÇÃO',
              commercial_stage: null,
              last_contact_at: null,
              next_followup_at: null,
              next_followup_note: null,
              next_followup_status: null,
              eko7_presentation_at: null,
              group_reference: null,
              company_id: null,
              created_at: found.created_at,
            })
            setCanal(found.canal || 'distribuicao')
            setItems(found.itens || [])
            setFrete(Number(found.frete) || 0)
            setFormaPagamento(found.formaPagamento || 'Pix')
            setCondicaoSelecionada(found.condicaoSelecionada || 'sem_desconto')
            setObservacao(found.observacao || '')
            setStep('itens')
          }
        } else if (preselectedClientId) {
          const matched = clientList.find((c: BemAvivClient) => c.id === preselectedClientId)
          if (matched) {
            setSelectedClient(matched)
            setStep('itens')
          }
        } else {
          // Restore draft if available
          const draft = getOrcamentoDraft()
          if (draft && draft.itens.length > 0) {
            if (draft.cliente) {
              const matched = clientList.find((c: BemAvivClient) => c.id === draft.cliente?.id)
              if (matched) setSelectedClient(matched)
            }
            setCanal(draft.canal || 'distribuicao')
            setItems(draft.itens || [])
            setFrete(draft.frete || 0)
            setFormaPagamento(draft.formaPagamento || rules.forma_pagamento_padrao || 'Pix')
            setCondicaoSelecionada(draft.condicaoSelecionada || 'sem_desconto')
            setObservacao(draft.observacao || '')
          }
        }
      } catch (e) {
        console.error('Erro ao inicializar formulário de orçamento:', e)
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [id, preselectedClientId, userRole])

  // 2. Autosave Draft (Debounce 500ms)
  useEffect(() => {
    if (id || loading) return // Don't overwrite draft when editing existing saved order

    const timer = setTimeout(() => {
      saveOrcamentoDraft({
        cliente: selectedClient
          ? {
              id: selectedClient.id,
              nome: selectedClient.full_name,
              documento: selectedClient.cpf,
              cidade: selectedClient.address_city || undefined,
              telefone: selectedClient.phone_1 || undefined,
            }
          : undefined,
        itens: items.map((it) => ({
          produto_id: it.produto_id,
          produto_nome: it.produto_nome,
          quantidade: it.quantidade,
          preco_tabela: it.preco_tabela,
          preco_unitario: it.preco_unitario,
          desconto_percentual: it.desconto_percentual || 0,
          total: it.total,
        })),
        condicaoSelecionada,
        frete,
        formaPagamento,
        observacao,
        canal,
        tabelaPrecoId: activeTable?.id,
        tabelaPrecoNome: activeTable?.name,
        updatedAt: new Date().toISOString(),
      })
    }, 500)

    return () => clearTimeout(timer)
  }, [selectedClient, items, condicaoSelecionada, frete, formaPagamento, observacao, canal, activeTable, id, loading])

  // 3. Financial Calculations
  const subtotal = useMemo(() => {
    return items.reduce((acc, it) => acc + (it.total || 0), 0)
  }, [items])

  const totalNormal = useMemo(() => {
    return subtotal + (Number(frete) || 0)
  }, [subtotal, frete])

  const desconto5xPercent = commercialRules.desconto_5x_percentual ?? 5
  const total5x = useMemo(() => {
    const desc = subtotal * (desconto5xPercent / 100)
    return Math.max(0, subtotal - desc) + (Number(frete) || 0)
  }, [subtotal, frete, desconto5xPercent])

  const descontoVistaPercent = commercialRules.desconto_vista_percentual ?? 10
  const totalVista = useMemo(() => {
    const desc = subtotal * (descontoVistaPercent / 100)
    return Math.max(0, subtotal - desc) + (Number(frete) || 0)
  }, [subtotal, frete, descontoVistaPercent])

  const totalAtivo = useMemo(() => {
    if (condicaoSelecionada === 'ate_5x') return total5x
    if (condicaoSelecionada === 'a_vista') return totalVista
    return totalNormal
  }, [condicaoSelecionada, totalNormal, total5x, totalVista])

  // 4. Products map & search
  const productsMap = useMemo(() => {
    const map = new Map<string, V2Product>()
    products.forEach((p) => map.set(p.id, p))
    return map
  }, [products])

  const availableProducts = useMemo(() => {
    if (!activeTable || !activeTable.items) return []
    if (!productSearch.trim()) return activeTable.items

    const q = productSearch.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    return activeTable.items.filter((item) => {
      const prod = productsMap.get(item.product_id)
      const nome = (item.product_name || prod?.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      const sku = (item.sku || prod?.code_sku || '').toLowerCase()
      const linha = (item.product_line || prod?.product_line || '').toLowerCase()
      return nome.includes(q) || sku.includes(q) || linha.includes(q)
    })
  }, [activeTable, productSearch, productsMap])

  // 5. Item actions
  const handleAddItem = (priceItem: V2PriceTable['items'][0]) => {
    setItems((prev) => {
      const existing = prev.find((it) => it.produto_id === priceItem.product_id)
      const prod = productsMap.get(priceItem.product_id)
      const unitPrice = priceItem.sugestao_vendas || priceItem.tabela_vendas_sul || 0
      const precoFabrica = priceItem.tabela_fabrica || prod?.cost_price || 0

      if (existing) {
        return prev.map((it) => {
          if (it.produto_id === priceItem.product_id) {
            const novaQtd = it.quantidade + 1
            const total = novaQtd * it.preco_unitario
            return { ...it, quantidade: novaQtd, total }
          }
          return it
        })
      }

      return [
        ...prev,
        {
          produto_id: priceItem.product_id,
          produto_nome: priceItem.product_name || prod?.name || 'Produto',
          quantidade: 1,
          preco_tabela: unitPrice,
          preco_unitario: unitPrice,
          preco_fabrica: precoFabrica,
          desconto_percentual: 0,
          total: unitPrice,
        },
      ]
    })
  }

  const handleUpdateQuantity = (produtoId: string, delta: number) => {
    setItems((prev) =>
      prev
        .map((it) => {
          if (it.produto_id === produtoId) {
            const novaQtd = it.quantidade + delta
            if (novaQtd <= 0) return null
            const total = novaQtd * it.preco_unitario
            return { ...it, quantidade: novaQtd, total }
          }
          return it
        })
        .filter(Boolean) as PedidoVendaItem[]
    )
  }

  const handleUpdateDiscount = (produtoId: string, discPercent: number) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.produto_id === produtoId) {
          const pTabela = it.preco_tabela
          const desc = Math.min(100, Math.max(0, discPercent))
          const unit = pTabela * (1 - desc / 100)
          const total = it.quantidade * unit
          return {
            ...it,
            desconto_percentual: desc,
            preco_unitario: unit,
            total,
          }
        }
        return it
      })
    )
  }

  const handleRemoveItem = (index: number) => {
    const item = items[index]
    setLastRemovedItem({ item, index })
    setItems((prev) => prev.filter((_, idx) => idx !== index))
    setToastMessage(`"${item.produto_nome}" removido.`)
    setTimeout(() => setToastMessage(null), 4000)
  }

  const handleUndoRemove = () => {
    if (lastRemovedItem) {
      setItems((prev) => {
        const next = [...prev]
        next.splice(lastRemovedItem.index, 0, lastRemovedItem.item)
        return next
      })
      setLastRemovedItem(null)
      setToastMessage(null)
    }
  }

  // 6. Quick Client Creation
  const handleQuickClientSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setQuickError(null)

    if (!quickName.trim()) {
      setQuickError('Nome do cliente é obrigatório.')
      return
    }
    if (!quickPhone.trim()) {
      setQuickError('Telefone é obrigatório.')
      return
    }
    if (!quickBirthDate) {
      setQuickError('Data de nascimento é obrigatória.')
      return
    }

    try {
      const res = await createClient({
        full_name: quickName.trim(),
        phone_1: quickPhone.trim(),
        birth_date: quickBirthDate,
        group_reference: quickRef.trim() || null,
        cpf: '',
        phone_2: null,
        email: null,
        cep: null,
        address_street: null,
        address_number: null,
        address_complement: null,
        address_district: null,
        address_city: null,
        address_state: null,
        commercial_stage: 'CONTATO',
        eko7_presentation_at: null,
        company_id: null,
        next_followup_at: null,
        next_followup_note: null,
        next_followup_status: null,
        last_contact_at: null,
      })

      if (res.data) {
        setClients((prev) => [res.data!, ...prev])
        setSelectedClient(res.data)
        setIsQuickClientOpen(false)
        setQuickName('')
        setQuickPhone('')
        setQuickBirthDate('')
        setQuickRef('')
        setStep('itens')
      } else {
        setQuickError(res.error || 'Erro ao cadastrar cliente.')
      }
    } catch {
      setQuickError('Erro ao cadastrar cliente. Tente novamente.')
    }
  }

  // 7. Save Proposal
  const handleSaveOrcamento = async () => {
    setValidationError(null)

    if (!selectedClient) {
      setValidationError('Por favor, selecione um cliente para o orçamento.')
      setStep('cliente')
      return
    }

    if (items.length === 0) {
      setValidationError('Adicione pelo menos 1 item ao orçamento.')
      setStep('itens')
      return
    }

    // Validation: Item discounts vs max allowed discount for role
    for (const it of items) {
      if ((it.desconto_percentual || 0) > maxDiscountAllowed) {
        setValidationError(
          `O item "${it.produto_nome}" possui desconto de ${it.desconto_percentual}%, que ultrapassa o seu limite de ${maxDiscountAllowed}%.`
        )
        setStep('itens')
        return
      }
    }

    // Validation: Minimum Margin (Vendedores blocked if margin < min)
    let totalCusto = 0
    let totalVenda = 0
    for (const it of items) {
      const custo = (it.preco_fabrica || 0) * it.quantidade
      totalCusto += custo
      totalVenda += it.total
    }

    const margemAtual = totalVenda > 0 ? ((totalVenda - totalCusto) / totalVenda) * 100 : 0
    if (!isAdmin && margemAtual < commercialRules.margem_minima) {
      const precoMinimoSugerido = totalCusto / (1 - commercialRules.margem_minima / 100)
      setValidationError(
        `Margem baixa (${margemAtual.toFixed(1)}%). O valor total mínimo dos itens para atingir a margem de ${commercialRules.margem_minima}% é ${formatBRL(precoMinimoSugerido)}. Ajuste os descontos ou consulte o administrador.`
      )
      setStep('condicoes')
      return
    }

    setSaving(true)

    try {
      const dataHojeStr = new Date().toISOString().split('T')[0]
      const validadeDias = commercialRules.validade_proposta_dias || 7
      
      // dataVencimento = dataEmissao + validade_proposta_dias (Conforme Decisão 4 na Seção 2.9)
      const dataVenc = new Date()
      dataVenc.setDate(dataVenc.getDate() + validadeDias)
      const dataVencStr = dataVenc.toISOString().split('T')[0]

      const payload: Omit<PedidoVenda, 'id' | 'created_at' | 'updated_at' | 'numero'> = {
        canal,
        status: 'proposta' as const,
        cliente_id: selectedClient.id || undefined,
        cliente_nome: selectedClient.full_name,
        cliente_documento: selectedClient.cpf || undefined,
        cliente_cidade: selectedClient.address_city || undefined,
        tabela_preco_id: activeTable?.id || undefined,
        tabela_preco_nome: activeTable?.name || 'Tabela Padrão',
        dataEmissao: existingOrder?.dataEmissao || dataHojeStr,
        dataVencimento: existingOrder?.dataVencimento || dataVencStr,
        formaPagamento,
        numeroParcelas: 1,
        frete: Number(frete) || 0,
        observacao: observacao.trim() || null,
        subtotal,
        descontoTotal: items.reduce((acc, it) => acc + (it.preco_tabela - it.preco_unitario) * it.quantidade, 0),
        total: totalNormal,
        desconto5xPercentual: desconto5xPercent,
        total5x,
        descontoVistaPercentual: descontoVistaPercent,
        totalVista,
        condicaoSelecionada,
        vendedor_nome: userName,
        comissao_percentual: canal === 'representacao' ? 5 : null,
        comissao_valor: canal === 'representacao' ? totalAtivo * 0.05 : null,
        comissao_valor_total: canal === 'representacao' ? totalAtivo * 0.05 : null,
        comissao_gerada: false,
        itens: items,
      }

      let saved: PedidoVenda
      if (existingOrder) {
        saved = await updatePedidoVenda({
          ...existingOrder,
          ...payload,
        })
      } else {
        saved = await savePedidoVenda(payload)
      }

      // If offline, save in outbox queue
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        saveToOutbox(saved)
      }

      // Audit registration
      await registrarAuditoria({
        usuario_nome: userName,
        area: 'Venda',
        objeto: `#${saved.numero}`,
        o_que_mudou: existingOrder ? 'Orçamento atualizado pelo módulo mobile' : 'Novo orçamento gerado pelo módulo mobile',
        detalhe: {
          acao_titulo: 'Orçamento Comercial',
          subtitulo: `Cliente: ${saved.cliente_nome} · Total: ${formatBRL(totalAtivo)}`,
          mudancas: [
            { campo: 'Status', antes: '—', depois: 'proposta' },
            { campo: 'Condição', antes: '—', depois: condicaoSelecionada },
          ],
        },
      })

      clearOrcamentoDraft()
      navigate('/v2/orcamento/propostas')
    } catch (err) {
      console.error('Erro ao salvar orçamento:', err)
      setValidationError('Erro ao salvar o orçamento. Se estiver sem conexão, os dados foram gravados localmente.')
    } finally {
      setSaving(false)
    }
  }

  const formatBRL = (val?: number) => {
    if (val == null || isNaN(val)) return 'R$ 0,00'
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  // 5 Most recent clients
  const recentClients = useMemo(() => {
    return clients.slice(0, 5)
  }, [clients])

  const filteredClients = useMemo(() => {
    if (!clientSearch.trim()) return recentClients
    const q = clientSearch.toLowerCase()
    return clients.filter(
      (c) =>
        c.full_name.toLowerCase().includes(q) ||
        (c.cpf && c.cpf.includes(q)) ||
        (c.phone_1 && c.phone_1.includes(q)) ||
        (c.address_city && c.address_city.toLowerCase().includes(q))
    )
  }, [clients, clientSearch, recentClients])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-slate-400 gap-3">
        <Calculator className="w-6 h-6 animate-spin text-[#0D6BAF]" />
        <span className="text-sm font-semibold">Carregando dados do orçamento...</span>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-4 pb-24">

      {/* ── TOPO DE NAVEGAÇÃO & TÍTULO ── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/v2/orcamento/propostas')}
            className="min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center text-slate-500 hover:bg-white hover:text-slate-900 border border-slate-200 shadow-2xs"
            title="Voltar para lista"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg sm:text-xl font-black text-slate-900 leading-tight">
              {existingOrder ? `Editar Orçamento #${existingOrder.numero}` : 'Novo Orçamento'}
            </h1>
            <p className="text-xs text-slate-400 font-medium">
              Tabela: <strong>{activeTable?.name || 'Tabela Padrão'}</strong>
            </p>
          </div>
        </div>

        {/* Seletor Segmentado de Canal */}
        <div className="inline-flex rounded-xl p-1 bg-slate-200/80 border border-slate-300 text-xs font-bold">
          <button
            type="button"
            onClick={() => setCanal('distribuicao')}
            className={`px-3 py-1.5 rounded-lg transition ${
              canal === 'distribuicao' ? 'bg-white text-[#0D6BAF] shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Distribuição
          </button>
          <button
            type="button"
            onClick={() => setCanal('representacao')}
            className={`px-3 py-1.5 rounded-lg transition ${
              canal === 'representacao' ? 'bg-white text-[#0D6BAF] shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Representação
          </button>
        </div>
      </div>

      {/* ── ERRO DE VALIDAÇÃO ── */}
      {validationError && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-xs font-semibold flex items-start gap-2.5 animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1">{validationError}</div>
          <button type="button" onClick={() => setValidationError(null)} className="text-red-400 hover:text-red-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── TOAST DE UNDO / DESFAZER ── */}
      {toastMessage && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 bg-slate-900 text-white px-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-3 text-xs font-bold animate-in fade-in slide-in-from-bottom-2">
          <span>{toastMessage}</span>
          {lastRemovedItem && (
            <button
              type="button"
              onClick={handleUndoRemove}
              className="text-[#7DC344] hover:underline flex items-center gap-1 pl-2 border-l border-slate-700"
            >
              <Undo2 className="w-3.5 h-3.5" /> Desfazer
            </button>
          )}
        </div>
      )}

      {/* ── NAVEGAÇÃO DE ETAPAS (TABS NO MOBILE) ── */}
      <div className="grid grid-cols-3 gap-2 p-1 bg-white rounded-2xl border border-slate-200 shadow-2xs text-xs font-bold md:hidden">
        <button
          type="button"
          onClick={() => setStep('cliente')}
          className={`min-h-[44px] rounded-xl flex items-center justify-center gap-1.5 transition ${
            step === 'cliente' ? 'bg-[#0D6BAF] text-white shadow-xs' : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <User className="w-4 h-4" />
          <span>1. Cliente</span>
        </button>
        <button
          type="button"
          onClick={() => setStep('itens')}
          className={`min-h-[44px] rounded-xl flex items-center justify-center gap-1.5 transition ${
            step === 'itens' ? 'bg-[#0D6BAF] text-white shadow-xs' : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
          <span>2. Itens ({items.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setStep('condicoes')}
          className={`min-h-[44px] rounded-xl flex items-center justify-center gap-1.5 transition ${
            step === 'condicoes' ? 'bg-[#0D6BAF] text-white shadow-xs' : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>3. Condições</span>
        </button>
      </div>

      {/* ── LAYOUT PRINCIPAL (2 COLUNAS NO TABLET >= 768px) ── */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">

        {/* ── COLUNA ESQUERDA: CLIENTES & CATÁLOGO DE PRODUTOS ── */}
        <div className={`space-y-4 md:col-span-7 ${step === 'condicoes' ? 'hidden md:block' : ''}`}>
          
          {/* ETAPA 1: CLIENTE */}
          <div className={`bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-2xs space-y-3 ${step !== 'cliente' && 'hidden md:block'}`}>
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <User className="w-4 h-4 text-[#0D6BAF]" />
                Cliente Selecionado
              </span>
              <button
                type="button"
                onClick={() => setIsQuickClientOpen(true)}
                className="text-xs font-bold text-[#0D6BAF] hover:underline flex items-center gap-1"
              >
                <UserPlus className="w-3.5 h-3.5" /> + Novo Rápido
              </button>
            </div>

            {selectedClient ? (
              <div className="p-3 rounded-xl bg-sky-50/60 border border-sky-100 flex items-center justify-between">
                <div>
                  <div className="font-bold text-slate-900 text-sm">{selectedClient.full_name}</div>
                  <div className="text-xs text-slate-500 font-medium">
                    {selectedClient.phone_1 || 'Sem telefone'} {selectedClient.address_city ? `• ${selectedClient.address_city}` : ''}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedClient(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white text-xs font-bold"
                >
                  Trocar
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Buscar cliente por nome, CPF ou telefone..."
                    value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0D6BAF]/20"
                  />
                </div>

                <div className="space-y-1 max-h-48 overflow-y-auto">
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-1">
                    {clientSearch ? 'Resultados' : 'Últimos clientes atendidos'}
                  </div>
                  {filteredClients.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setSelectedClient(c)
                        setStep('itens')
                      }}
                      className="w-full text-left p-2.5 rounded-xl hover:bg-slate-50 transition flex items-center justify-between border border-transparent hover:border-slate-100 min-h-[48px]"
                    >
                      <div className="truncate">
                        <div className="text-xs font-bold text-slate-800">{c.full_name}</div>
                        <div className="text-[10px] text-slate-400 truncate">
                          {c.phone_1 || '—'} {c.address_city ? `• ${c.address_city}` : ''}
                        </div>
                      </div>
                      <span className="text-[11px] font-bold text-[#0D6BAF]">Selecionar</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ETAPA 2: ADICIONAR PRODUTOS DO CATÁLOGO */}
          <div className={`bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-2xs space-y-3 ${step !== 'itens' && 'hidden md:block'}`}>
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <Tag className="w-4 h-4 text-[#0D6BAF]" />
                Catálogo da Tabela Ativa
              </span>
              <span className="text-xs text-slate-400 font-bold">
                {availableProducts.length} itens
              </span>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar produto por nome, SKU, linha..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0D6BAF]/20"
              />
            </div>

            <div className="space-y-1.5 max-h-[360px] overflow-y-auto divide-y divide-slate-100">
              {availableProducts.slice(0, 40).map((pItem) => {
                const prod = productsMap.get(pItem.product_id)
                const price = pItem.sugestao_vendas || pItem.tabela_vendas_sul || 0

                return (
                  <div
                    key={pItem.product_id}
                    className="pt-2 flex items-center justify-between gap-2 hover:bg-slate-50/70 p-2 rounded-xl transition"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-slate-900 truncate">
                        {pItem.product_name || prod?.name}
                      </div>
                      <div className="text-[10px] text-slate-400 flex items-center gap-2">
                        <span className="font-mono">{pItem.sku || prod?.code_sku}</span>
                        {pItem.product_line && <span>• {pItem.product_line}</span>}
                      </div>
                    </div>
                    
                    <div className="text-right shrink-0">
                      <div className="text-xs font-black text-[#0D6BAF] tabular-nums">
                        {formatBRL(price)}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleAddItem(pItem)}
                        className="mt-1 px-3 py-1 rounded-lg bg-sky-50 text-[#0D6BAF] hover:bg-[#0D6BAF] hover:text-white border border-sky-100 text-[11px] font-bold transition active:scale-95"
                      >
                        + Adicionar
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

        </div>

        {/* ── COLUNA DIREITA: ITENS DO ORÇAMENTO & CONDIÇÕES COMERCIAIS ── */}
        <div className={`space-y-4 md:col-span-5 ${step === 'cliente' ? 'hidden md:block' : ''}`}>
          
          {/* ITENS ADICIONADOS AO ORÇAMENTO */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-2xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-[#0D6BAF]" />
                Itens da Proposta ({items.length})
              </span>
              <span className="text-xs font-black text-slate-900 tabular-nums">
                Subtotal: {formatBRL(subtotal)}
              </span>
            </div>

            {items.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">
                Nenhum item adicionado ainda. Selecione produtos no catálogo à esquerda.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[300px] overflow-y-auto divide-y divide-slate-100">
                {items.map((it, idx) => (
                  <div key={it.produto_id || idx} className="pt-2 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-slate-900 leading-tight">
                          {it.produto_nome}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Tabela: {formatBRL(it.preco_tabela)}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveItem(idx)}
                        className="text-slate-300 hover:text-red-500 p-1 transition"
                        title="Remover item"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Controles de Quantidade, Desconto e Total */}
                    <div className="flex items-center justify-between gap-2">
                      {/* Qtd - e + */}
                      <div className="flex items-center border border-slate-200 rounded-xl bg-slate-50 overflow-hidden">
                        <button
                          type="button"
                          onClick={() => handleUpdateQuantity(it.produto_id, -1)}
                          className="w-8 h-8 flex items-center justify-center text-slate-600 hover:bg-slate-200 active:bg-slate-300 transition"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="w-8 text-center text-xs font-black text-slate-800 tabular-nums">
                          {it.quantidade}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleUpdateQuantity(it.produto_id, 1)}
                          className="w-8 h-8 flex items-center justify-center text-slate-600 hover:bg-slate-200 active:bg-slate-300 transition"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Desconto % */}
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] font-bold text-slate-400">Desc:</span>
                        <input
                          type="number"
                          min="0"
                          max={maxDiscountAllowed}
                          value={it.desconto_percentual || 0}
                          onChange={(e) => handleUpdateDiscount(it.produto_id, parseFloat(e.target.value) || 0)}
                          className="w-14 px-1.5 py-1 text-center rounded-lg border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#0D6BAF]"
                        />
                        <span className="text-[10px] font-bold text-slate-400">%</span>
                      </div>

                      {/* Total do item */}
                      <div className="text-right font-black text-xs text-slate-900 tabular-nums">
                        {formatBRL(it.total)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ETAPA 3: CONDIÇÕES COMERCIAIS & 3 CARDS DE PAGAMENTO */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-2xs space-y-4">
            <span className="font-bold text-slate-800 text-sm flex items-center gap-2 pb-2 border-b border-slate-100">
              <CreditCard className="w-4 h-4 text-[#0D6BAF]" />
              Condições Comerciais
            </span>

            {/* 3 Cartões de Condição */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              
              {/* Opção 1: Preço Normal */}
              <div
                onClick={() => setCondicaoSelecionada('sem_desconto')}
                className={`p-3 rounded-xl border transition cursor-pointer flex flex-col justify-between ${
                  condicaoSelecionada === 'sem_desconto'
                    ? 'border-[#0D6BAF] bg-sky-50/50 ring-2 ring-[#0D6BAF]/20'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div>
                  <div className="text-[11px] font-bold uppercase text-slate-500">Normal</div>
                  <div className="text-[10px] text-slate-400 font-medium">Tabela cheia</div>
                </div>
                <div className="text-sm font-black text-slate-900 tabular-nums mt-2">
                  {formatBRL(totalNormal)}
                </div>
              </div>

              {/* Opção 2: Até 5x */}
              <div
                onClick={() => setCondicaoSelecionada('ate_5x')}
                className={`p-3 rounded-xl border transition cursor-pointer flex flex-col justify-between ${
                  condicaoSelecionada === 'ate_5x'
                    ? 'border-[#0D6BAF] bg-sky-50/50 ring-2 ring-[#0D6BAF]/20'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div>
                  <div className="text-[11px] font-bold uppercase text-[#0D6BAF]">Até 5x</div>
                  <div className="text-[10px] text-emerald-600 font-bold">-{desconto5xPercent}% desc.</div>
                </div>
                <div className="text-sm font-black text-[#0D6BAF] tabular-nums mt-2">
                  {formatBRL(total5x)}
                </div>
              </div>

              {/* Opção 3: À Vista */}
              <div
                onClick={() => setCondicaoSelecionada('a_vista')}
                className={`p-3 rounded-xl border transition cursor-pointer flex flex-col justify-between ${
                  condicaoSelecionada === 'a_vista'
                    ? 'border-emerald-600 bg-emerald-50/50 ring-2 ring-emerald-600/20'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div>
                  <div className="text-[11px] font-bold uppercase text-emerald-700">À Vista</div>
                  <div className="text-[10px] text-emerald-600 font-bold">-{descontoVistaPercent}% desc.</div>
                </div>
                <div className="text-sm font-black text-emerald-700 tabular-nums mt-2">
                  {formatBRL(totalVista)}
                </div>
              </div>

            </div>

            {/* Frete & Forma de Pagamento */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div>
                <label className="text-[11px] font-bold text-slate-500 block mb-1">
                  Frete (R$)
                </label>
                <input
                  type="number"
                  min="0"
                  step="10"
                  value={frete || ''}
                  placeholder="0,00"
                  onChange={(e) => setFrete(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#0D6BAF]"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-500 block mb-1">
                  Forma Pagamento
                </label>
                <select
                  value={formaPagamento}
                  onChange={(e) => setFormaPagamento(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-900 bg-white focus:outline-none focus:ring-1 focus:ring-[#0D6BAF]"
                >
                  <option value="Pix">Pix</option>
                  <option value="Cartão de Crédito">Cartão de Crédito</option>
                  <option value="Boleto">Boleto</option>
                  <option value="Dinheiro">Dinheiro</option>
                </select>
              </div>
            </div>

            {/* Observações Opcionais */}
            <div>
              <label className="text-[11px] font-bold text-slate-500 block mb-1">
                Observações internas
              </label>
              <textarea
                rows={2}
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Ex.: Cliente prefere entrega no sábado pela manhã..."
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-[#0D6BAF] resize-none"
              />
            </div>

          </div>

        </div>

      </div>

      {/* ── BARRA INFERIOR FIXA (TOTAL & BOTÃO SALVAR ORÇAMENTO) ── */}
      <div
        className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-3 sm:p-4 z-40 shadow-[0_-4px_24px_rgba(0,0,0,0.08)] flex items-center justify-between gap-4 max-w-6xl mx-auto md:bottom-0"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
      >
        <div>
          <div className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">
            Total {condicaoSelecionada === 'a_vista' ? 'À Vista' : condicaoSelecionada === 'ate_5x' ? 'Até 5x' : 'Normal'} ({items.length} itens)
          </div>
          <div className="text-lg sm:text-2xl font-black text-[#0D6BAF] tabular-nums leading-tight">
            {formatBRL(totalAtivo)}
          </div>
        </div>

        <button
          type="button"
          onClick={handleSaveOrcamento}
          disabled={saving || !selectedClient || items.length === 0}
          className="min-h-[48px] px-6 sm:px-8 rounded-2xl bg-[#0D6BAF] text-white font-black text-sm flex items-center justify-center gap-2 hover:bg-[#0b5a93] transition disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-[#0D6BAF]/25 active:scale-98"
        >
          {saving ? 'Gravando...' : 'Salvar Orçamento'}
        </button>
      </div>

      {/* ── MODAL DE CADASTRO RÁPIDO DE CLIENTE ── */}
      {isQuickClientOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-5 sm:p-6 max-w-md w-full border border-slate-200 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="font-black text-slate-900 text-base">Novo Cliente Rápido</h3>
              <button
                type="button"
                onClick={() => setIsQuickClientOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {quickError && (
              <div className="p-3 rounded-xl bg-red-50 text-red-700 text-xs font-bold">
                {quickError}
              </div>
            )}

            <form onSubmit={handleQuickClientSubmit} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Nome Completo *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Nome do cliente"
                  value={quickName}
                  onChange={(e) => setQuickName(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#0D6BAF]"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Telefone celular (WhatsApp) *
                </label>
                <input
                  type="tel"
                  required
                  placeholder="(49) 99999-9999"
                  value={quickPhone}
                  onChange={(e) => setQuickPhone(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#0D6BAF]"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Data de Nascimento *
                </label>
                <input
                  type="date"
                  required
                  value={quickBirthDate}
                  onChange={(e) => setQuickBirthDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#0D6BAF]"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Referência / Indicação (opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ex.: Irmão do Dr. Silva, vizinho..."
                  value={quickRef}
                  onChange={(e) => setQuickRef(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#0D6BAF]"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsQuickClientOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-[#0D6BAF] text-white font-black text-xs hover:bg-[#0b5a93]"
                >
                  Cadastrar e Usar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}
