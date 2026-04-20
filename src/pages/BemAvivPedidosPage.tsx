import { useUser } from '@clerk/clerk-react'
import { useCallback, useEffect, useState } from 'react'
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

export function BemAvivPedidosPage() {
  const { user } = useUser()
  const supabase = useSupabase()
  const ownerUserId = resolveDataOwnerId(user?.id, clerkEmailCandidates(user).join(','))
  const [rows, setRows] = useState<Pedido[]>([])
  const [clients, setClients] = useState<ClienteOpt[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({
    client_id: '',
    order_date: new Date().toISOString().slice(0, 10),
    document_type: 'PEDIDO' as 'ORCAMENTO' | 'PEDIDO',
    status: 'ABERTO',
    total_amount: '',
    notes: '',
  })

  const load = useCallback(async () => {
    if (!supabase || !ownerUserId) return
    setLoading(true)
    const [{ data: orders }, { data: cl }] = await Promise.all([
      supabase.from('bem_aviv_sales_orders').select('*').eq('user_id', ownerUserId).order('order_date', { ascending: false }),
      supabase.from('bem_aviv_clients').select('id, full_name').eq('user_id', ownerUserId).order('full_name'),
    ])
    setRows((orders as Pedido[]) ?? [])
    setClients((cl as ClienteOpt[]) ?? [])
    setLoading(false)
  }, [ownerUserId, supabase])

  useEffect(() => {
    void load()
  }, [load])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !ownerUserId) return
    const { error } = await supabase.from('bem_aviv_sales_orders').insert({
      user_id: ownerUserId,
      client_id: form.client_id || null,
      order_date: form.order_date,
      document_type: form.document_type,
      status: toUpperTrim(form.status),
      total_amount: parseMoney(form.total_amount),
      notes: toUpperTrim(form.notes) || null,
    })
    if (error) alert(error.message)
    else {
      setForm({
        client_id: '',
        order_date: new Date().toISOString().slice(0, 10),
        document_type: 'PEDIDO',
        status: 'ABERTO',
        total_amount: '',
        notes: '',
      })
      load()
    }
  }

  async function closeQuoteAndCreateOrder(quote: Pedido) {
    if (!supabase || !ownerUserId) return
    if (quote.document_type !== 'ORCAMENTO') return
    if (quote.converted_order_id) {
      alert('ESTE ORÇAMENTO JÁ FOI CONVERTIDO EM PEDIDO.')
      return
    }
    if (!confirm(`FECHAR O ORÇAMENTO ${quote.document_number ?? ''} E CRIAR UM PEDIDO?`)) return

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
            {clients.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
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
          <label>VALOR TOTAL</label>
          <input value={form.total_amount} onChange={(e) => setForm({ ...form, total_amount: e.target.value })} required />
        </div>
        <div className="sm:col-span-2">
          <label>OBSERVAÇÕES</label>
          <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <Button variant="primary">{form.document_type === 'ORCAMENTO' ? 'ADICIONAR ORÇAMENTO' : 'ADICIONAR PEDIDO'}</Button>
        </div>
      </form>

      <div className="table-wrap">
        {loading ? <p className="p-4 text-slate-500">CARREGANDO...</p> : (
          <table>
            <thead><tr><th>NÚMERO</th><th>TIPO</th><th>DATA</th><th>STATUS</th><th>TOTAL</th><th>OBS</th><th></th></tr></thead>
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
