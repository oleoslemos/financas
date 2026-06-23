import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSupabase } from '../hooks/useSupabase'
import { formatBRL } from '../lib/format'
import { ArrowLeft, Printer } from 'lucide-react'

type PaymentMethod = 'DINHEIRO' | 'PIX' | 'CARTAO_DEBITO' | 'CARTAO_CREDITO' | 'BOLETO'

const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  DINHEIRO: 'Dinheiro',
  PIX: 'Pix',
  CARTAO_DEBITO: 'Cartão de Débito',
  CARTAO_CREDITO: 'Cartão de Crédito',
  BOLETO: 'Boleto',
}

interface CompanyRow {
  id: string
  trade_name: string
  legal_name: string | null
  tax_id: string | null
  phone: string | null
  email_contact: string | null
  address_street: string | null
  address_city: string | null
  address_state: string | null
  zip_code: string | null
}

interface ClientRow {
  id: string
  full_name: string
  cpf: string | null
  phone_1: string | null
  phone_2: string | null
  email: string | null
  address_street: string | null
  address_number: string | null
  address_complement: string | null
  address_district: string | null
  address_city: string | null
  address_state: string | null
  cep: string | null
}

interface OrderRow {
  id: string
  client_id: string | null
  company_id: string
  order_date: string
  document_type: 'ORCAMENTO' | 'PEDIDO'
  document_number: string | null
  status: string
  total_amount: number
  notes: string | null
  discount_total: number | null
  installments_count: number | null
  payment_option: string | null
  payment_method: string | null
  down_payment_amount: number | null
  down_payment_method: string | null
  freight_amount: number | null
  other_expenses: number | null
  expected_arrival_date: string | null
  delivered_at: string | null
  created_by_name?: string | null
}

interface OrderItemRow {
  id: string
  item_description: string
  quantity: number
  unit_price: number
  total_price: number
  discount_amount: number | null
}

