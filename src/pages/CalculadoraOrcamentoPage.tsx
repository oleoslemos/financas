import { useEffect, useState } from 'react'
import { useUser } from '../hooks/useClerkCompat'
import { clerkEmailCandidates } from '../lib/clerkEmails'
import { resolveDataOwnerId } from '../lib/dataOwner'
import { supabase } from '../lib/supabaseClient'
import { SearchableSelect } from '../components/ui/SearchableSelect'
import { Button } from '../components/ui/Button'
import { useNavigate } from 'react-router-dom'
import { useCompany } from '../context/CompanyContext'
import { 
  Calculator, 
  Trash2, 
  Copy, 
  Printer, 
  FileCheck, 
  Save, 
  PlusCircle, 
  Calendar, 
  User,
  ShoppingBag,
  Sparkles,
  Smartphone,
  Check,
  ChevronRight,
  Search,
  Plus
} from 'lucide-react'

type SelectedProductItem = {
  productId: string
  productName: string
  price: number
  hasElectronics: boolean
  quantity?: number
}

type QuoteOption = {
  id: string
  name: string
  items: SelectedProductItem[]
  downpayment: number
  installments_qty: number
}

type QuickQuote = {
  id?: string
  client_name: string
  client_birth_date: string
  items: QuoteOption[] | SelectedProductItem[]
  downpayment: number
  installments_qty: number
  created_at?: string
}

function normalizeQuoteOptions(items: any, downpayment: number, installments_qty: number): QuoteOption[] {
  if (!items || !Array.isArray(items) || items.length === 0) {
    return [{
      id: crypto.randomUUID ? crypto.randomUUID() : String(Math.random()),
      name: 'Opção 1',
      items: [],
      downpayment: downpayment || 0,
      installments_qty: installments_qty || 5
    }]
  }
  // If first item has "productId", it's a legacy flat array of products.
  if ('productId' in items[0]) {
    return [{
      id: crypto.randomUUID ? crypto.randomUUID() : String(Math.random()),
      name: 'Opção Única',
      items: items.map((it: any) => ({ ...it, quantity: it.quantity || 1 })) as SelectedProductItem[],
      downpayment: downpayment || 0,
      installments_qty: installments_qty || 5
    }]
  }
  // Otherwise, it's already an array of options.
  return items.map((opt: any, idx: number) => ({
    id: opt.id || (crypto.randomUUID ? crypto.randomUUID() : String(Math.random() + idx)),
    name: opt.name || `Opção ${idx + 1}`,
    items: (opt.items || []).map((it: any) => ({ ...it, quantity: it.quantity || 1 })),
    downpayment: opt.downpayment || 0,
    installments_qty: opt.installments_qty || 5
  }))
}

