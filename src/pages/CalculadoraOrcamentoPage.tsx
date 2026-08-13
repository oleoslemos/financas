import { useEffect, useState } from 'react'
import { useUser } from '../hooks/useClerkCompat'
import { clerkEmailCandidates } from '../lib/clerkEmails'
import { resolveDataOwnerId } from '../lib/dataOwner'
import { supabase } from '../lib/supabaseClient'
import { SearchableSelect } from '../components/ui/SearchableSelect'
import { Button } from '../components/ui/Button'
import { useNavigate } from 'react-router-dom'
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
  ChevronRight
} from 'lucide-react'

type SelectedProductItem = {
  productId: string
  productName: string
  price: number
  hasElectronics: boolean
}

type QuickQuote = {
  id?: string
  client_name: string
  client_birth_date: string
  items: SelectedProductItem[]
  downpayment: number
  installments_qty: number
  created_at?: string
}

export function CalculadoraOrcamentoPage() {
  const { user } = useUser()
  const navigate = useNavigate()
  const currentUserId = user?.id ?? null
  const ownerUserId = resolveDataOwnerId(currentUserId, clerkEmailCandidates(user).join(','))

  // States
  const [clientName, setClientName] = useState('')
  const [clientBirthDate, setClientBirthDate] = useState('')
  const [dbProducts, setDbProducts] = useState<{ id: string; name: string; price: number }[]>([])
  
  // Selected product from dropdown
  const [selectedProductId, setSelectedProductId] = useState('')
  const [selectedProductHasElectronics, setSelectedProductHasElectronics] = useState(false)
  const [quoteItems, setQuoteItems] = useState<SelectedProductItem[]>([])

  // Quote Calculation settings
  const [downpayment, setDownpayment] = useState<number>(0)
  const [installmentsQty, setInstallmentsQty] = useState<number>(5)

  // Status & History
  const [isSaving, setIsSaving] = useState(false)
  const [isConverting, setIsConverting] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [copySuccess, setCopySuccess] = useState(false)
  const [history, setHistory] = useState<QuickQuote[]>([])
  const [loadedQuoteId, setLoadedQuoteId] = useState<string | null>(null)

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

  // Add Item to current quote
  const handleAddItem = () => {
    if (!selectedProductId) return
    const prod = dbProducts.find((p) => p.id === selectedProductId)
    if (!prod) return

    const newItem: SelectedProductItem = {
      productId: prod.id,
      productName: prod.name,
      price: prod.price,
      hasElectronics: selectedProductHasElectronics,
    }

    setQuoteItems([...quoteItems, newItem])
    // Reset product selection inputs
    setSelectedProductId('')
    setSelectedProductHasElectronics(false)
  }

  // Remove Item from current quote
  const handleRemoveItem = (index: number) => {
    setQuoteItems(quoteItems.filter((_, i) => i !== index))
  }

  // Toggle electronics for an item
  const handleToggleElectronics = (index: number) => {
    setQuoteItems(
      quoteItems.map((item, i) =>
        i === index ? { ...item, hasElectronics: !item.hasElectronics } : item
      )
    )
  }

  // Math Calculations
  const totalAmount = quoteItems.reduce((sum, item) => sum + item.price, 0)
  const installment10x = totalAmount - downpayment > 0 ? (totalAmount - downpayment) / 10 : 0
  const total5PercentDesc = totalAmount * 0.95
  const installmentDivisor = installmentsQty > 0 ? total5PercentDesc / installmentsQty : 0
  const total10PercentDesc = totalAmount * 0.90

  // Save Quote to database
  const handleSaveQuote = async () => {
    if (!clientName.trim()) {
      alert('Por favor, informe o Nome do Cliente.')
      return
    }
    setIsSaving(true)
    setSaveSuccess(false)

    const payload = {
      user_id: ownerUserId,
      client_name: clientName.toUpperCase().trim(),
      client_birth_date: clientBirthDate || null,
      items: quoteItems,
      downpayment,
      installments_qty: installmentsQty,
    }

    try {
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
    } catch (err) {
      console.error('Erro ao salvar orçamento:', err)
      alert('Ocorreu um erro ao salvar o orçamento.')
    } finally {
      setIsSaving(false)
    }
  }

  // Convert Quote to a formal Order
  const handleConvertToOrder = async () => {
    if (!clientName.trim()) {
      alert('Informe o Nome do Cliente.')
      return
    }
    if (quoteItems.length === 0) {
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
        .eq('user_id', ownerUserId)
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
          client_id: clientId,
          order_date: new Date().toISOString().split('T')[0],
          status: 'ORÇAMENTO',
          notes: 'CONVERTIDO DA CALCULADORA DE ORÇAMENTOS RÁPIDOS',
          total_amount: 0,
        })
        .select('id')
        .single()

      if (orderError) throw orderError
      const orderId = newOrder.id

      // 3. Create Sales Order Items
      const orderItemsPayload = quoteItems.map((item) => {
        const itemDesc = `${item.productName.toUpperCase()}${item.hasElectronics ? ' (COM ELETRÔNICOS)' : ' (SEM ELETRÔNICOS)'}`
        return {
          user_id: ownerUserId,
          sales_order_id: orderId,
          product_id: item.productId,
          item_description: itemDesc,
          quantity: 1,
          unit_price: item.price,
          discount_amount: 0,
          total_price: item.price,
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
    setQuoteItems(quote.items)
    setDownpayment(quote.downpayment)
    setInstallmentsQty(quote.installments_qty)
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
    setQuoteItems([])
    setDownpayment(0)
    setInstallmentsQty(5)
    setSelectedProductId('')
    setSelectedProductHasElectronics(false)
  }

  // Copy quote text to clipboard for WhatsApp sharing
  const handleCopyToClipboard = () => {
    const formattedDate = clientBirthDate 
      ? new Date(clientBirthDate).toLocaleDateString('pt-BR') 
      : 'Não informada'

    const productsText = quoteItems.map(
      (item) => `• *${item.productName}* (${item.hasElectronics ? 'Com Eletrônicos' : 'Sem Eletrônicos'}): R$ ${item.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
    ).join('\n')

    const message = `*ORÇAMENTO BEM AVIV - EKO'7*
-----------------------------
*Cliente:* ${clientName.toUpperCase()}
*Nascimento:* ${formattedDate}

*Produtos Selecionados:*
${productsText}

-----------------------------
*Valor Total:* R$ ${totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
*Entrada:* R$ ${downpayment.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}

💳 *Opções de Parcelamento:*
• *Parcelamento em 10x:* 10x de R$ ${installment10x.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}

💵 *Pagamentos Especiais:*
• *A Vista (5% Desconto):* R$ ${total5PercentDesc.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
• *Parcelamento em ${installmentsQty}x (c/ 5% desc):* ${installmentsQty}x de R$ ${installmentDivisor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}

⚡ *Pagamento Pix/Dinheiro (10% Desconto):* R$ ${total10PercentDesc.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`

    void navigator.clipboard.writeText(message)
    setCopySuccess(true)
    setTimeout(() => setCopySuccess(false), 2000)
  }

  // Print Quote
  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 space-y-8 print:p-0">
      
      {/* Print-only layout */}
      <div className="hidden print:block space-y-6">
        <div className="text-center border-b border-slate-300 pb-4">
          <h1 className="text-2xl font-bold text-slate-800">ORÇAMENTO DE VENDAS - BEM AVIV</h1>
          <p className="text-sm text-slate-500">Eko7 - Distribuidora Autorizada</p>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm border border-slate-200 rounded-lg p-4 bg-slate-50">
          <div>
            <p className="text-slate-600"><strong>Cliente:</strong> {clientName.toUpperCase() || '—'}</p>
            <p className="text-slate-600"><strong>Data do Orçamento:</strong> {new Date().toLocaleDateString('pt-BR')}</p>
          </div>
          <div>
            <p className="text-slate-600">
              <strong>Data de Nascimento:</strong> {clientBirthDate ? new Date(clientBirthDate).toLocaleDateString('pt-BR') : '—'}
            </p>
          </div>
        </div>

        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-200">
                <th className="p-3 font-semibold text-slate-700">Produto</th>
                <th className="p-3 font-semibold text-slate-700">Adicional</th>
                <th className="p-3 font-semibold text-slate-700 text-right">Preço</th>
              </tr>
            </thead>
            <tbody>
              {quoteItems.map((item, idx) => (
                <tr key={idx} className="border-b border-slate-100">
                  <td className="p-3 text-slate-800 font-medium">{item.productName}</td>
                  <td className="p-3 text-slate-600">{item.hasElectronics ? 'Com Eletrônicos' : 'Sem Eletrônicos'}</td>
                  <td className="p-3 text-slate-800 text-right">R$ {item.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end">
          <div className="w-80 space-y-2 border border-slate-200 rounded-lg p-4 bg-slate-50 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-600">Valor Total:</span>
              <span className="font-semibold text-slate-800">R$ {totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Entrada:</span>
              <span className="text-slate-800 font-medium">R$ {downpayment.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="border-t border-slate-200 my-2 pt-2"></div>
            <div className="flex justify-between">
              <span className="text-slate-700 font-medium">Parcelamento em 10x:</span>
              <span className="text-slate-800 font-medium">10x de R$ {installment10x.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-700 font-medium">À Vista (5% Desc):</span>
              <span className="text-emerald-700 font-semibold">R$ {total5PercentDesc.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-700 font-medium">Parcelado em {installmentsQty}x (5% desc):</span>
              <span className="text-slate-800 font-medium">{installmentsQty}x de R$ {installmentDivisor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-700 font-medium">Pix / Dinheiro (10% Desc):</span>
              <span className="text-emerald-700 font-semibold">R$ {total10PercentDesc.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>

        <div className="mt-12 text-center text-xs text-slate-400">
          <p>Orçamento sujeito a alteração de valores. Obrigado pela preferência!</p>
        </div>
      </div>

      {/* Screen layout */}
      <div className="print:hidden space-y-6">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-indigo-600 font-semibold">
              <Calculator size={20} />
              <span>Módulo Eko7</span>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
              Calculadora de Orçamento
            </h1>
            <p className="text-sm text-slate-500">
              Gere orçamentos rápidos, simule parcelamentos e converta em pedidos de venda com um clique.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {(quoteItems.length > 0 || clientName) && (
              <Button type="button" variant="secondary" onClick={handleResetCalculator} className="h-10 text-xs">
                Novo Orçamento
              </Button>
            )}
          </div>
        </header>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Main Calculator Column */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Step 1: Customer Info */}
            <section className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-4">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 border-b border-slate-50 pb-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 text-xs font-semibold">1</span>
                <span>Dados do Cliente</span>
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
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
                      onChange={(e) => setClientName(e.target.value)}
                    />
                  </div>
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

            {/* Step 2: Add Products */}
            <section className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-4">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 border-b border-slate-50 pb-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 text-xs font-semibold">2</span>
                <span>Selecionar Produtos</span>
              </h2>

              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                      Produto Eko'7
                    </label>
                    <SearchableSelect
                      options={productOptions}
                      value={selectedProductId}
                      onChange={(val) => setSelectedProductId(val)}
                      placeholder="Pesquise e selecione o colchão/produto..."
                      className="[&_input]:w-full [&_input]:bg-slate-50 [&_input]:border [&_input]:border-slate-200 [&_input]:rounded-xl [&_input]:py-2.5 [&_input]:px-4 [&_input]:text-sm [&_input]:font-medium [&_input]:text-slate-800 [&_input]:outline-none [&_input]:focus:bg-white [&_input]:focus:border-indigo-500 [&_input]:focus:ring-1 [&_input]:focus:ring-indigo-500"
                    />
                  </div>
                  
                  <div className="flex items-center gap-3 h-[46px] border border-slate-100 rounded-xl bg-slate-50/50 px-4">
                    <input
                      id="has-electronics-main"
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      checked={selectedProductHasElectronics}
                      onChange={(e) => setSelectedProductHasElectronics(e.target.checked)}
                    />
                    <label htmlFor="has-electronics-main" className="text-sm font-semibold text-slate-700 cursor-pointer select-none">
                      Possui Eletrônicos?
                    </label>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button
                    type="button"
                    onClick={handleAddItem}
                    disabled={!selectedProductId}
                    className="flex items-center gap-2 h-11 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition duration-200 shadow-sm"
                  >
                    <PlusCircle size={18} />
                    <span>Adicionar Orçamento</span>
                  </Button>
                </div>
              </div>

              {/* Selected items table */}
              {quoteItems.length > 0 ? (
                <div className="mt-6 border border-slate-100 rounded-xl overflow-hidden">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="p-3.5 font-bold text-slate-600">Descrição do Colchão Selecionado</th>
                        <th className="p-3.5 font-bold text-slate-600 text-center">Eletrônicos</th>
                        <th className="p-3.5 font-bold text-slate-600 text-right">Valor Unitário</th>
                        <th className="p-3.5 text-center w-16"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {quoteItems.map((item, index) => (
                        <tr key={index} className="border-b border-slate-50 hover:bg-slate-50/40 transition-colors">
                          <td className="p-3.5 font-medium text-slate-800 flex items-center gap-2">
                            <ShoppingBag size={15} className="text-slate-400" />
                            <span>{item.productName}</span>
                          </td>
                          <td className="p-3.5 text-center">
                            <button
                              type="button"
                              onClick={() => handleToggleElectronics(index)}
                              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold tracking-wide transition ${
                                item.hasElectronics
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                  : 'bg-slate-50 text-slate-500 border border-slate-100'
                              }`}
                            >
                              <Smartphone size={12} />
                              <span>{item.hasElectronics ? 'COM ELETRÔNICOS' : 'SEM ELETRÔNICOS'}</span>
                            </button>
                          </td>
                          <td className="p-3.5 text-right font-semibold text-slate-800">
                            R$ {item.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="p-3.5 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(index)}
                              className="text-slate-400 hover:text-rose-600 transition"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="mt-4 flex flex-col items-center justify-center p-8 border-2 border-dashed border-slate-100 rounded-xl bg-slate-50/30 text-slate-400 space-y-2">
                  <ShoppingBag size={24} className="text-slate-300" />
                  <p className="text-sm font-medium">Nenhum produto adicionado ao orçamento.</p>
                </div>
              )}
            </section>

            {/* Calculations results */}
            {quoteItems.length > 0 && (
              <section className="bg-gradient-to-tr from-slate-900 to-indigo-950 text-white rounded-2xl p-6 shadow-xl space-y-6">
                <div className="flex items-center justify-between border-b border-white/10 pb-4">
                  <div className="flex items-center gap-2">
                    <Sparkles className="text-indigo-400" size={20} />
                    <h2 className="text-lg font-bold">Simulação de Valores</h2>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-indigo-300 uppercase tracking-wider block">Valor Total bruto</span>
                    <span className="text-2xl font-black">R$ {totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  
                  {/* Calculation Inputs */}
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label htmlFor="downpayment" className="text-xs font-semibold text-indigo-300 uppercase tracking-wider block">
                        Entrada
                      </label>
                      <div className="relative">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-semibold text-indigo-400">R$</span>
                        <input
                          id="downpayment"
                          type="number"
                          min="0"
                          className="w-full bg-white/10 border border-white/15 rounded-xl py-2 pl-10 pr-4 text-sm font-medium text-white placeholder-white/30 focus:bg-white/15 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition-all outline-none"
                          value={downpayment || ''}
                          onChange={(e) => setDownpayment(Number(e.target.value) || 0)}
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="installments-qty" className="text-xs font-semibold text-indigo-300 uppercase tracking-wider block">
                        Quantidade de Parcelas (Desconto 5%)
                      </label>
                      <select
                        id="installments-qty"
                        className="w-full bg-white/10 border border-white/15 rounded-xl py-2 px-3.5 text-sm font-medium text-white focus:bg-slate-800 focus:border-indigo-400 outline-none cursor-pointer"
                        value={installmentsQty}
                        onChange={(e) => setInstallmentsQty(Number(e.target.value))}
                      >
                        <option value={1} className="bg-slate-900 text-white">1x</option>
                        <option value={2} className="bg-slate-900 text-white">2x</option>
                        <option value={3} className="bg-slate-900 text-white">3x</option>
                        <option value={4} className="bg-slate-900 text-white">4x</option>
                        <option value={5} className="bg-slate-900 text-white">5x (Padrão)</option>
                      </select>
                    </div>
                  </div>

                  {/* Calculations outputs */}
                  <div className="bg-white/5 rounded-xl p-4 border border-white/10 space-y-4 text-sm">
                    
                    {/* 10x Option */}
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-semibold block">Parcelamento em 10x</span>
                        <span className="text-xs text-slate-400">(Bruto s/ entrada / 10)</span>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-base text-indigo-200">10x de R$ {installment10x.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>

                    <hr className="border-white/10" />

                    {/* 5% Option */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-semibold block">Total à Vista (5% Desc)</span>
                        </div>
                        <div className="text-right">
                          <span className="font-bold text-emerald-400">R$ {total5PercentDesc.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-300">Valor da parcela ({installmentsQty}x):</span>
                        <span className="font-medium text-slate-200">{installmentsQty}x de R$ {installmentDivisor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>

                    <hr className="border-white/10" />

                    {/* 10% Option */}
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-semibold block text-emerald-400">Pagamento Pix/Dinheiro</span>
                        <span className="text-xs text-slate-400">(10% de desconto)</span>
                      </div>
                      <div className="text-right">
                        <span className="font-extrabold text-lg text-emerald-400">R$ {total10PercentDesc.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>

                  </div>
                </div>

                {/* Actions buttons row */}
                <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-white/10">
                  
                  <button
                    type="button"
                    onClick={handleCopyToClipboard}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-white/10 font-semibold rounded-lg text-xs tracking-wider uppercase transition shadow-sm"
                  >
                    {copySuccess ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                    <span>{copySuccess ? 'Copiado!' : 'Copiar p/ WhatsApp'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handlePrint}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-white/10 font-semibold rounded-lg text-xs tracking-wider uppercase transition shadow-sm"
                  >
                    <Printer size={14} />
                    <span>Imprimir</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleSaveQuote()}
                    disabled={isSaving}
                    className="flex items-center gap-2 px-5 py-2.5 bg-indigo-500 hover:bg-indigo-600 font-semibold rounded-lg text-xs tracking-wider uppercase transition shadow-md disabled:opacity-50"
                  >
                    <Save size={14} />
                    <span>{saveSuccess ? 'Salvo!' : isSaving ? 'Salvando...' : 'Salvar Orçamento'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleConvertToOrder()}
                    disabled={isConverting}
                    className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 font-semibold rounded-lg text-xs tracking-wider uppercase transition shadow-md disabled:opacity-50"
                  >
                    <FileCheck size={14} />
                    <span>{isConverting ? 'Convertendo...' : 'Transformar em Pedido'}</span>
                  </button>

                </div>
              </section>
            )}

          </div>

          {/* Sidebar: Saved Quotes History */}
          <div className="space-y-6">
            <section className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm space-y-4">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 border-b border-slate-50 pb-3">
                <Calculator size={18} className="text-indigo-600" />
                <span>Orçamentos Salvos</span>
              </h2>

              {history.length > 0 ? (
                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                  {history.map((quote) => (
                    <div
                      key={quote.id}
                      onClick={() => handleLoadQuote(quote)}
                      className={`group flex items-center justify-between p-3.5 border rounded-xl cursor-pointer hover:bg-slate-50 transition-all ${
                        loadedQuoteId === quote.id
                          ? 'border-indigo-500 bg-indigo-50/20'
                          : 'border-slate-100 bg-white'
                      }`}
                    >
                      <div className="space-y-1 min-w-0">
                        <p className="text-sm font-bold text-slate-800 truncate uppercase">
                          {quote.client_name}
                        </p>
                        <p className="text-xs text-slate-500 font-medium">
                          {quote.items.length} {quote.items.length === 1 ? 'Produto' : 'Produtos'} • R${' '}
                          {quote.items.reduce((s, i) => s + i.price, 0).toLocaleString('pt-BR', {
                            minimumFractionDigits: 2,
                          })}
                        </p>
                        {quote.created_at && (
                          <p className="text-[10px] text-slate-400">
                            {new Date(quote.created_at).toLocaleDateString('pt-BR', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => quote.id && void handleDeleteQuote(quote.id, e)}
                          className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-slate-100 transition duration-150"
                          title="Excluir Orçamento"
                        >
                          <Trash2 size={14} />
                        </button>
                        <ChevronRight
                          size={16}
                          className={`transition ${
                            loadedQuoteId === quote.id ? 'text-indigo-500' : 'text-slate-400'
                          }`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-8 border border-dashed border-slate-100 rounded-xl bg-slate-50/30 text-slate-400 text-center space-y-2">
                  <Calculator size={20} className="text-slate-300" />
                  <p className="text-xs font-semibold">Nenhum orçamento salvo no banco de dados.</p>
                </div>
              )}
            </section>
          </div>

        </div>

      </div>

    </div>
  )
}