export function BemAvivPedidoPrintPage() {
  const { orderId } = useParams<{ orderId: string }>()
  const supabase = useSupabase()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  
  const [order, setOrder] = useState<OrderRow | null>(null)
  const [client, setClient] = useState<ClientRow | null>(null)
  const [company, setCompany] = useState<CompanyRow | null>(null)
  const [items, setItems] = useState<OrderItemRow[]>([])

  useEffect(() => {
    if (!orderId || !supabase) return

    let cancelled = false
    setLoading(true)
    setErrorMsg(null)

    async function loadData() {
      const clientLocal = supabase
      if (!clientLocal) return

      try {
        // 1. Fetch Order
        const { data: orderData, error: orderErr } = await clientLocal
          .from('bem_aviv_sales_orders')
          .select('*')
          .eq('id', orderId)
          .maybeSingle()

        if (cancelled) return
        if (orderErr) throw new Error(orderErr.message)
        if (!orderData) throw new Error('Pedido/Orçamento não encontrado.')

        const orderRow = orderData as OrderRow
        setOrder(orderRow)

        // 2. Fetch Client, Items, Company in parallel
        const clientQuery = orderRow.client_id
          ? clientLocal.from('bem_aviv_clients').select('*').eq('id', orderRow.client_id).maybeSingle()
          : Promise.resolve({ data: null, error: null })

        const companyQuery = orderRow.company_id
          ? clientLocal.from('companies').select('*').eq('id', orderRow.company_id).maybeSingle()
          : Promise.resolve({ data: null, error: null })

        const itemsQuery = clientLocal
          .from('bem_aviv_sales_order_items')
          .select('id, item_description, quantity, unit_price, total_price, discount_amount')
          .eq('sales_order_id', orderId)

        const [clientRes, companyRes, itemsRes] = await Promise.all([
          clientQuery,
          companyQuery,
          itemsQuery,
        ])

        if (cancelled) return

        if (clientRes.error) throw new Error(clientRes.error.message)
        if (companyRes.error) throw new Error(companyRes.error.message)
        if (itemsRes.error) throw new Error(itemsRes.error.message)

        setClient(clientRes.data as ClientRow | null)
        setCompany(companyRes.data as CompanyRow | null)
        setItems((itemsRes.data as OrderItemRow[]) ?? [])
        setLoading(false)

        // Trigger automatic browser print once DOM has updated
        setTimeout(() => {
          if (!cancelled) {
            window.print()
          }
        }, 800)
      } catch (err: any) {
        if (!cancelled) {
          setErrorMsg(err.message || 'Erro ao carregar dados para impressão.')
          setLoading(false)
        }
      }
    }

    void loadData()

    return () => {
      cancelled = true
    }
  }, [orderId, supabase])

  if (loading) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-3 bg-slate-50">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-emerald-600" />
        <p className="text-sm font-semibold uppercase tracking-wider text-slate-500">Preparando documento para impressão...</p>
      </div>
    )
  }

  if (errorMsg || !order) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-slate-50 p-6 text-center">
        <div className="rounded-full bg-rose-100 p-3 text-rose-600">
          <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-slate-800">Falha ao gerar documento</h2>
        <p className="max-w-md text-sm text-slate-500">{errorMsg || 'Pedido inválido ou sem dados correspondentes.'}</p>
        <button
          onClick={() => navigate('/bem-aviv/pedidos')}
          className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 active:scale-95 transition-all shadow-sm"
        >
          Voltar para Pedidos
        </button>
      </div>
    )
  }

  const subtotal = order.total_amount + Number(order.discount_total ?? 0) - Number(order.freight_amount ?? 0) - Number(order.other_expenses ?? 0)
  const isQuote = order.document_type === 'ORCAMENTO'

  return (
    <div className="min-h-screen bg-slate-100/30 p-0 text-slate-800 sm:p-6 md:p-8 normal-case font-sans">
      {/* Top Action Bar (Hidden on print) */}
      <div className="mx-auto mb-6 flex max-w-4xl items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm print:hidden">
        <button
          onClick={() => window.history.back()}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 active:scale-95 transition-all"
        >
          <ArrowLeft size={16} />
          Voltar
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700 active:scale-95 transition-all shadow-md shadow-emerald-600/10"
          >
            <Printer size={16} />
            Imprimir / Salvar PDF
          </button>
        </div>
      </div>

      {/* Main Printable Document Canvas */}
      <div className="mx-auto max-w-4xl border border-slate-200 bg-white p-8 shadow-md print:border-0 print:p-0 print:shadow-none">
        
        {/* Document Header */}
        <div className="flex flex-col justify-between gap-6 border-b border-slate-200 pb-6 sm:flex-row sm:items-start">
          <div className="space-y-1">
            <h1 className="text-2xl font-black tracking-tight text-slate-900">
              {company?.trade_name ?? 'BEM AVIV'}
            </h1>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {company?.legal_name ?? 'Eko\'7 Autorizado'}
            </p>
            {company && (
              <div className="text-xs text-slate-500 leading-relaxed">
                {company.tax_id && <p>CNPJ: {company.tax_id}</p>}
                {(company.address_street || company.address_city) && (
                  <p>
                    {company.address_street}, {company.address_city} - {company.address_state}
                  </p>
                )}
                {(company.phone || company.email_contact) && (
                  <p>
                    {company.phone && `Tel: ${company.phone}`}
                    {company.phone && company.email_contact && ' | '}
                    {company.email_contact && `E-mail: ${company.email_contact}`}
                  </p>
                )}
              </div>
            )}
          </div>
          
          <div className="flex flex-col items-end text-right">
            <span className={`inline-block rounded-lg px-3 py-1 text-xs font-bold uppercase tracking-wider ${
              isQuote ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
            }`}>
              {isQuote ? 'Orçamento de Venda' : 'Pedido de Venda'}
            </span>
            <p className="mt-2 text-lg font-bold text-slate-900 tabular-nums">
              Nº {order.document_number ?? '—'}
            </p>
            <div className="mt-1 text-xs text-slate-500 space-y-0.5">
              <p>Emissão: <span className="font-semibold tabular-nums text-slate-700">{order.order_date.split('-').reverse().join('/')}</span></p>
              <p>Status: <span className="font-semibold text-slate-700 uppercase">{order.status}</span></p>
              {order.created_by_name && (
                <p>Consultor: <span className="font-semibold text-slate-700 uppercase">{order.created_by_name}</span></p>
              )}
            </div>
          </div>
        </div>

        {/* Customer Section */}
        <div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50/50 p-5">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 mb-3">Dados do Cliente</h3>
          {client ? (
            <div className="grid grid-cols-1 gap-y-2 gap-x-4 text-xs sm:grid-cols-2 md:grid-cols-3">
              <div>
                <p className="text-slate-400">Nome / Razão Social</p>
                <p className="font-bold text-slate-800 text-sm">{client.full_name}</p>
              </div>
              <div>
                <p className="text-slate-400">CPF / CNPJ</p>
                <p className="font-semibold text-slate-800 tabular-nums">{client.cpf ? client.cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : '—'}</p>
              </div>
              <div>
                <p className="text-slate-400">Contato</p>
                <p className="font-semibold text-slate-800 tabular-nums">
                  {client.phone_1 || client.phone_2 ? [client.phone_1, client.phone_2].filter(Boolean).join(' / ') : '—'}
                </p>
              </div>
              <div className="sm:col-span-2 md:col-span-3 mt-1">
                <p className="text-slate-400">Endereço de Entrega</p>
                <p className="font-semibold text-slate-800 leading-normal">
                  {client.address_street ? (
                    <>
                      {client.address_street}
                      {client.address_number ? `, ${client.address_number}` : ''}
                      {client.address_complement ? ` (${client.address_complement})` : ''}
                      {client.address_district ? ` - ${client.address_district}` : ''}
                      {client.address_city ? ` - ${client.address_city}/${client.address_state}` : ''}
                      {client.cep ? ` - CEP: ${client.cep}` : ''}
                    </>
                  ) : 'Endereço não cadastrado.'}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500 font-medium">Cliente não vinculado.</p>
          )}
        </div>

        {/* Order Items Table */}
        <div className="mt-8">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 mb-3">Itens da Proposta</h3>
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left font-bold text-slate-500 uppercase tracking-wider">
                  <th className="px-4 py-3">Descrição do Produto / Serviço</th>
                  <th className="w-16 px-4 py-3 text-center">Qtd</th>
                  <th className="w-24 px-4 py-3 text-right">Preço Unit.</th>
                  {items.some(i => Number(i.discount_amount) > 0) && (
                    <th className="w-24 px-4 py-3 text-right">Desconto</th>
                  )}
                  <th className="w-28 px-4 py-3 text-right">Total Liquido</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-400 font-medium uppercase">Nenhum item adicionado a este documento.</td>
                  </tr>
                ) : (
                  items.map((it) => (
                    <tr key={it.id} className="hover:bg-slate-50/30">
                      <td className="px-4 py-3 font-semibold text-slate-800 leading-normal">{it.item_description}</td>
                      <td className="px-4 py-3 text-center font-bold tabular-nums text-slate-800">{it.quantity}</td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums text-slate-600">{formatBRL(it.unit_price)}</td>
                      {items.some(i => Number(i.discount_amount) > 0) && (
                        <td className="px-4 py-3 text-right font-medium tabular-nums text-emerald-600">
                          {Number(it.discount_amount) > 0 ? `- ${formatBRL(it.discount_amount!)}` : '—'}
                        </td>
                      )}
                      <td className="px-4 py-3 text-right font-bold tabular-nums text-slate-900">{formatBRL(it.total_price)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Financial & Summary Area */}
        <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
          
          {/* Payment Terms & Notes */}
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4 space-y-2">
              <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Condições de Pagamento</h4>
              <div className="text-xs space-y-1.5 leading-relaxed text-slate-700 font-medium">
                <p>
                  Modalidade:{' '}
                  <span className="font-bold text-slate-800">
                    {order.payment_option === 'A_PRAZO' ? 'À Prazo' : 'À Vista'}
                  </span>
                </p>
                <p>
                  Meio de Pagamento:{' '}
                  <span className="font-bold text-slate-800">
                    {order.payment_method ? PAYMENT_METHOD_LABEL[order.payment_method as PaymentMethod] ?? order.payment_method : 'Não informado'}
                  </span>
                </p>
                {Number(order.down_payment_amount) > 0 && (
                  <p>
                    Entrada / Ato:{' '}
                    <span className="font-bold text-emerald-700 tabular-nums">
                      {formatBRL(order.down_payment_amount!)}
                    </span>
                    {order.down_payment_method && (
                      <span className="text-slate-500 font-normal"> ({PAYMENT_METHOD_LABEL[order.down_payment_method as PaymentMethod] ?? order.down_payment_method})</span>
                    )}
                  </p>
                )}
                {order.payment_option === 'A_PRAZO' && order.installments_count && (
                  <p>
                    Parcelamento:{' '}
                    <span className="font-bold text-slate-800 tabular-nums">
                      {order.installments_count}x de{' '}
                      {formatBRL((order.total_amount - Number(order.down_payment_amount ?? 0)) / order.installments_count)}
                    </span>
                  </p>
                )}
              </div>
            </div>

            {order.notes && (
              <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
                <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1.5">Observações Comerciais</h4>
                <p className="whitespace-pre-wrap text-xs text-slate-600 leading-relaxed font-medium uppercase">{order.notes}</p>
              </div>
            )}
          </div>

          {/* Pricing Totals Box */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/30 p-5 h-fit space-y-3.5 shadow-sm">
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-400">Totalizadores</h4>
            <div className="space-y-2 text-xs font-medium text-slate-600">
              <div className="flex justify-between">
                <span>Subtotal dos Itens</span>
                <span className="font-semibold tabular-nums text-slate-800">{formatBRL(subtotal)}</span>
              </div>
              {Number(order.discount_total) > 0 && (
                <div className="flex justify-between text-emerald-600 font-semibold">
                  <span>Desconto Aplicado</span>
                  <span className="tabular-nums">- {formatBRL(order.discount_total!)}</span>
                </div>
              )}
              {Number(order.freight_amount) > 0 && (
                <div className="flex justify-between">
                  <span>Frete</span>
                  <span className="font-semibold tabular-nums text-slate-800">+ {formatBRL(order.freight_amount!)}</span>
                </div>
              )}
              {Number(order.other_expenses) > 0 && (
                <div className="flex justify-between">
                  <span>Outras Despesas</span>
                  <span className="font-semibold tabular-nums text-slate-800">+ {formatBRL(order.other_expenses!)}</span>
                </div>
              )}
              <hr className="border-slate-200 my-1" />
              <div className="flex justify-between items-baseline font-bold text-slate-900">
                <span className="text-sm">Total do Documento</span>
                <span className="text-xl text-emerald-700 tabular-nums">{formatBRL(order.total_amount)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Signatures Panel */}
        <div className="mt-16 border-t border-slate-200 pt-16 print:mt-12 print:pt-12">
          <div className="grid grid-cols-1 gap-12 sm:grid-cols-2 text-center text-xs">
            <div className="space-y-1">
              <div className="mx-auto w-64 border-b border-slate-400 pb-1"></div>
              <p className="font-bold text-slate-700 uppercase">{client?.full_name ?? 'Cliente'}</p>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider">Assinatura do Cliente</p>
            </div>
            
            <div className="space-y-1">
              <div className="mx-auto w-64 border-b border-slate-400 pb-1"></div>
              <p className="font-bold text-slate-700 uppercase">{order.created_by_name ?? 'Consultor Autorizado'}</p>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider">Assinatura do Consultor</p>
            </div>
          </div>
        </div>

        {/* Footer info (only on print) */}
        <div className="hidden print:block mt-16 text-center text-[9px] text-slate-400 border-t border-slate-100 pt-4">
          Documento gerado através do Sistema Financeiro LSH - BemAviv. Todos os direitos reservados.
        </div>
      </div>
    </div>
  )
}