export function CalculadoraOrcamentoPage() {
  const { user } = useUser()
  const navigate = useNavigate()
  const { activeCompanyId } = useCompany()
  const currentUserId = user?.id ?? null
  const ownerUserId = resolveDataOwnerId(currentUserId, clerkEmailCandidates(user).join(','))

  // View control
  const [currentView, setCurrentView] = useState<'list' | 'editor'>('list')
  const [filterSearch, setFilterSearch] = useState('')
  const [sortField, setSortField] = useState<'date' | 'name'>('date')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  // Editor States
  const [clientName, setClientName] = useState('')
  const [clientBirthDate, setClientBirthDate] = useState('')
  const [quoteOptions, setQuoteOptions] = useState<QuoteOption[]>([
    { id: crypto.randomUUID ? crypto.randomUUID() : String(Math.random()), name: 'Opção 1', items: [], downpayment: 0, installments_qty: 5 }
  ])

  // Catalog data
  const [dbProducts, setDbProducts] = useState<{ id: string; name: string; price: number }[]>([])
  const [dbClients, setDbClients] = useState<{ id: string; full_name: string; birth_date: string | null }[]>([])
  const [showClientSuggestions, setShowClientSuggestions] = useState(false)

  // Status & History
  const [isSaving, setIsSaving] = useState(false)
  const [isConverting, setIsConverting] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [copySuccess, setCopySuccess] = useState(false)
  const [history, setHistory] = useState<QuickQuote[]>([])
  const [loadedQuoteId, setLoadedQuoteId] = useState<string | null>(null)

  // Modal State for managing option products
  const [isOptionModalOpen, setIsOptionModalOpen] = useState(false)
  const [activeOptionId, setActiveOptionId] = useState<string | null>(null)
  const [modalOptionName, setModalOptionName] = useState('')
  const [modalOptionItems, setModalOptionItems] = useState<SelectedProductItem[]>([])
  
  // Modal single selection inputs
  const [modalSelectedProductId, setModalSelectedProductId] = useState('')
  const [modalSelectedProductHasElectronics, setModalSelectedProductHasElectronics] = useState(false)
  const [modalSelectedQty, setModalSelectedQty] = useState(1)
  const [modalProductSearchText, setModalProductSearchText] = useState('')
  const [quickSelectStates, setQuickSelectStates] = useState<Record<string, { checked: boolean; hasElectronics: boolean; quantity: number }>>({})

  // Print Preview Option state
  const [printOption, setPrintOption] = useState<QuoteOption | null>(null)

  // Fetch Eko'7 Products
  useEffect(() => {
    if (!ownerUserId) return
    async function loadProducts() {
      const { data, error } = await supabase
        .from('bem_aviv_products')
        .select('id, name, price')
        .eq('user_id', ownerUserId)
        .order('name')

      if (!error && data) {
        setDbProducts(
          data.map((p) => ({
            id: p.id,
            name: p.name || 'PRODUTO SEM NOME',
            price: Number(p.price) || 0,
          }))
        )
      }
    }
    void loadProducts()
  }, [ownerUserId])

  // Fetch Clients for suggestions
  useEffect(() => {
    if (!ownerUserId || !activeCompanyId) return
    async function loadClients() {
      const { data, error } = await supabase
        .from('bem_aviv_clients')
        .select('id, full_name, birth_date')
        .eq('company_id', activeCompanyId)
        .order('full_name')

      if (!error && data) {
        setDbClients(
          data.map((c) => ({
            id: c.id,
            full_name: c.full_name || '',
            birth_date: c.birth_date || null,
          }))
        )
      }
    }
    void loadClients()
  }, [ownerUserId, activeCompanyId])

  // Fetch Quotes History
  const loadHistory = async () => {
    if (!ownerUserId) return
    const { data, error } = await supabase
      .from('bem_aviv_quick_quotes')
      .select('*')
      .eq('user_id', ownerUserId)
      .order('created_at', { ascending: false })

    if (!error && data) {
      setHistory(data as QuickQuote[])
    }
  }

  useEffect(() => {
    void loadHistory()
  }, [ownerUserId])

  // Options for SearchableSelect
  const productOptions = dbProducts.map((p) => ({
    value: p.id,
    label: `${p.name} - R$ ${p.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
  }))

  const getOptionTotalAmount = (option: QuoteOption) => {
    return option.items.reduce((sum, item) => sum + (item.price * (item.quantity || 1)), 0)
  }

  // Option Operations
  const handleInsertOption = () => {
    const newOpt: QuoteOption = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Math.random()),
      name: `Opção ${quoteOptions.length + 1}`,
      items: [],
      downpayment: 0,
      installments_qty: 5
    }
    setQuoteOptions([...quoteOptions, newOpt])
    handleOpenOptionModal(newOpt)
  }

  const handleRenameOption = (id: string, newName: string) => {
    setQuoteOptions(prev => prev.map(o => o.id === id ? { ...o, name: newName } : o))
  }

  const handleDuplicateOption = (opt: QuoteOption) => {
    const duplicated: QuoteOption = {
      ...opt,
      id: crypto.randomUUID ? crypto.randomUUID() : String(Math.random()),
      name: `${opt.name} (Cópia)`
    }
    setQuoteOptions([...quoteOptions, duplicated])
  }

  const handleRemoveOption = (id: string) => {
    if (quoteOptions.length <= 1) return
    if (!confirm('Deseja excluir esta opção permanentemente?')) return
    setQuoteOptions(prev => prev.filter(o => o.id !== id))
  }

  const handleUpdateOptionDownpayment = (id: string, val: number) => {
    setQuoteOptions(prev => prev.map(o => o.id === id ? { ...o, downpayment: val } : o))
  }

  const handleUpdateOptionInstallments = (id: string, val: number) => {
    setQuoteOptions(prev => prev.map(o => o.id === id ? { ...o, installments_qty: val } : o))
  }

  const handleRemoveProductFromOption = (optId: string, itemIdx: number) => {
    setQuoteOptions(prev => prev.map(o => {
      if (o.id === optId) {
        return { ...o, items: o.items.filter((_, idx) => idx !== itemIdx) }
      }
      return o
    }))
  }

  // Modal handlers
  const handleOpenOptionModal = (opt: QuoteOption) => {
    setActiveOptionId(opt.id)
    setModalOptionName(opt.name)
    setModalOptionItems([...opt.items].map(item => ({ ...item, quantity: item.quantity || 1 })))
    
    setModalSelectedProductId('')
    setModalSelectedProductHasElectronics(false)
    setModalSelectedQty(1)
    setModalProductSearchText('')

    // Initialize quick select states based on dbProducts
    const initialStates: Record<string, { checked: boolean; hasElectronics: boolean; quantity: number }> = {}
    dbProducts.forEach(p => {
      const existing = opt.items.find(it => it.productId === p.id)
      initialStates[p.id] = {
        checked: !!existing,
        hasElectronics: existing?.hasElectronics || false,
        quantity: existing?.quantity || 1
      }
    })
    setQuickSelectStates(initialStates)
    setIsOptionModalOpen(true)
  }

  const handleToggleQuickSelect = (prodId: string, key: 'checked' | 'hasElectronics' | 'quantity', value: any) => {
    setQuickSelectStates(prev => {
      const current = prev[prodId] || { checked: false, hasElectronics: false, quantity: 1 }
      return {
        ...prev,
        [prodId]: {
          ...current,
          [key]: value
        }
      }
    })
  }

  const handleModalAddSingle = () => {
    if (!modalSelectedProductId) return
    const prod = dbProducts.find(p => p.id === modalSelectedProductId)
    if (!prod) return
    
    const newItem: SelectedProductItem = {
      productId: prod.id,
      productName: prod.name,
      price: prod.price,
      hasElectronics: modalSelectedProductHasElectronics,
      quantity: modalSelectedQty
    }

    setModalOptionItems([...modalOptionItems, newItem])
    setModalSelectedProductId('')
    setModalSelectedProductHasElectronics(false)
    setModalSelectedQty(1)
  }

  const handleModalAddMultiple = () => {
    const itemsToAdd: SelectedProductItem[] = []
    
    Object.entries(quickSelectStates).forEach(([prodId, state]) => {
      if (state.checked) {
        const prod = dbProducts.find(p => p.id === prodId)
        if (prod) {
          const alreadyAdded = modalOptionItems.some(item => item.productId === prodId && item.hasElectronics === state.hasElectronics)
          if (!alreadyAdded) {
            itemsToAdd.push({
              productId: prod.id,
              productName: prod.name,
              price: prod.price,
              hasElectronics: state.hasElectronics,
              quantity: state.quantity
            })
          }
        }
      }
    })

    if (itemsToAdd.length > 0) {
      setModalOptionItems([...modalOptionItems, ...itemsToAdd])
    }

    // Reset quick select check states
    const resetStates = { ...quickSelectStates }
    Object.keys(resetStates).forEach(k => {
      resetStates[k] = { checked: false, hasElectronics: false, quantity: 1 }
    })
    setQuickSelectStates(resetStates)
  }

  const handleSaveOptionModal = () => {
    if (!activeOptionId) return
    setQuoteOptions(prev => prev.map(o => {
      if (o.id === activeOptionId) {
        return { ...o, items: modalOptionItems }
      }
      return o
    }))
    setIsOptionModalOpen(false)
  }

  // Save Quote to database
  const handleSaveQuote = async () => {
    if (!clientName.trim()) {
      alert('Por favor, informe o Nome do Cliente.')
      return
    }
    setIsSaving(true)
    setSaveSuccess(false)

    try {
      // 1. Check or Create Client
      let clientId = ''
      const searchName = clientName.toUpperCase().trim()
      
      const { data: existingClients, error: searchError } = await supabase
        .from('bem_aviv_clients')
        .select('id')
        .eq('company_id', activeCompanyId)
        .eq('full_name', searchName)
        .limit(1)

      if (searchError) throw searchError

      if (existingClients && existingClients.length > 0) {
        clientId = existingClients[0].id
      } else {
        // Insert new Client
        const { data: newClient, error: clientError } = await supabase
          .from('bem_aviv_clients')
          .insert({
            user_id: ownerUserId,
            company_id: activeCompanyId,
            full_name: searchName,
            birth_date: clientBirthDate || null,
            client_status: 'CLIENTE',
            cpf: '',
            phone_1: '',
            phone_2: '',
            cep: '',
          })
          .select('id')
          .single()

        if (clientError) throw clientError
        if (newClient) clientId = newClient.id
      }

      // 2. Save the Quote
      const payload = {
        user_id: ownerUserId,
        client_name: clientName.toUpperCase().trim(),
        client_birth_date: clientBirthDate || null,
        items: quoteOptions,
        downpayment: quoteOptions[0]?.downpayment || 0,
        installments_qty: quoteOptions[0]?.installments_qty || 5,
      }

      if (loadedQuoteId) {
        // Update
        const { error } = await supabase
          .from('bem_aviv_quick_quotes')
          .update(payload)
          .eq('id', loadedQuoteId)

        if (error) throw error
      } else {
        // Insert new
        const { data, error } = await supabase
          .from('bem_aviv_quick_quotes')
          .insert(payload)
          .select('id')
          .single()

        if (error) throw error
        if (data) setLoadedQuoteId(data.id)
      }
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
      void loadHistory()

      // Reload clients list
      const { data: clData } = await supabase
        .from('bem_aviv_clients')
        .select('id, full_name, birth_date')
        .eq('company_id', activeCompanyId)
        .order('full_name')
      if (clData) {
        setDbClients(clData.map(c => ({
          id: c.id,
          full_name: c.full_name || '',
          birth_date: c.birth_date || null
        })))
      }

      setCurrentView('list')
    } catch (err) {
      console.error('Erro ao salvar orçamento:', err)
      alert('Ocorreu um erro ao salvar o orçamento.')
    } finally {
      setIsSaving(false)
    }
  }

  // Convert Option Quote to a formal Order
  const handleConvertToOrder = async (option: QuoteOption) => {
    if (!clientName.trim()) {
      alert('Informe o Nome do Cliente.')
      return
    }
    if (option.items.length === 0) {
      alert('Adicione pelo menos um produto ao orçamento.')
      return
    }
    setIsConverting(true)

    try {
      // 1. Check or Create Client
      let clientId = ''
      const searchName = clientName.toUpperCase().trim()
      
      const { data: existingClients, error: searchError } = await supabase
        .from('bem_aviv_clients')
        .select('id')
        .eq('company_id', activeCompanyId)
        .eq('full_name', searchName)
        .limit(1)

      if (searchError) throw searchError

      if (existingClients && existingClients.length > 0) {
        clientId = existingClients[0].id
      } else {
        // Insert new Client
        const { data: newClient, error: clientError } = await supabase
          .from('bem_aviv_clients')
          .insert({
            user_id: ownerUserId,
            company_id: activeCompanyId,
            full_name: searchName,
            birth_date: clientBirthDate || null,
            client_status: 'CLIENTE',
            cpf: '',
            phone_1: '',
            phone_2: '',
            cep: '',
          })
          .select('id')
          .single()

        if (clientError) throw clientError
        if (newClient) clientId = newClient.id
      }

      // 2. Create Sales Order
      const { data: newOrder, error: orderError } = await supabase
        .from('bem_aviv_sales_orders')
        .insert({
          user_id: ownerUserId,
          company_id: activeCompanyId,
          client_id: clientId,
          order_date: new Date().toISOString().split('T')[0],
          status: 'ORÇAMENTO',
          notes: `CONVERTIDO DA CALCULADORA DE ORÇAMENTOS RÁPIDOS (${option.name.toUpperCase()})`,
          total_amount: 0,
        })
        .select('id')
        .single()

      if (orderError) throw orderError
      const orderId = newOrder.id

      // 3. Create Sales Order Items
      const orderItemsPayload = option.items.map((item) => {
        const itemDesc = `${item.productName.toUpperCase()}${item.hasElectronics ? ' (COM ELETRÔNICOS)' : ' (SEM ELETRÔNICOS)'}`
        return {
          user_id: ownerUserId,
          sales_order_id: orderId,
          product_id: item.productId,
          item_description: itemDesc,
          quantity: item.quantity || 1,
          unit_price: item.price,
          discount_amount: 0,
          total_price: item.price * (item.quantity || 1),
        }
      })

      const { error: itemsError } = await supabase
        .from('bem_aviv_sales_order_items')
        .insert(orderItemsPayload)

      if (itemsError) throw itemsError

      // Redirect to newly created order editing
      navigate(`/bem-aviv/pedidos/editar/${orderId}`)
    } catch (err) {
      console.error('Erro ao converter para pedido:', err)
      alert('Não foi possível converter o orçamento para pedido.')
    } finally {
      setIsConverting(false)
    }
  }

  // Load a Saved Quote from history
  const handleLoadQuote = (quote: QuickQuote) => {
    setLoadedQuoteId(quote.id || null)
    setClientName(quote.client_name)
    setClientBirthDate(quote.client_birth_date || '')
    const options = normalizeQuoteOptions(quote.items, quote.downpayment, quote.installments_qty)
    setQuoteOptions(options)
  }

  // Delete a Saved Quote
  const handleDeleteQuote = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Deseja excluir este orçamento permanentemente?')) return

    try {
      const { error } = await supabase
        .from('bem_aviv_quick_quotes')
        .delete()
        .eq('id', id)

      if (error) throw error
      
      if (loadedQuoteId === id) {
        handleResetCalculator()
      }
      void loadHistory()
    } catch (err) {
      console.error('Erro ao excluir orçamento:', err)
      alert('Erro ao excluir o orçamento.')
    }
  }

  // Reset calculator to clean slate
  const handleResetCalculator = () => {
    setLoadedQuoteId(null)
    setClientName('')
    setClientBirthDate('')
    setQuoteOptions([
      { id: crypto.randomUUID ? crypto.randomUUID() : String(Math.random()), name: 'Opção 1', items: [], downpayment: 0, installments_qty: 5 }
    ])
  }

  // Copy option quote text to clipboard for WhatsApp sharing
  const handleCopyToClipboard = (option: QuoteOption) => {
    const formattedDate = clientBirthDate 
      ? new Date(clientBirthDate + 'T12:00:00').toLocaleDateString('pt-BR') 
      : 'Não informada'

    const productsText = option.items.map(
      (item) => `• *${item.productName}*${item.quantity && item.quantity > 1 ? ` x${item.quantity}` : ''} (${item.hasElectronics ? 'Com Eletrônicos' : 'Sem Eletrônicos'}): R$ ${(item.price * (item.quantity || 1)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
    ).join('\n')

    const totalAmount = getOptionTotalAmount(option)
    const installment10x = totalAmount - option.downpayment > 0 ? (totalAmount - option.downpayment) / 10 : 0
    const total5PercentDesc = totalAmount * 0.95
    const installmentDivisor = option.installments_qty > 0 ? total5PercentDesc / option.installments_qty : 0
    const total10PercentDesc = totalAmount * 0.90

    const message = `*ORÇAMENTO BEM AVIV - EKO'7 (${option.name.toUpperCase()})*
-----------------------------
*Cliente:* ${clientName.toUpperCase()}
*Nascimento:* ${formattedDate}

*Produtos Selecionados:*
${productsText}

-----------------------------
*Valor Total:* R$ ${totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
*Entrada:* R$ ${option.downpayment.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}

💳 *Opções de Parcelamento:*
• *Parcelamento em 10x:* 10x de R$ ${installment10x.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}

💵 *Pagamentos Especiais:*
• *A Vista (5% Desconto):* R$ ${total5PercentDesc.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
• *Parcelamento em ${option.installments_qty}x (c/ 5% desc):* ${option.installments_qty}x de R$ ${installmentDivisor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}

⚡ *Pagamento Pix/Dinheiro (10% Desconto):* R$ ${total10PercentDesc.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`

    void navigator.clipboard.writeText(message)
    setCopySuccess(true)
    setTimeout(() => setCopySuccess(false), 2000)
  }

  // Filtered and Sorted History
  const sortedHistory = [...history].sort((a, b) => {
    if (sortField === 'date') {
      const dateA = a.created_at ? new Date(a.created_at).getTime() : 0
      const dateB = b.created_at ? new Date(b.created_at).getTime() : 0
      return sortOrder === 'desc' ? dateB - dateA : dateA - dateB
    } else {
      const nameA = (a.client_name || '').toUpperCase()
      const nameB = (b.client_name || '').toUpperCase()
      return sortOrder === 'desc' ? nameB.localeCompare(nameA) : nameA.localeCompare(nameB)
    }
  })

  const filteredHistory = sortedHistory.filter(quote =>
    quote.client_name.toLowerCase().includes(filterSearch.toLowerCase())
  )

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 space-y-8 print:p-0">
      
      {/* Print-only layout */}
      {printOption && (
        <div className="hidden print:block space-y-6">
          <div className="text-center border-b border-slate-300 pb-4">
            <h1 className="text-2xl font-bold text-slate-800">ORÇAMENTO DE VENDAS - BEM AVIV</h1>
            <p className="text-sm text-slate-500 font-bold uppercase tracking-wider">{printOption.name}</p>
            <p className="text-sm text-slate-500">Eko7 - Distribuidora Autorizada</p>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm border border-slate-200 rounded-lg p-4 bg-slate-50">
            <div>
              <p className="text-slate-600"><strong>Cliente:</strong> {clientName.toUpperCase() || '—'}</p>
              <p className="text-slate-600"><strong>Data do Orçamento:</strong> {new Date().toLocaleDateString('pt-BR')}</p>
            </div>
            <div>
              <p className="text-slate-600">
                <strong>Data de Nascimento:</strong> {clientBirthDate ? new Date(clientBirthDate + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
              </p>
            </div>
          </div>

          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200">
                  <th className="p-3 font-semibold text-slate-700">Produto</th>
                  <th className="p-3 font-semibold text-slate-700 text-center">Qtd</th>
                  <th className="p-3 font-semibold text-slate-700">Adicional</th>
                  <th className="p-3 font-semibold text-slate-700 text-right">Preço Unitário</th>
                  <th className="p-3 font-semibold text-slate-700 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {printOption.items.map((item, idx) => (
                  <tr key={idx} className="border-b border-slate-100">
                    <td className="p-3 text-slate-800 font-medium">{item.productName}</td>
                    <td className="p-3 text-slate-800 text-center font-bold">{item.quantity || 1}</td>
                    <td className="p-3 text-slate-600">{item.hasElectronics ? 'Com Eletrônicos' : 'Sem Eletrônicos'}</td>
                    <td className="p-3 text-slate-800 text-right">R$ {item.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                    <td className="p-3 text-slate-800 text-right font-bold">R$ {(item.price * (item.quantity || 1)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <div className="w-80 space-y-2 border border-slate-200 rounded-lg p-4 bg-slate-50 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">Valor Total:</span>
                <span className="font-semibold text-slate-800">R$ {getOptionTotalAmount(printOption).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Entrada:</span>
                <span className="text-slate-800 font-medium">R$ {printOption.downpayment.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="border-t border-slate-200 my-2 pt-2"></div>
              <div className="flex justify-between">
                <span className="text-slate-700 font-medium">Parcelamento em 10x:</span>
                <span className="text-slate-800 font-medium">10x de R$ {((getOptionTotalAmount(printOption) - printOption.downpayment > 0 ? getOptionTotalAmount(printOption) - printOption.downpayment : 0) / 10).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-700 font-medium">À Vista (5% Desc):</span>
                <span className="text-emerald-700 font-semibold">R$ {(getOptionTotalAmount(printOption) * 0.95).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-700 font-medium">Parcelado em {printOption.installments_qty}x (5% desc):</span>
                <span className="text-slate-800 font-medium">{printOption.installments_qty}x de R$ {(printOption.installments_qty > 0 ? (getOptionTotalAmount(printOption) * 0.95) / printOption.installments_qty : 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-700 font-medium">Pix / Dinheiro (10% Desc):</span>
                <span className="text-emerald-700 font-semibold">R$ {(getOptionTotalAmount(printOption) * 0.90).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>

          <div className="mt-12 text-center text-xs text-slate-400">
            <p>Orçamento sujeito a alteração de valores. Obrigado pela preferência!</p>
          </div>
        </div>
      )}

      {/* Screen layout */}
      <div className="print:hidden space-y-6">
        
        {currentView === 'list' ? (
          /* ========================================================
             DASHBOARD LIST VIEW
             ======================================================== */
          <div className="space-y-6">
            
            {/* Header / Banner */}
            <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-8 shadow-xl relative overflow-hidden">
              <div className="absolute right-0 top-0 -mt-12 -mr-12 w-64 h-64 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
              <div className="absolute left-1/3 bottom-0 -mb-16 w-80 h-80 rounded-full bg-indigo-600/10 blur-3xl pointer-events-none" />
              
              <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-indigo-400 font-semibold tracking-wider text-xs uppercase">
                    <Calculator size={16} />
                    <span>Módulo Eko'7</span>
                  </div>
                  <h1 className="text-3xl md:text-4xl font-black tracking-tight">
                    Calculadora de Orçamentos
                  </h1>
                  <p className="text-indigo-200/80 text-sm max-w-xl">
                    Simule valores, crie múltiplas versões/opções para o seu cliente, compartilhe via WhatsApp e converta tudo em pedidos formais com um único clique.
                  </p>
                </div>
                <button
                  onClick={() => {
                    handleResetCalculator()
                    setCurrentView('editor')
                  }}
                  className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 text-white font-bold py-3 px-6 rounded-2xl transition duration-200 shadow-lg shadow-indigo-500/20 transform hover:-translate-y-0.5"
                >
                  <PlusCircle size={20} />
                  <span>Adicionar Orçamento</span>
                </button>
              </div>
            </div>

            {/* Filter and Sort bar */}
            <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-xs flex flex-col sm:flex-row justify-between items-center gap-4">
              <div className="relative w-full sm:max-w-xs">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                  <Search size={16} />
                </span>
                <input
                  type="text"
                  placeholder="Buscar cliente..."
                  value={filterSearch}
                  onChange={(e) => setFilterSearch(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-sm font-medium outline-none focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Ordenar por:</span>
                <select
                  value={`${sortField}-${sortOrder}`}
                  onChange={(e) => {
                    const [field, order] = e.target.value.split('-') as ['date' | 'name', 'asc' | 'desc']
                    setSortField(field)
                    setSortOrder(order)
                  }}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="date-desc">Mais recente primeiro (Padrão)</option>
                  <option value="date-asc">Mais antigo primeiro</option>
                  <option value="name-asc">Nome do Cliente (A-Z)</option>
                  <option value="name-desc">Nome do Cliente (Z-A)</option>
                </select>
              </div>
            </div>

            {/* List */}
            {filteredHistory.length === 0 ? (
              <div className="bg-slate-50/50 border-2 border-dashed border-slate-200 rounded-3xl p-16 text-center text-slate-500 flex flex-col items-center justify-center space-y-4">
                <Calculator size={48} className="text-slate-300" />
                <div className="space-y-1">
                  <p className="font-bold text-lg text-slate-700">Nenhum orçamento encontrado</p>
                  <p className="text-sm text-slate-400">Experimente criar um novo orçamento clicando no botão acima.</p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredHistory.map((quote) => {
                  const options = normalizeQuoteOptions(quote.items, quote.downpayment, quote.installments_qty)
                  const optionsCount = options.length
                  return (
                    <div
                      key={quote.id}
                      onClick={() => {
                        handleLoadQuote(quote)
                        setCurrentView('editor')
                      }}
                      className="bg-white border border-slate-100 hover:border-indigo-100 rounded-2xl p-6 shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col justify-between group relative overflow-hidden"
                    >
                      <div className="space-y-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-1 min-w-0">
                            <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-700 uppercase">
                              {optionsCount} {optionsCount === 1 ? 'Versão' : 'Versões'}
                            </span>
                            <h3 className="font-extrabold text-slate-900 uppercase truncate text-lg pt-1">
                              {quote.client_name}
                            </h3>
                            {quote.client_birth_date && (
                              <p className="text-xs text-slate-500 font-medium flex items-center gap-1">
                                <Calendar size={12} className="text-slate-400" />
                                <span>Nascimento: {new Date(quote.client_birth_date + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                              </p>
                            )}
                          </div>
                          
                          <button
                            onClick={(e) => quote.id && void handleDeleteQuote(quote.id, e)}
                            className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-2 rounded-xl transition duration-150 shrink-0"
                            title="Excluir Orçamento"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>

                        <div className="space-y-2.5 pt-2 border-t border-slate-50">
                          {options.slice(0, 3).map((opt) => {
                            const total = getOptionTotalAmount(opt)
                            return (
                              <div key={opt.id} className="flex justify-between items-center text-sm">
                                <span className="text-slate-500 truncate font-medium max-w-[150px]">{opt.name}</span>
                                <span className="font-bold text-slate-800 tabular-nums">
                                  R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </span>
                              </div>
                            )
                          })}
                          {optionsCount > 3 && (
                            <p className="text-[11px] text-slate-400 text-right font-medium">
                              + {optionsCount - 3} mais...
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-4 mt-6 border-t border-slate-50 text-[11px] text-slate-400">
                        <span>
                          {quote.created_at &&
                            new Date(quote.created_at).toLocaleDateString('pt-BR', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                        </span>
                        <span className="text-indigo-600 font-bold group-hover:translate-x-1 transition duration-200 flex items-center gap-0.5">
                          <span>Editar</span>
                          <ChevronRight size={12} />
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ) : (
          /* ========================================================
             EDITOR VIEW
             ======================================================== */
          <div className="space-y-6">
            
            {/* Editor Header */}
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-6">
              <div className="space-y-1">
                <button
                  onClick={() => setCurrentView('list')}
                  className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700 transition mb-2"
                >
                  <span>← Voltar para Lista</span>
                </button>
                <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
                  {loadedQuoteId ? 'Editar Orçamento' : 'Novo Orçamento'}
                </h1>
                <p className="text-sm text-slate-500">
                  Defina o cliente e crie múltiplas versões de orçamento com simulações financeiras.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    if (confirm('Deseja cancelar a edição e descartar alterações?')) {
                      setCurrentView('list')
                    }
                  }}
                  className="h-10 text-xs"
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  onClick={() => void handleSaveQuote()}
                  disabled={isSaving}
                  className="h-10 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-5 rounded-xl shadow-sm"
                >
                  <Save size={14} className="mr-1.5" />
                  {isSaving ? 'Salvando...' : 'Salvar Orçamento'}
                </Button>
              </div>
            </header>

            <div className="grid grid-cols-1 gap-8">
              
              {/* Step 1: Customer Info */}
              <section className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-4">
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 border-b border-slate-50 pb-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 text-xs font-semibold">1</span>
                  <span>Dados do Cliente</span>
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5 relative">
                    <label htmlFor="client-name" className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                      Nome do Cliente
                    </label>
                    <div className="relative">
                      <User className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <input
                        id="client-name"
                        type="text"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-sm font-medium text-slate-800 placeholder-slate-400 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all duration-200 outline-none"
                        placeholder="NOME COMPLETO DO CLIENTE"
                        value={clientName}
                        onChange={(e) => {
                          setClientName(e.target.value)
                          setShowClientSuggestions(true)
                        }}
                        onFocus={() => setShowClientSuggestions(true)}
                      />
                    </div>
                    
                    {/* Suggestions dropdown */}
                    {showClientSuggestions && clientName.trim().length > 0 && (
                      <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-y-auto">
                        {dbClients
                          .filter(c => c.full_name.toLowerCase().includes(clientName.toLowerCase()))
                          .map((client) => (
                            <button
                              key={client.id}
                              type="button"
                              onClick={() => {
                                setClientName(client.full_name)
                                setClientBirthDate(client.birth_date || '')
                                setShowClientSuggestions(false)
                              }}
                              className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 border-b border-slate-50 last:border-0 transition"
                            >
                              <span className="font-semibold">{client.full_name}</span>
                              {client.birth_date && (
                                <span className="text-xs text-slate-400 ml-2">
                                  (Nasc: {new Date(client.birth_date + 'T12:00:00').toLocaleDateString('pt-BR')})
                                </span>
                              )}
                            </button>
                          ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="client-birth" className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                      Data de Nascimento
                    </label>
                    <div className="relative">
                      <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <input
                        id="client-birth"
                        type="date"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-sm font-medium text-slate-800 placeholder-slate-400 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all duration-200 outline-none"
                        value={clientBirthDate}
                        onChange={(e) => setClientBirthDate(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </section>

              {/* Step 2: Budget Options */}
              <section className="space-y-6">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 text-xs font-semibold">2</span>
                    <span>Versões de Orçamento (Opções)</span>
                  </h2>
                  
                  <button
                    type="button"
                    onClick={handleInsertOption}
                    className="flex items-center gap-1.5 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-bold rounded-xl text-xs transition duration-150"
                  >
                    <PlusCircle size={14} />
                    <span>Inserir Opção</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                  {quoteOptions.map((option, optIdx) => {
                    const totalAmount = getOptionTotalAmount(option)
                    const installment10x = totalAmount - option.downpayment > 0 ? (totalAmount - option.downpayment) / 10 : 0
                    const total5PercentDesc = totalAmount * 0.95
                    const installmentDivisor = option.installments_qty > 0 ? total5PercentDesc / option.installments_qty : 0
                    const total10PercentDesc = totalAmount * 0.90

                    return (
                      <div key={option.id} className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-6 flex flex-col justify-between relative">
                        <div className="space-y-4">
                          
                          {/* Option Header */}
                          <div className="flex items-center justify-between border-b border-slate-50 pb-3">
                            <div className="flex items-center gap-2">
                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-600 text-xs font-bold">
                                {optIdx + 1}
                              </span>
                              <input
                                type="text"
                                value={option.name}
                                onChange={(e) => handleRenameOption(option.id, e.target.value)}
                                className="font-bold text-slate-800 focus:bg-slate-50 focus:outline-none px-2 py-0.5 rounded border border-transparent focus:border-slate-200"
                              />
                            </div>
                            
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleDuplicateOption(option)}
                                className="text-slate-400 hover:text-indigo-600 p-1.5 rounded transition"
                                title="Duplicar Opção"
                              >
                                <Copy size={14} />
                              </button>
                              {quoteOptions.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveOption(option.id)}
                                  className="text-slate-400 hover:text-rose-600 p-1.5 rounded transition"
                                  title="Remover Opção"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Selected Products summary */}
                          <div className="space-y-3">
                            <div className="flex justify-between items-center">
                              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Produtos Selecionados</span>
                              <button
                                type="button"
                                onClick={() => handleOpenOptionModal(option)}
                                className="text-xs text-indigo-600 hover:text-indigo-700 font-bold transition flex items-center gap-0.5"
                              >
                                <span>Gerenciar Produtos ({option.items.length})</span>
                                <ChevronRight size={12} />
                              </button>
                            </div>

                            {option.items.length > 0 ? (
                              <div className="border border-slate-100 rounded-xl overflow-hidden text-xs">
                                <table className="w-full text-left border-collapse">
                                  <thead>
                                    <tr className="bg-slate-50/50 border-b border-slate-100">
                                      <th className="p-2.5 font-bold text-slate-500">Produto</th>
                                      <th className="p-2.5 font-bold text-slate-500 text-center">Qtd</th>
                                      <th className="p-2.5 font-bold text-slate-500 text-center">Eletrônicos</th>
                                      <th className="p-2.5 font-bold text-slate-500 text-right">Preço</th>
                                      <th className="p-2.5 text-center w-8"></th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {option.items.map((item, itemIdx) => (
                                      <tr key={itemIdx} className="border-b border-slate-50/50 hover:bg-slate-50/20">
                                        <td className="p-2.5 font-medium text-slate-800">{item.productName}</td>
                                        <td className="p-2.5 text-center font-bold text-slate-600">{item.quantity || 1}</td>
                                        <td className="p-2.5 text-center">
                                          <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                            item.hasElectronics 
                                              ? 'bg-amber-50 text-amber-600 border border-amber-100' 
                                              : 'bg-slate-50 text-slate-400 border border-slate-100'
                                          }`}>
                                            {item.hasElectronics ? 'Sim' : 'Não'}
                                          </span>
                                        </td>
                                        <td className="p-2.5 text-right font-bold text-slate-700">
                                          R$ {(item.price * (item.quantity || 1)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="p-2.5 text-center">
                                          <button
                                            type="button"
                                            onClick={() => handleRemoveProductFromOption(option.id, itemIdx)}
                                            className="text-slate-400 hover:text-rose-600"
                                          >
                                            <Trash2 size={12} />
                                          </button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <div
                                onClick={() => handleOpenOptionModal(option)}
                                className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-100 rounded-xl bg-slate-50/30 text-slate-400 hover:bg-slate-50 hover:border-indigo-200 cursor-pointer transition space-y-1.5"
                              >
                                <ShoppingBag size={18} className="text-slate-300" />
                                <p className="text-xs font-semibold">Nenhum produto. Clique para adicionar.</p>
                              </div>
                            )}
                          </div>

                          {/* Simulation / Math box */}
                          {option.items.length > 0 && (
                            <div className="bg-slate-900 text-white rounded-2xl p-5 space-y-4 shadow-md mt-4">
                              <div className="flex justify-between items-center border-b border-white/10 pb-2">
                                <span className="text-xs text-indigo-300 font-bold uppercase tracking-wider">Simulação Financeira</span>
                                <span className="text-lg font-black">Total: R$ {totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                              </div>

                              <div className="grid grid-cols-2 gap-3 text-xs">
                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold text-indigo-200 uppercase tracking-wider block">Entrada</label>
                                  <input
                                    type="number"
                                    min="0"
                                    value={option.downpayment || ''}
                                    onChange={(e) => handleUpdateOptionDownpayment(option.id, Number(e.target.value) || 0)}
                                    className="w-full bg-white/10 border border-white/15 rounded-lg py-1.5 px-3 text-white focus:outline-none focus:border-indigo-400"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold text-indigo-200 uppercase tracking-wider block">Parcelas (5% Desc)</label>
                                  <select
                                    value={option.installments_qty}
                                    onChange={(e) => handleUpdateOptionInstallments(option.id, Number(e.target.value))}
                                    className="w-full bg-white/10 border border-white/15 rounded-lg py-1.5 px-2 text-white focus:outline-none cursor-pointer"
                                  >
                                    {[1,2,3,4,5,6,7,8,9,10,12].map(n => (
                                      <option key={n} value={n} className="bg-slate-800">{n}x</option>
                                    ))}
                                  </select>
                                </div>
                              </div>

                              <div className="bg-white/5 rounded-xl p-3 border border-white/10 space-y-2 text-xs">
                                <div className="flex justify-between">
                                  <span className="text-slate-400">10x (Sem entrada):</span>
                                  <span className="font-semibold text-indigo-200">10x de R$ {installment10x.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">À Vista (5% desc):</span>
                                  <span className="font-semibold text-emerald-300">R$ {total5PercentDesc.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">{option.installments_qty}x (5% desc):</span>
                                  <span>{option.installments_qty}x de R$ {installmentDivisor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div className="flex justify-between font-bold text-emerald-400">
                                  <span>Pix/Dinheiro (10% desc):</span>
                                  <span>R$ {total10PercentDesc.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                </div>
                              </div>

                              <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
                                <button
                                  type="button"
                                  onClick={() => handleCopyToClipboard(option)}
                                  className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-[10px] font-bold uppercase transition"
                                >
                                  <Copy size={10} />
                                  <span>WhatsApp</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPrintOption(option)
                                    setTimeout(() => window.print(), 50)
                                  }}
                                  className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-[10px] font-bold uppercase transition"
                                >
                                  <Printer size={10} />
                                  <span>Imprimir</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleConvertToOrder(option)}
                                  disabled={isConverting}
                                  className="flex items-center gap-1 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 rounded-lg text-[10px] font-bold uppercase transition shadow-xs"
                                >
                                  <FileCheck size={10} />
                                  <span>Pedido</span>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>

            </div>
          </div>
        )}

      </div>

      {/* ========================================================
         GERENCIAR PRODUTOS MODAL (SUB-VIEW TO MANAGE PRODUCTS)
         ======================================================== */}
      {isOptionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <div>
                <h3 className="font-extrabold text-slate-800 text-lg">
                  Gerenciar Produtos — {modalOptionName}
                </h3>
                <p className="text-xs text-slate-400">Selecione produtos para adicionar ou remova produtos existentes.</p>
              </div>
              <button
                onClick={() => setIsOptionModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                &times;
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
              
              {/* Left Column: Product selectors */}
              <div className="space-y-6">
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 space-y-4">
                  <h4 className="font-bold text-slate-700 text-sm">Adicionar Produto Individual</h4>
                  
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-500">Produto</label>
                      <SearchableSelect
                        options={productOptions}
                        value={modalSelectedProductId}
                        onChange={(val) => setModalSelectedProductId(val)}
                        placeholder="Selecione um produto..."
                        className="[&_input]:bg-white [&_input]:border [&_input]:border-slate-200 [&_input]:rounded-xl [&_input]:py-2 [&_input]:px-3 [&_input]:text-sm"
                      />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3 items-end">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-500">Quantidade</label>
                        <input
                          type="number"
                          min="1"
                          value={modalSelectedQty}
                          onChange={(e) => setModalSelectedQty(Math.max(1, Number(e.target.value) || 1))}
                          className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-sm focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div className="flex items-center gap-2 h-10 px-3 bg-white border border-slate-200 rounded-xl">
                        <input
                          id="modal-has-electronics"
                          type="checkbox"
                          checked={modalSelectedProductHasElectronics}
                          onChange={(e) => setModalSelectedProductHasElectronics(e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 cursor-pointer"
                        />
                        <label htmlFor="modal-has-electronics" className="text-xs font-semibold text-slate-600 cursor-pointer">
                          Eletrônicos?
                        </label>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleModalAddSingle}
                      disabled={!modalSelectedProductId}
                      className="w-full h-10 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition duration-150 disabled:opacity-50"
                    >
                      Adicionar à Lista
                    </button>
                  </div>
                </div>

                {/* Quick multi-select checklist */}
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 space-y-4">
                  <div className="flex justify-between items-center">
                    <h4 className="font-bold text-slate-700 text-sm">Seleção Rápida (Múltiplos)</h4>
                    <input
                      type="text"
                      placeholder="Filtrar catálogo..."
                      value={modalProductSearchText}
                      onChange={(e) => setModalProductSearchText(e.target.value)}
                      className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-xl bg-white divide-y divide-slate-100">
                    {dbProducts
                      .filter(p => p.name.toLowerCase().includes(modalProductSearchText.toLowerCase()))
                      .map((product) => {
                        const state = quickSelectStates[product.id] || { checked: false, hasElectronics: false, quantity: 1 }
                        return (
                          <div key={product.id} className="p-3 flex items-center justify-between gap-4 text-xs">
                            <div className="flex items-center gap-2 min-w-0">
                              <input
                                type="checkbox"
                                checked={state.checked}
                                onChange={(e) => handleToggleQuickSelect(product.id, 'checked', e.target.checked)}
                                className="h-4 w-4 rounded border-slate-300 text-indigo-600 cursor-pointer"
                              />
                              <div className="min-w-0">
                                <p className="font-semibold text-slate-700 truncate">{product.name}</p>
                                <p className="text-slate-400 font-medium">R$ {product.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                              </div>
                            </div>

                            {state.checked && (
                              <div className="flex items-center gap-2 shrink-0">
                                <label className="flex items-center gap-1 text-[10px] font-semibold text-slate-500">
                                  <input
                                    type="checkbox"
                                    checked={state.hasElectronics}
                                    onChange={(e) => handleToggleQuickSelect(product.id, 'hasElectronics', e.target.checked)}
                                    className="h-3 w-3 rounded border-slate-300 text-indigo-600 cursor-pointer"
                                  />
                                  <span>Eletro?</span>
                                </label>
                                <input
                                  type="number"
                                  min="1"
                                  value={state.quantity}
                                  onChange={(e) => handleToggleQuickSelect(product.id, 'quantity', Math.max(1, Number(e.target.value) || 1))}
                                  className="w-10 border border-slate-200 rounded px-1.5 py-0.5 text-center text-xs focus:outline-none"
                                />
                              </div>
                            )}
                          </div>
                        )
                      })}
                  </div>

                  <button
                    type="button"
                    onClick={handleModalAddMultiple}
                    className="w-full h-10 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-bold rounded-xl text-xs transition duration-150"
                  >
                    Adicionar Itens Selecionados
                  </button>
                </div>
              </div>

              {/* Right Column: Draft items table */}
              <div className="space-y-4 lg:sticky lg:top-0">
                <div className="flex justify-between items-center">
                  <h4 className="font-bold text-slate-700 text-sm">Produtos no Orçamento</h4>
                  <span className="font-black text-slate-800 text-sm">
                    Total Parcial: R$ {modalOptionItems.reduce((s, i) => s + i.price * (i.quantity || 1), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="border border-slate-100 rounded-xl overflow-hidden max-h-[380px] overflow-y-auto bg-white">
                  {modalOptionItems.length > 0 ? (
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100 sticky top-0 z-10">
                          <th className="p-2.5 font-bold text-slate-500">Produto</th>
                          <th className="p-2.5 font-bold text-slate-500 text-center">Qtd</th>
                          <th className="p-2.5 font-bold text-slate-500 text-center">Eletro?</th>
                          <th className="p-2.5 font-bold text-slate-500 text-right">Total</th>
                          <th className="p-2.5 text-center w-8"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {modalOptionItems.map((item, idx) => (
                          <tr key={idx} className="border-b border-slate-50 hover:bg-slate-50/20">
                            <td className="p-2.5 font-semibold text-slate-700">{item.productName}</td>
                            <td className="p-2.5 text-center">
                              <input
                                type="number"
                                min="1"
                                value={item.quantity || 1}
                                onChange={(e) => {
                                  const newQty = Math.max(1, Number(e.target.value) || 1)
                                  setModalOptionItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: newQty } : it))
                                }}
                                className="w-10 border border-slate-200 rounded text-center py-0.5 focus:outline-none"
                              />
                            </td>
                            <td className="p-2.5 text-center">
                              <input
                                type="checkbox"
                                checked={item.hasElectronics}
                                onChange={(e) => {
                                  const checked = e.target.checked
                                  setModalOptionItems(prev => prev.map((it, i) => i === idx ? { ...it, hasElectronics: checked } : it))
                                }}
                                className="h-4 w-4 rounded border-slate-300 text-indigo-600 cursor-pointer"
                              />
                            </td>
                            <td className="p-2.5 text-right font-bold text-slate-700">
                              R$ {(item.price * (item.quantity || 1)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="p-2.5 text-center">
                              <button
                                type="button"
                                onClick={() => setModalOptionItems(prev => prev.filter((_, i) => i !== idx))}
                                className="text-slate-400 hover:text-rose-600"
                              >
                                <Trash2 size={12} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="p-8 text-center text-slate-400 flex flex-col items-center justify-center space-y-2">
                      <ShoppingBag size={24} className="text-slate-300" />
                      <p className="font-semibold text-xs">Nenhum produto adicionado ainda.</p>
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsOptionModalOpen(false)}
                className="px-4 py-2 border border-slate-200 text-slate-600 font-bold rounded-xl text-xs hover:bg-slate-50 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveOptionModal}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition shadow-sm"
              >
                Confirmar Opção
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  )
}
