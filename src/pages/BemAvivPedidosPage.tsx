import { useUser } from '@clerk/clerk-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '../components/ui/Button'
import { useSupabase } from '../hooks/useSupabase'
import { resolveDataOwnerId } from '../lib/dataOwner'
import { clerkEmailCandidates } from '../lib/clerkEmails'
import { formatBRL, parseMoney } from '../lib/format'
import { toUpperTrim } from '../lib/text'

type Pedido = {
  id: string
  client_id: string | null
  order_date: string
  document_type: 'ORCAMENTO' | 'PEDIDO'
  document_number: string | null
  source_quote_id: string | null
  converted_order_id: string | null
  status: string
  total_amount: number
  notes: string | null
}

type ClienteOpt = { id: string; full_name: string }

type ProdutoOpt = { id: string; name: string; price: number | null }

type LinhaItem = {
  key: string
  product_id: string
  name: string
  unit_price: number
  quantity: number
}

function newLineKey() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now() + Math.random())
}

export function BemAvivPedidosPage() {
  const { user } = useUser()
  const supabase = useSupabase()
  const ownerUserId = resolveDataOwnerId(user?.id, clerkEmailCandidates(user).join(','))
  const [rows, setRows] = useState<Pedido[]>([])
  const [clients, setClients] = useState<ClienteOpt[]>([])
  const [products, setProducts] = useState<ProdutoOpt[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({
    client_id: '',
    order_date: new Date().toISOString().slice(0, 10),
    document_type: 'PEDIDO' as 'ORCAMENTO' | 'PEDIDO',
    status: 'ABERTO',
    total_amount: '',
    notes: '',
  })
  const [draftProductId, setDraftProductId] = useState('')
  const [draftQty, setDraftQty] = useState('1')
  const [lineItems, setLineItems] = useState<LinhaItem[]>([])

  const load = useCallback(async () => {
    if (!supabase || !ownerUserId) return
    setLoading(true)
    const [{ data: orders }, { data: cl }, { data: prods }] = await Promise.all([
      supabase.from('bem_aviv_sales_orders').select('*').eq('user_id', ownerUserId).order('order_date', { ascending: false }),
      supabase.from('bem_aviv_clients').select('id, full_name').eq('user_id', ownerUserId).order('full_name'),
      supabase.from('bem_aviv_products').select('id, name, price').eq('user_id', ownerUserId).order('name'),
    ])
    setRows((orders as Pedido[]) ?? [])
    setClients((cl as ClienteOpt[]) ?? [])
    setProducts((prods as ProdutoOpt[]) ?? [])
    setLoading(false)
  }, [ownerUserId, supabase])

  useEffect(() => {
    void load()
  }, [load])

  const totalFromLines = useMemo(
    () => lineItems.reduce((acc, l) => acc + l.quantity * l.unit_price, 0),
    [lineItems],
  )

  function addLineFromDraft() {
    const p = products.find((x) => x.id === draftProductId)
    if (!p) {
      alert('SELECIONE UM PRODUTO.')
      return
    }
    const qty = Math.max(1, parseInt(draftQty.replace(/\D/g, ''), 10) || 1)
    const unit = p.price != null ? Number(p.price) : 0
    if (unit <= 0) {
      alert('PRODUTO SEM PREÇO CADASTRADO. AJUSTE O CADASTRO DE PRODUTOS OU USE OUTRO ITEM.')
      return
    }
    setLineItems((prev) => [
      ...prev,
      {
        key: newLineKey(),
        product_id: p.id,
        name: p.name,
        unit_price: unit,
        quantity: qty,
      },
    ])
    setDraftProductId('')
    setDraftQty('1')
  }

  function removeLine(key: string) {
    setLineItems((prev) => prev.filter((l) => l.key !== key))
  }

  function updateLineQty(key: string, qtyStr: string) {
    const qty = Math.max(1, parseInt(qtyStr.replace(/\D/g, ''), 10) || 1)
    setLineItems((prev) => prev.map((l) => (l.key === key ? { ...l, quantity: qty } : l)))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !ownerUserId) return

    const hasLines = lineItems.length > 0
    const manualTotal = parseMoney(form.total_amount)
    const computed = hasLines ? totalFromLines : manualTotal

    if (hasLines && computed <= 0) {
      alert('REVISE OS ITENS: TOTAL INVÁLIDO.')
      return
    }
    if (!hasLines && !form.total_amount.trim()) {
      alert('INFORME O VALOR TOTAL OU ADICIONE ITENS AO PEDIDO.')
      return
    }

    const { data: inserted, error } = await supabase
      .from('bem_aviv_sales_orders')
      .insert({
        user_id: ownerUserId,
        client_id: form.client_id || null,
        order_date: form.order_date,
        document_type: form.document_type,
        status: toUpperTrim(form.status),
        total_amount: computed,
        notes: toUpperTrim(form.notes) || null,
      })
      .select('id')
      .single()

    if (error) {
      alert(error.message)
      return
    }

    const orderId = (inserted as { id: string }).id

    if (hasLines) {
      const rowsToInsert = lineItems.map((l) => ({
        user_id: ownerUserId,
        sales_order_id: orderId,
        product_id: l.product_id,
        catalog_price_cell_id: null,
        item_description: toUpperTrim(l.name),
        quantity: l.quantity,
        unit_price: l.unit_price,
        discount_amount: 0,
        total_price: l.quantity * l.unit_price,
      }))
      const { error: itemsErr } = await supabase.from('bem_aviv_sales_order_items').insert(rowsToInsert)
      if (itemsErr) {
        alert(itemsErr.message)
        return
      }
    }

    setForm({
      client_id: '',
      order_date: new Date().toISOString().slice(0, 10),
      document_type: 'PEDIDO',
      status: 'ABERTO',
      total_amount: '',
      notes: '',
    })
    setLineItems([])
    setDraftProductId('')
    setDraftQty('1')
    await load()
  }

  async function closeQuoteAndCreateOrder(quote: Pedido) {
    if (!supabase || !ownerUserId) return
    if (quote.document_type !== 'ORCAMENTO') return
    if (quote.converted_order_id) {
      alert('ESTE ORÇAMENTO JÁ FOI CONVERTIDO EM PEDIDO.')
      return
    }
    if (!confirm(`FECHAR O ORÇAMENTO ${quote.document_number ?? ''} E CRIAR UM PEDIDO?`)) return

    const { data: quoteItems, error: qiErr } = await supabase
      .from('bem_aviv_sales_order_items')
      .select('product_id, catalog_price_cell_id, item_description, quantity, unit_price, discount_amount, total_price')
      .eq('sales_order_id', quote.id)

    if (qiErr) {
      alert(qiErr.message)
      return
    }

    const { data: inserted, error: insertError } = await supabase
      .from('bem_aviv_sales_orders')
      .insert({
        user_id: ownerUserId,
        client_id: quote.client_id,
        order_date: new Date().toISOString().slice(0, 10),
        document_type: 'PEDIDO',
        status: 'ABERTO',
        total_amount: quote.total_amount,
        notes: quote.notes ? `${quote.notes} | GERADO A PARTIR DE ${quote.document_number ?? 'ORÇAMENTO'}` : `GERADO A PARTIR DE ${quote.document_number ?? 'ORÇAMENTO'}`,
        source_quote_id: quote.id,
      })
      .select('id, document_number')
      .single()

    if (insertError) {
      alert(insertError.message)
      return
    }

    const newOrder = inserted as { id: string; document_number: string | null }

    const items = (quoteItems ?? []) as Array<{
      product_id: string | null
      catalog_price_cell_id: string | null
      item_description: string
      quantity: number
      unit_price: number
      discount_amount: number
      total_price: number
    }>

    if (items.length > 0) {
      const copyRows = items.map((it) => ({
        user_id: ownerUserId,
        sales_order_id: newOrder.id,
        product_id: it.product_id,
        catalog_price_cell_id: it.catalog_price_cell_id,
        item_description: it.item_description,
        quantity: it.quantity,
        unit_price: it.unit_price,
        discount_amount: it.discount_amount ?? 0,
        total_price: it.total_price,
      }))
      const { error: copyErr } = await supabase.from('bem_aviv_sales_order_items').insert(copyRows)
      if (copyErr) {
        alert(copyErr.message)
        return
      }
    }

    const { error: updError } = await supabase
      .from('bem_aviv_sales_orders')
      .update({
        status: 'FECHADO',
        converted_order_id: newOrder.id,
      })
      .eq('id', quote.id)

    if (updError) {
      alert(updError.message)
      return
    }

    alert(`PEDIDO ${newOrder.document_number ?? ''} CRIADO COM SUCESSO.`)
    await load()
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">PEDIDOS DE VENDAS</h2>
      <form onSubmit={submit} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-2">
        <div>
          <label>CLIENTE</label>
          <select value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })}>
            <option value="">—</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>DATA DO PEDIDO</label>
          <input type="date" value={form.order_date} onChange={(e) => setForm({ ...form, order_date: e.target.value })} required />
        </div>
        <div>
          <label>TIPO</label>
          <select
            value={form.document_type}
            onChange={(e) => setForm({ ...form, document_type: e.target.value as 'ORCAMENTO' | 'PEDIDO' })}
          >
            <option value="ORCAMENTO">ORÇAMENTO</option>
            <option value="PEDIDO">PEDIDO</option>
          </select>
        </div>
        <div>
          <label>STATUS</label>
          <input value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} required />
        </div>
        <div>
          <label>VALOR TOTAL {lineItems.length > 0 ? '(CALCULADO PELOS ITENS)' : ''}</label>
          <input
            value={lineItems.length > 0 ? formatBRL(totalFromLines) : form.total_amount}
            onChange={(e) => {
              if (lineItems.length === 0) setForm({ ...form, total_amount: e.target.value })
            }}
            readOnly={lineItems.length > 0}
            required={lineItems.length === 0}
          />
        </div>
        <div className="sm:col-span-2">
          <label>OBSERVAÇÕES</label>
          <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>

        <div className="sm:col-span-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <h3 className="mb-2 text-sm font-semibold text-slate-800">ITENS (PRODUTOS CADASTRADOS)</h3>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="min-w-0 flex-1">
              <label>PRODUTO</label>
              <select value={draftProductId} onChange={(e) => setDraftProductId(e.target.value)}>
                <option value="">— SELECIONE —</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.price != null ? ` (${formatBRL(Number(p.price))})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-24">
              <label>QTD</label>
              <input inputMode="numeric" value={draftQty} onChange={(e) => setDraftQty(e.target.value)} />
            </div>
            <Button type="button" variant="secondary" onClick={addLineFromDraft}>
              ADICIONAR ITEM
            </Button>
          </div>
          {products.length === 0 && <p className="mt-2 text-sm text-amber-800">CADASTRE PRODUTOS EM GERAL → PRODUTOS.</p>}
          {lineItems.length > 0 && (
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left">PRODUTO</th>
                    <th className="text-right">UNIT.</th>
                    <th className="text-right">QTD</th>
                    <th className="text-right">SUBTOTAL</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((l) => (
                    <tr key={l.key}>
                      <td>{l.name}</td>
                      <td className="text-right">{formatBRL(l.unit_price)}</td>
                      <td className="text-right">
                        <input
                          className="w-16 text-right"
                          inputMode="numeric"
                          value={String(l.quantity)}
                          onChange={(e) => updateLineQty(l.key, e.target.value)}
                        />
                      </td>
                      <td className="text-right">{formatBRL(l.quantity * l.unit_price)}</td>
                      <td>
                        <Button type="button" variant="ghost" className="text-red-600" onClick={() => removeLine(l.key)}>
                          REMOVER
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="sm:col-span-2">
          <Button variant="primary">{form.document_type === 'ORCAMENTO' ? 'ADICIONAR ORÇAMENTO' : 'ADICIONAR PEDIDO'}</Button>
        </div>
      </form>

      <div className="table-wrap">
        {loading ? (
          <p className="p-4 text-slate-500">CARREGANDO...</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>NÚMERO</th>
                <th>TIPO</th>
                <th>DATA</th>
                <th>STATUS</th>
                <th>TOTAL</th>
                <th>OBS</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.document_number || '—'}</td>
                  <td>{r.document_type}</td>
                  <td>{r.order_date}</td>
                  <td>{r.status}</td>
                  <td>{formatBRL(Number(r.total_amount))}</td>
                  <td>{r.notes || '—'}</td>
                  <td className="whitespace-nowrap">
                    {r.document_type === 'ORCAMENTO' ? (
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={!!r.converted_order_id}
                        onClick={() => closeQuoteAndCreateOrder(r)}
                      >
                        {r.converted_order_id ? 'CONVERTIDO' : 'FECHAR E GERAR PEDIDO'}
                      </Button>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
