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
  discount_total: number | null
  installments_count: number | null
}

type ClienteOpt = { id: string; full_name: string }

type ProdutoOpt = { id: string; name: string; price: number | null }

type CellOpt = {
  id: string
  price: number
  label: string
}

type LinhaItem = {
  key: string
  product_id: string
  catalog_price_cell_id: string | null
  dimension_label: string | null
  name: string
  unit_price: number
  quantity: number
  discount_amount: number
}

function newLineKey() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Date.now() + Math.random())
}

function clampMoney(n: number) {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.round(n * 100) / 100)
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
    discount_total: '',
    installments_count: '1',
    notes: '',
  })
  const [draftProductId, setDraftProductId] = useState('')
  const [draftCellId, setDraftCellId] = useState('')
  const [cellOptions, setCellOptions] = useState<CellOpt[]>([])
  const [loadingCells, setLoadingCells] = useState(false)
  const [draftQty, setDraftQty] = useState('1')
  const [draftLineDiscount, setDraftLineDiscount] = useState('')
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

  useEffect(() => {
    let cancelled = false
    async function loadCells() {
      if (!supabase || !ownerUserId || !draftProductId) {
        setCellOptions([])
        setDraftCellId('')
        return
      }
      setLoadingCells(true)
      const { data: blocks } = await supabase
        .from('bem_aviv_catalog_products')
        .select('id, name')
        .eq('user_id', ownerUserId)
        .eq('product_id', draftProductId)
        .eq('active', true)

      if (cancelled) return

      if (!blocks?.length) {
        setCellOptions([])
        setDraftCellId('')
        setLoadingCells(false)
        return
      }

      const blockIds = blocks.map((b: { id: string }) => b.id)
      const blockNameById = Object.fromEntries(blocks.map((b: { id: string; name: string }) => [b.id, b.name]))

      const { data: cells } = await supabase
        .from('bem_aviv_catalog_price_cells')
        .select('id, price, catalog_product_id, row_value_id, col_value_id')
        .in('catalog_product_id', blockIds)
        .eq('active', true)

      if (cancelled) return

      if (!cells?.length) {
        setCellOptions([])
        setDraftCellId('')
        setLoadingCells(false)
        return
      }

      const valueIds = [
        ...new Set(
          cells.flatMap((c: { row_value_id: string | null; col_value_id: string | null }) => [c.row_value_id, c.col_value_id].filter(Boolean) as string[]),
        ),
      ]
      const { data: vals } = await supabase.from('bem_aviv_catalog_axis_values').select('id, value_label').in('id', valueIds)

      if (cancelled) return

      const labelById: Record<string, string> = Object.fromEntries((vals ?? []).map((v: { id: string; value_label: string }) => [v.id, v.value_label]))

      const opts: CellOpt[] = (cells as Array<{ id: string; price: number; catalog_product_id: string; row_value_id: string | null; col_value_id: string | null }>)
        .filter((c) => c.row_value_id && c.col_value_id)
        .map((c) => ({
          id: c.id,
          price: Number(c.price),
          label: `${blockNameById[c.catalog_product_id]}: ${labelById[c.row_value_id!] ?? '?'} × ${labelById[c.col_value_id!] ?? '?'}`,
        }))
        .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))

      setCellOptions(opts)
      setDraftCellId('')
      setLoadingCells(false)
    }
    void loadCells()
    return () => {
      cancelled = true
    }
  }, [draftProductId, ownerUserId, supabase])

  const sumLinesNet = useMemo(
    () =>
      lineItems.reduce((acc, l) => {
        const gross = l.quantity * l.unit_price
        return acc + clampMoney(gross - l.discount_amount)
      }, 0),
    [lineItems],
  )

  const orderDiscount = useMemo(() => clampMoney(parseMoney(form.discount_total || '0')), [form.discount_total])

  const installmentsNum = useMemo(() => Math.min(120, Math.max(1, parseInt(form.installments_count.replace(/\D/g, ''), 10) || 1)), [form.installments_count])

  const previewOrderTotal = useMemo(() => {
    if (lineItems.length === 0) return null
    return clampMoney(sumLinesNet - orderDiscount)
  }, [lineItems.length, sumLinesNet, orderDiscount])

  const previewInstallment = useMemo(() => {
    if (previewOrderTotal == null || installmentsNum <= 0) return null
    return previewOrderTotal / installmentsNum
  }, [previewOrderTotal, installmentsNum])

  const manualNetTotal = useMemo(() => {
    if (lineItems.length > 0) return null
    return clampMoney(parseMoney(form.total_amount || '0') - orderDiscount)
  }, [lineItems.length, form.total_amount, orderDiscount])

  function addLineFromDraft() {
    const p = products.find((x) => x.id === draftProductId)
    if (!p) {
      alert('SELECIONE UM PRODUTO.')
      return
    }
    const cell = draftCellId ? cellOptions.find((c) => c.id === draftCellId) : null
    if (cellOptions.length > 0 && !cell) {
      alert('SELECIONE A COMBINAÇÃO (TAMANHO / DIMENSÃO) NA MATRIZ DE PREÇO DESTE PRODUTO.')
      return
    }
    const qty = Math.max(1, parseInt(draftQty.replace(/\D/g, ''), 10) || 1)
    const unit = cell ? cell.price : p.price != null ? Number(p.price) : 0
    if (unit <= 0) {
      alert('PREÇO INVÁLIDO. USE UMA CÉLULA DA MATRIZ OU CADASTRE PREÇO NO PRODUTO.')
      return
    }
    const gross = qty * unit
    const disc = clampMoney(parseMoney(draftLineDiscount || '0'))
    if (disc > gross) {
      alert('DESCONTO DO ITEM NÃO PODE SER MAIOR QUE O SUBTOTAL (QTD × UNITÁRIO).')
      return
    }
    const dimLabel = cell ? cell.label : null
    const descName = cell ? `${p.name} — ${cell.label}` : p.name
    setLineItems((prev) => [
      ...prev,
      {
        key: newLineKey(),
        product_id: p.id,
        catalog_price_cell_id: cell ? cell.id : null,
        dimension_label: dimLabel,
        name: descName,
        unit_price: unit,
        quantity: qty,
        discount_amount: disc,
      },
    ])
    setDraftProductId('')
    setDraftCellId('')
    setDraftQty('1')
    setDraftLineDiscount('')
  }

  function removeLine(key: string) {
    setLineItems((prev) => prev.filter((l) => l.key !== key))
  }

  function updateLineQty(key: string, qtyStr: string) {
    const qty = Math.max(1, parseInt(qtyStr.replace(/\D/g, ''), 10) || 1)
    setLineItems((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l
        const gross = qty * l.unit_price
        const disc = Math.min(l.discount_amount, gross)
        return { ...l, quantity: qty, discount_amount: disc }
      }),
    )
  }

  function updateLineDiscount(key: string, raw: string) {
    const disc = clampMoney(parseMoney(raw || '0'))
    setLineItems((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l
        const gross = l.quantity * l.unit_price
        return { ...l, discount_amount: Math.min(disc, gross) }
      }),
    )
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !ownerUserId) return

    const hasLines = lineItems.length > 0
    const manualGross = parseMoney(form.total_amount || '0')
    const discOrder = orderDiscount
    const inst = installmentsNum

    if (hasLines) {
      const net = clampMoney(sumLinesNet - discOrder)
      if (net < 0) {
        alert('DESCONTO NO PEDIDO É MAIOR QUE A SOMA DOS ITENS.')
        return
      }
    } else {
      if (!form.total_amount.trim()) {
        alert('INFORME O VALOR TOTAL OU ADICIONE ITENS AO PEDIDO.')
        return
      }
      if (clampMoney(manualGross - discOrder) < 0) {
        alert('DESCONTO NO PEDIDO NÃO PODE SER MAIOR QUE O VALOR INFORMADO.')
        return
      }
    }

    const totalInsert = hasLines
      ? clampMoney(sumLinesNet - discOrder)
      : clampMoney(manualGross - discOrder)

    const { data: inserted, error } = await supabase
      .from('bem_aviv_sales_orders')
      .insert({
        user_id: ownerUserId,
        client_id: form.client_id || null,
        order_date: form.order_date,
        document_type: form.document_type,
        status: toUpperTrim(form.status),
        total_amount: totalInsert,
        discount_total: discOrder,
        installments_count: inst,
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
      const rowsToInsert = lineItems.map((l) => {
        const gross = l.quantity * l.unit_price
        const net = clampMoney(gross - l.discount_amount)
        return {
          user_id: ownerUserId,
          sales_order_id: orderId,
          product_id: l.product_id,
          catalog_price_cell_id: l.catalog_price_cell_id,
          item_description: toUpperTrim(l.name),
          quantity: l.quantity,
          unit_price: l.unit_price,
          discount_amount: l.discount_amount,
          total_price: net,
        }
      })
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
      discount_total: '',
      installments_count: '1',
      notes: '',
    })
    setLineItems([])
    setDraftProductId('')
    setDraftCellId('')
    setDraftQty('1')
    setDraftLineDiscount('')
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

    const disc = quote.discount_total != null ? Number(quote.discount_total) : 0
    const inst = quote.installments_count != null ? Number(quote.installments_count) : 1

    const { data: inserted, error: insertError } = await supabase
      .from('bem_aviv_sales_orders')
      .insert({
        user_id: ownerUserId,
        client_id: quote.client_id,
        order_date: new Date().toISOString().slice(0, 10),
        document_type: 'PEDIDO',
        status: 'ABERTO',
        total_amount: quote.total_amount,
        discount_total: disc,
        installments_count: Math.min(120, Math.max(1, inst)),
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
          <label>DESCONTO NO PEDIDO (R$)</label>
          <input
            value={form.discount_total}
            onChange={(e) => setForm({ ...form, discount_total: e.target.value })}
            placeholder="0"
            inputMode="decimal"
          />
        </div>
        <div>
          <label>PARCELAS</label>
          <input
            inputMode="numeric"
            min={1}
            max={120}
            value={form.installments_count}
            onChange={(e) => setForm({ ...form, installments_count: e.target.value })}
          />
          {previewInstallment != null && previewOrderTotal != null && installmentsNum > 1 ? (
            <p className="mt-1 text-xs font-normal normal-case text-slate-600">
              Prévia: {installmentsNum}x de {formatBRL(previewInstallment)} (total {formatBRL(previewOrderTotal)})
            </p>
          ) : null}
          {lineItems.length === 0 && manualNetTotal != null && installmentsNum > 1 && form.total_amount.trim() ? (
            <p className="mt-1 text-xs font-normal normal-case text-slate-600">
              Prévia: {installmentsNum}x de {formatBRL(manualNetTotal / installmentsNum)} (líquido {formatBRL(manualNetTotal)})
            </p>
          ) : null}
        </div>
        <div>
          <label>VALOR TOTAL {lineItems.length > 0 ? '(BRUTO DOS ITENS)' : ''}</label>
          <input
            value={lineItems.length > 0 ? formatBRL(lineItems.reduce((a, l) => a + l.quantity * l.unit_price, 0)) : form.total_amount}
            onChange={(e) => {
              if (lineItems.length === 0) setForm({ ...form, total_amount: e.target.value })
            }}
            readOnly={lineItems.length > 0}
            required={lineItems.length === 0}
          />
          {lineItems.length > 0 && previewOrderTotal != null ? (
            <p className="mt-1 text-xs font-normal normal-case text-slate-600">
              Líquido estimado (itens − desconto pedido): <strong>{formatBRL(previewOrderTotal)}</strong> — o valor gravado após salvar segue a regra do banco (soma dos itens − desconto).
            </p>
          ) : null}
        </div>
        <div className="sm:col-span-2">
          <label>OBSERVAÇÕES</label>
          <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>

        <div className="sm:col-span-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <h3 className="mb-2 text-sm font-semibold text-slate-800">ITENS</h3>
          <div className="grid gap-3 sm:grid-cols-12">
            <div className="sm:col-span-5">
              <label>PRODUTO</label>
              <select value={draftProductId} onChange={(e) => setDraftProductId(e.target.value)}>
                <option value="">— SELECIONE —</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-5">
              <label>TAMANHO / DIMENSÃO (MATRIZ)</label>
              <select
                value={draftCellId}
                onChange={(e) => setDraftCellId(e.target.value)}
                disabled={!draftProductId || cellOptions.length === 0}
              >
                <option value="">{cellOptions.length === 0 ? '— USE PREÇO DO CADASTRO —' : '— SELECIONE A COMBINAÇÃO —'}</option>
                {cellOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label} — {formatBRL(c.price)}
                  </option>
                ))}
              </select>
              {loadingCells && draftProductId ? <p className="mt-1 text-xs text-slate-500">Carregando combinações…</p> : null}
            </div>
            <div className="sm:col-span-2">
              <label>QTD</label>
              <input inputMode="numeric" value={draftQty} onChange={(e) => setDraftQty(e.target.value)} />
            </div>
            <div className="sm:col-span-4">
              <label>DESCONTO NO ITEM (R$)</label>
              <input inputMode="decimal" value={draftLineDiscount} onChange={(e) => setDraftLineDiscount(e.target.value)} placeholder="0" />
            </div>
            <div className="flex items-end sm:col-span-2">
              <Button type="button" variant="secondary" onClick={addLineFromDraft}>
                ADICIONAR ITEM
              </Button>
            </div>
          </div>
          {products.length === 0 && <p className="mt-2 text-sm text-amber-800">CADASTRE PRODUTOS EM GERAL → PRODUTOS.</p>}
          {draftProductId && cellOptions.length === 0 && !loadingCells && (
            <p className="mt-2 text-xs font-normal normal-case text-slate-600">
              Este produto não está em nenhum bloco de catálogo em grade com células cadastradas; o preço será o do cadastro de produtos.
            </p>
          )}
          {lineItems.length > 0 && (
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left">DESCRIÇÃO</th>
                    <th className="text-right">UNIT.</th>
                    <th className="text-right">QTD</th>
                    <th className="text-right">DESC. R$</th>
                    <th className="text-right">LÍQUIDO</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((l) => {
                    const gross = l.quantity * l.unit_price
                    const net = clampMoney(gross - l.discount_amount)
                    return (
                      <tr key={l.key}>
                        <td className="max-w-[14rem] whitespace-normal">{l.name}</td>
                        <td className="text-right">{formatBRL(l.unit_price)}</td>
                        <td className="text-right">
                          <input
                            className="w-16 text-right"
                            inputMode="numeric"
                            value={String(l.quantity)}
                            onChange={(e) => updateLineQty(l.key, e.target.value)}
                          />
                        </td>
                        <td className="text-right">
                          <input
                            className="w-24 text-right"
                            inputMode="decimal"
                            value={l.discount_amount > 0 ? String(l.discount_amount).replace('.', ',') : ''}
                            placeholder="0"
                            onChange={(e) => updateLineDiscount(l.key, e.target.value)}
                          />
                        </td>
                        <td className="text-right">{formatBRL(net)}</td>
                        <td>
                          <Button type="button" variant="ghost" className="text-red-600" onClick={() => removeLine(l.key)}>
                            REMOVER
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="sm:col-span-2">
          <Button type="submit" variant="primary">
            {form.document_type === 'ORCAMENTO' ? 'ADICIONAR ORÇAMENTO' : 'ADICIONAR PEDIDO'}
          </Button>
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
                <th>PARCELAS</th>
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
                  <td>{r.installments_count ?? 1}</td>
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
