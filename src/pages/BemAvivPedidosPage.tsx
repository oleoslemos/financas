import { useUser } from '@clerk/clerk-react'
import { useEffect, useState } from 'react'
import { useSupabase } from '../hooks/useSupabase'
import { resolveDataOwnerId } from '../lib/dataOwner'
import { formatBRL, parseMoney } from '../lib/format'
import { toUpperTrim } from '../lib/text'

type Pedido = {
  id: string
  order_date: string
  status: string
  total_amount: number
  notes: string | null
}

type ClienteOpt = { id: string; full_name: string }

export function BemAvivPedidosPage() {
  const { user } = useUser()
  const supabase = useSupabase()
  const ownerUserId = resolveDataOwnerId(user?.id, user?.primaryEmailAddress?.emailAddress)
  const [rows, setRows] = useState<Pedido[]>([])
  const [clients, setClients] = useState<ClienteOpt[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({
    client_id: '',
    order_date: new Date().toISOString().slice(0, 10),
    status: 'ABERTO',
    total_amount: '',
    notes: '',
  })

  async function load() {
    if (!supabase || !ownerUserId) return
    setLoading(true)
    const [{ data: orders }, { data: cl }] = await Promise.all([
      supabase.from('bem_aviv_sales_orders').select('*').eq('user_id', ownerUserId).order('order_date', { ascending: false }),
      supabase.from('bem_aviv_clients').select('id, full_name').eq('user_id', ownerUserId).order('full_name'),
    ])
    setRows((orders as Pedido[]) ?? [])
    setClients((cl as ClienteOpt[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, ownerUserId])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !ownerUserId) return
    const { error } = await supabase.from('bem_aviv_sales_orders').insert({
      user_id: ownerUserId,
      client_id: form.client_id || null,
      order_date: form.order_date,
      status: toUpperTrim(form.status),
      total_amount: parseMoney(form.total_amount),
      notes: toUpperTrim(form.notes) || null,
    })
    if (error) alert(error.message)
    else {
      setForm({ client_id: '', order_date: new Date().toISOString().slice(0, 10), status: 'ABERTO', total_amount: '', notes: '' })
      load()
    }
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
        <div className="sm:col-span-2"><button className="btn btn-primary">ADICIONAR PEDIDO</button></div>
      </form>

      <div className="table-wrap">
        {loading ? <p className="p-4 text-slate-500">CARREGANDO...</p> : (
          <table>
            <thead><tr><th>DATA</th><th>STATUS</th><th>TOTAL</th><th>OBS</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.order_date}</td>
                  <td>{r.status}</td>
                  <td>{formatBRL(Number(r.total_amount))}</td>
                  <td>{r.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
