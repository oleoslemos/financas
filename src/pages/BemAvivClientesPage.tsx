import { useUser } from '@clerk/clerk-react'
import { ChevronDown, ChevronRight, Pencil, Search, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '../components/ui/Button'
import { useSupabase } from '../hooks/useSupabase'
import { resolveDataOwnerId } from '../lib/dataOwner'
import { clerkEmailCandidates } from '../lib/clerkEmails'
import { toUpperTrim } from '../lib/text'

type Cliente = {
  id: string
  full_name: string
  cpf: string
  birth_date: string | null
  phone_1: string | null
  phone_2: string | null
  cep: string | null
  address_street: string | null
  address_number: string | null
  address_complement: string | null
  address_district: string | null
  address_city: string | null
  address_state: string | null
  email: string | null
  client_status: string | null
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

function formatCep(v?: string | null) {
  const d = onlyDigits(v ?? '').slice(0, 8)
  if (d.length <= 5) return d
  return `${d.slice(0, 5)}-${d.slice(5)}`
}

export function BemAvivClientesPage() {
  const { user } = useUser()
  const supabase = useSupabase()
  const ownerUserId = resolveDataOwnerId(user?.id, clerkEmailCandidates(user).join(','))

  const [rows, setRows] = useState<Cliente[]>([])
  const [editing, setEditing] = useState<Cliente | null>(null)
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [cepLoading, setCepLoading] = useState(false)
  const [form, setForm] = useState({
    full_name: '',
    cpf: '',
    birth_date: '',
    phone_1: '',
    phone_2: '',
    cep: '',
    address_street: '',
    address_number: '',
    address_complement: '',
    address_district: '',
    address_city: '',
    address_state: '',
    email: '',
    client_status: 'CLIENTE',
  })

  const load = useCallback(async () => {
    if (!supabase || !ownerUserId) return
    setLoading(true)
    const { data } = await supabase.from('bem_aviv_clients').select('*').eq('user_id', ownerUserId).order('full_name')
    setRows((data as Cliente[]) ?? [])
    setLoading(false)
  }, [ownerUserId, supabase])

  useEffect(() => {
    void load()
  }, [load])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !ownerUserId) return
    const fullAddress = [
      form.address_street,
      form.address_number,
      form.address_complement,
      form.address_district,
      form.address_city,
      form.address_state,
      form.cep ? `CEP ${onlyDigits(form.cep)}` : '',
    ]
      .map((v) => toUpperTrim(v))
      .filter(Boolean)
      .join(' - ')
    const payload = {
      user_id: ownerUserId,
      full_name: toUpperTrim(form.full_name),
      cpf: onlyDigits(form.cpf),
      birth_date: form.birth_date || null,
      phone_1: onlyDigits(form.phone_1),
      phone_2: onlyDigits(form.phone_2),
      cep: onlyDigits(form.cep),
      address_street: toUpperTrim(form.address_street),
      address_number: toUpperTrim(form.address_number),
      address_complement: toUpperTrim(form.address_complement),
      address_district: toUpperTrim(form.address_district),
      address_city: toUpperTrim(form.address_city),
      address_state: toUpperTrim(form.address_state),
      full_address: fullAddress,
      email: toUpperTrim(form.email),
      client_status: toUpperTrim(form.client_status) || 'CLIENTE',
    }
    if (editing) {
      const { error } = await supabase.from('bem_aviv_clients').update(payload).eq('id', editing.id)
      if (error) alert(error.message)
    } else {
      const { error } = await supabase.from('bem_aviv_clients').insert(payload)
      if (error) alert(error.message)
    }
    setEditing(null)
    setFormOpen(false)
    setForm({
      full_name: '',
      cpf: '',
      birth_date: '',
      phone_1: '',
      phone_2: '',
      cep: '',
      address_street: '',
      address_number: '',
      address_complement: '',
      address_district: '',
      address_city: '',
      address_state: '',
      email: '',
      client_status: 'CLIENTE',
    })
    await load()
  }

  async function lookupCep() {
    const cep = onlyDigits(form.cep)
    if (cep.length !== 8) {
      alert('INFORME UM CEP COM 8 DÍGITOS.')
      return
    }
    setCepLoading(true)
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`)
      const data = (await res.json()) as {
        erro?: boolean
        logradouro?: string
        bairro?: string
        localidade?: string
        uf?: string
      }
      if (data.erro) {
        alert('CEP NÃO ENCONTRADO.')
        return
      }
      setForm((prev) => ({
        ...prev,
        address_street: data.logradouro ?? prev.address_street,
        address_district: data.bairro ?? prev.address_district,
        address_city: data.localidade ?? prev.address_city,
        address_state: data.uf ?? prev.address_state,
      }))
    } finally {
      setCepLoading(false)
    }
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
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <button
          type="button"
          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold text-slate-800 sm:px-4"
          onClick={() => setFormOpen((v) => !v)}
        >
          <span>CADASTRAR CLIENTE</span>
          {formOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        {formOpen && (
          <form onSubmit={onSubmit} className="grid gap-3 border-t border-slate-200 p-3 sm:grid-cols-12 sm:p-4 lg:gap-4">
            <div className="sm:col-span-8 lg:col-span-9">
              <label>NOME COMPLETO</label>
              <input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </div>
            <div className="sm:col-span-4 lg:col-span-3">
              <label>DATA NASCIMENTO</label>
              <input type="date" value={form.birth_date} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} />
            </div>

            <div className="sm:col-span-4 lg:col-span-3">
              <label>CPF</label>
              <input required value={formatCpf(form.cpf)} onChange={(e) => setForm({ ...form, cpf: onlyDigits(e.target.value) })} />
            </div>
            <div className="sm:col-span-4 lg:col-span-4">
              <label>TELEFONE 1</label>
              <input value={formatPhone(form.phone_1)} onChange={(e) => setForm({ ...form, phone_1: onlyDigits(e.target.value) })} />
            </div>
            <div className="sm:col-span-4 lg:col-span-5">
              <label>TELEFONE 2</label>
              <input value={formatPhone(form.phone_2)} onChange={(e) => setForm({ ...form, phone_2: onlyDigits(e.target.value) })} />
            </div>

            <div className="sm:col-span-4">
              <label>CEP</label>
              <div className="flex gap-2">
                <input
                  value={formatCep(form.cep)}
                  onChange={(e) => setForm({ ...form, cep: onlyDigits(e.target.value) })}
                  onBlur={() => {
                    if (onlyDigits(form.cep).length === 8) void lookupCep()
                  }}
                />
                <Button type="button" variant="secondary" className="px-3" onClick={() => void lookupCep()} disabled={cepLoading}>
                  <Search size={14} />
                </Button>
              </div>
            </div>
            <div className="sm:col-span-6">
              <label>LOGRADOURO</label>
              <input value={form.address_street} onChange={(e) => setForm({ ...form, address_street: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label>NÚMERO</label>
              <input value={form.address_number} onChange={(e) => setForm({ ...form, address_number: e.target.value })} />
            </div>
            <div className="sm:col-span-3">
              <label>COMPLEMENTO</label>
              <input value={form.address_complement} onChange={(e) => setForm({ ...form, address_complement: e.target.value })} />
            </div>
            <div className="sm:col-span-3">
              <label>BAIRRO</label>
              <input value={form.address_district} onChange={(e) => setForm({ ...form, address_district: e.target.value })} />
            </div>
            <div className="sm:col-span-3">
              <label>CIDADE</label>
              <input value={form.address_city} onChange={(e) => setForm({ ...form, address_city: e.target.value })} />
            </div>
            <div className="sm:col-span-3">
              <label>ESTADO</label>
              <input value={form.address_state} onChange={(e) => setForm({ ...form, address_state: e.target.value })} />
            </div>
            <div className="sm:col-span-8">
              <label>E-MAIL</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="sm:col-span-4">
              <label>STATUS</label>
              <select value={form.client_status} onChange={(e) => setForm({ ...form, client_status: e.target.value })}>
                <option value="CLIENTE">CLIENTE</option>
                <option value="PROSPECÇÃO">PROSPECÇÃO</option>
              </select>
            </div>
            <div className="sm:col-span-12 flex gap-2">
              <Button variant="primary" type="submit">{editing ? 'SALVAR' : 'ADICIONAR'}</Button>
              {editing && (
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => {
                    setEditing(null)
                    setForm({
                      full_name: '',
                      cpf: '',
                      birth_date: '',
                      phone_1: '',
                      phone_2: '',
                      cep: '',
                      address_street: '',
                      address_number: '',
                      address_complement: '',
                      address_district: '',
                      address_city: '',
                      address_state: '',
                      email: '',
                      client_status: 'CLIENTE',
                    })
                  }}
                >
                  CANCELAR
                </Button>
              )}
            </div>
          </form>
        )}
      </div>

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
                <th>STATUS</th>
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
                  <td>{r.client_status || 'CLIENTE'}</td>
                  <td className="whitespace-nowrap">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        className="inline-flex h-9 w-9 items-center justify-center p-0"
                        onClick={() => {
                          setEditing(r)
                          setForm({
                            full_name: r.full_name ?? '',
                            cpf: r.cpf ?? '',
                            birth_date: r.birth_date ?? '',
                            phone_1: r.phone_1 ?? '',
                            phone_2: r.phone_2 ?? '',
                            cep: r.cep ?? '',
                            address_street: r.address_street ?? '',
                            address_number: r.address_number ?? '',
                            address_complement: r.address_complement ?? '',
                            address_district: r.address_district ?? '',
                            address_city: r.address_city ?? '',
                            address_state: r.address_state ?? '',
                            email: r.email ?? '',
                            client_status: r.client_status ?? 'CLIENTE',
                          })
                          setFormOpen(true)
                        }}
                      >
                        <Pencil size={16} />
                      </Button>
                      <Button type="button" variant="ghost" className="inline-flex h-9 w-9 items-center justify-center p-0 text-red-600" onClick={() => remove(r.id)}>
                        <Trash2 size={16} />
                      </Button>
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
