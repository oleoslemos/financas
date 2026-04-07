import { useUser } from '@clerk/clerk-react'
import { Pencil, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSupabase } from '../hooks/useSupabase'
import { resolveDataOwnerId } from '../lib/dataOwner'
import { toUpperTrim } from '../lib/text'

type Cliente = {
  id: string
  full_name: string
  cpf: string
  birth_date: string | null
  phone_1: string | null
  phone_2: string | null
  full_address: string | null
  email: string | null
}

function onlyDigits(v: string) {
  return v.replace(/\D/g, '')
}

function formatPhone(v?: string | null) {
  const d = onlyDigits(v ?? '')
  if (!d) return ''
  if (d.length <= 2) return `(${d}`
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 11) return `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(d.length - 4)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7, 11)}`
}

function formatCpf(v?: string | null) {
  const d = onlyDigits(v ?? '').slice(0, 11)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
}

export function BemAvivClientesPage() {
  const { user } = useUser()
  const supabase = useSupabase()
  const ownerUserId = resolveDataOwnerId(user?.id)

  const [rows, setRows] = useState<Cliente[]>([])
  const [editing, setEditing] = useState<Cliente | null>(null)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({
    full_name: '',
    cpf: '',
    birth_date: '',
    phone_1: '',
    phone_2: '',
    full_address: '',
    email: '',
  })

  async function load() {
    if (!supabase || !ownerUserId) return
    setLoading(true)
    const { data } = await supabase.from('bem_aviv_clients').select('*').eq('user_id', ownerUserId).order('full_name')
    setRows((data as Cliente[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, ownerUserId])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !ownerUserId) return
    const payload = {
      user_id: ownerUserId,
      full_name: toUpperTrim(form.full_name),
      cpf: onlyDigits(form.cpf),
      birth_date: form.birth_date || null,
      phone_1: onlyDigits(form.phone_1),
      phone_2: onlyDigits(form.phone_2),
      full_address: toUpperTrim(form.full_address),
      email: toUpperTrim(form.email),
    }
    if (editing) {
      const { error } = await supabase.from('bem_aviv_clients').update(payload).eq('id', editing.id)
      if (error) alert(error.message)
    } else {
      const { error } = await supabase.from('bem_aviv_clients').insert(payload)
      if (error) alert(error.message)
    }
    setEditing(null)
    setForm({ full_name: '', cpf: '', birth_date: '', phone_1: '', phone_2: '', full_address: '', email: '' })
    await load()
  }

  async function remove(id: string) {
    if (!supabase || !confirm('EXCLUIR CLIENTE?')) return
    const { error } = await supabase.from('bem_aviv_clients').delete().eq('id', id)
    if (error) alert(error.message)
    else load()
  }

  if (!supabase) return <p className="text-slate-600">CONECTANDO...</p>

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">CADASTRO DE CLIENTES</h2>

      <form onSubmit={onSubmit} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label>NOME COMPLETO</label>
          <input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        </div>
        <div>
          <label>CPF</label>
          <input required value={formatCpf(form.cpf)} onChange={(e) => setForm({ ...form, cpf: onlyDigits(e.target.value) })} />
        </div>
        <div>
          <label>DATA NASCIMENTO</label>
          <input type="date" value={form.birth_date} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} />
        </div>
        <div>
          <label>TELEFONE 1</label>
          <input value={formatPhone(form.phone_1)} onChange={(e) => setForm({ ...form, phone_1: onlyDigits(e.target.value) })} />
        </div>
        <div>
          <label>TELEFONE 2</label>
          <input value={formatPhone(form.phone_2)} onChange={(e) => setForm({ ...form, phone_2: onlyDigits(e.target.value) })} />
        </div>
        <div className="sm:col-span-2">
          <label>ENDEREÇO COMPLETO</label>
          <input value={form.full_address} onChange={(e) => setForm({ ...form, full_address: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <label>E-MAIL</label>
          <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div className="sm:col-span-2 flex gap-2">
          <button className="btn btn-primary" type="submit">{editing ? 'SALVAR' : 'ADICIONAR'}</button>
          {editing && (
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => {
                setEditing(null)
                setForm({ full_name: '', cpf: '', birth_date: '', phone_1: '', phone_2: '', full_address: '', email: '' })
              }}
            >
              CANCELAR
            </button>
          )}
        </div>
      </form>

      <div className="table-wrap">
        {loading ? (
          <p className="p-4 text-slate-500">CARREGANDO...</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>NOME</th>
                <th>CPF</th>
                <th>TELEFONES</th>
                <th>E-MAIL</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.full_name}</td>
                  <td>{formatCpf(r.cpf)}</td>
                  <td>{[formatPhone(r.phone_1), formatPhone(r.phone_2)].filter(Boolean).join(' / ') || '—'}</td>
                  <td>{r.email || '—'}</td>
                  <td className="whitespace-nowrap">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        className="btn-ghost inline-flex h-9 w-9 items-center justify-center p-0"
                        onClick={() => {
                          setEditing(r)
                          setForm({
                            full_name: r.full_name ?? '',
                            cpf: r.cpf ?? '',
                            birth_date: r.birth_date ?? '',
                            phone_1: r.phone_1 ?? '',
                            phone_2: r.phone_2 ?? '',
                            full_address: r.full_address ?? '',
                            email: r.email ?? '',
                          })
                        }}
                      >
                        <Pencil size={16} />
                      </button>
                      <button type="button" className="btn-ghost inline-flex h-9 w-9 items-center justify-center p-0 text-red-600" onClick={() => remove(r.id)}>
                        <Trash2 size={16} />
                      </button>
                    </div>
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
