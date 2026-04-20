import { useUser } from '@clerk/clerk-react'
import { Copy, Pencil, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '../components/ui/Button'
import { useSupabase } from '../hooks/useSupabase'
import { resolveDataOwnerId } from '../lib/dataOwner'
import { clerkEmailCandidates } from '../lib/clerkEmails'
import { parseMoney } from '../lib/format'
import {
  normalizePayload,
  type OfferPayload,
  type OfferProduct,
  type OfferVariation,
} from '../lib/bemAvivOfferProduct'
import { toUpperTrim } from '../lib/text'

/** Linha do formulário: só dimensões e preço; código é gerado na ordem (01, 02, …). */
function emptyVariationRow(): { dimensions: string; price: string } {
  return { dimensions: '', price: '' }
}

function autoVariationCode(index: number) {
  return String(index + 1).padStart(2, '0')
}

function isMissingOfferProductsTable(message: string) {
  const m = message.toLowerCase()
  return (
    m.includes('bem_aviv_offer_products') &&
    (m.includes('schema cache') || m.includes('does not exist') || m.includes('could not find') || m.includes('relation'))
  )
}

function catalogErrorMessage(message: string) {
  if (isMissingOfferProductsTable(message)) {
    return (
      'A tabela bem_aviv_offer_products ainda não existe neste projeto Supabase (migration não aplicada). ' +
      'No repositório, rode: npx supabase db push — ou aplique o SQL da migration 20260421120000_bem_aviv_offer_products no painel do Supabase (SQL Editor).'
    )
  }
  return message
}

export function BemAvivProdutosCatalogoPage() {
  const { user } = useUser()
  const supabase = useSupabase()
  const ownerUserId = resolveDataOwnerId(user?.id, clerkEmailCandidates(user).join(','))
  const [rows, setRows] = useState<OfferProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<OfferProduct | null>(null)
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [productLine, setProductLine] = useState('')
  const [productType, setProductType] = useState('')
  const [varRows, setVarRows] = useState([emptyVariationRow()])
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!supabase || !ownerUserId) return
    setLoading(true)
    setLoadError(null)
    const { data, error } = await supabase
      .from('bem_aviv_offer_products')
      .select('id, name, category, product_line, product_type, payload')
      .eq('user_id', ownerUserId)
      .order('name')
    if (error) {
      setLoadError(catalogErrorMessage(error.message))
      setRows([])
    } else {
      setRows(((data ?? []) as OfferProduct[]).map((r) => ({ ...r, payload: normalizePayload(r.payload) })))
    }
    setLoading(false)
  }, [ownerUserId, supabase])

  useEffect(() => {
    void load()
  }, [load])

  function openNew() {
    setEditing(null)
    setName('')
    setCategory('')
    setProductLine('')
    setProductType('')
    setVarRows([emptyVariationRow()])
  }

  function openEdit(r: OfferProduct) {
    setEditing(r)
    setName(r.name)
    setCategory(r.category ?? '')
    setProductLine(r.product_line ?? '')
    setProductType(r.product_type ?? '')
    const vars = normalizePayload(r.payload).variations ?? []
    if (vars.length === 0) {
      setVarRows([emptyVariationRow()])
    } else {
      setVarRows(
        vars.map((v) => ({
          dimensions: v.dimensions,
          price: String(v.price).replace('.', ','),
        })),
      )
    }
  }

  function buildPayloadFromForm(): OfferPayload {
    const variations: OfferVariation[] = []
    varRows.forEach((row, i) => {
      const code = autoVariationCode(i)
      const dimensions = row.dimensions.trim()
      const price = parseMoney(row.price || '0')
      if (price <= 0) return
      variations.push({ code, dimensions: dimensions ? toUpperTrim(dimensions) : '', price })
    })
    return { variations }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !ownerUserId) return
    const nm = toUpperTrim(name)
    if (!nm) {
      alert('INFORME O NOME DO PRODUTO.')
      return
    }
    const payload = buildPayloadFromForm()
    if (!payload.variations?.length) {
      alert('INCLUA AO MENOS UMA VARIAÇÃO COM PREÇO VÁLIDO (DIMENSÕES OPCIONAIS). OS CÓDIGOS 01, 02… SÃO GERADOS PELA ORDEM DAS LINHAS.')
      return
    }

    const row = {
      user_id: ownerUserId,
      name: nm,
      category: toUpperTrim(category) || null,
      product_line: toUpperTrim(productLine) || null,
      product_type: toUpperTrim(productType) || null,
      payload,
      updated_at: new Date().toISOString(),
    }

    if (editing) {
      const { error } = await supabase.from('bem_aviv_offer_products').update(row).eq('id', editing.id)
      if (error) alert(catalogErrorMessage(error.message))
    } else {
      const { error } = await supabase.from('bem_aviv_offer_products').insert(row)
      if (error) alert(catalogErrorMessage(error.message))
    }
    openNew()
    await load()
  }

  async function remove(id: string) {
    if (!supabase || !confirm('EXCLUIR ESTE PRODUTO DO CATÁLOGO?')) return
    const { error } = await supabase.from('bem_aviv_offer_products').delete().eq('id', id)
    if (error) alert(catalogErrorMessage(error.message))
    else {
      if (editing?.id === id) openNew()
      await load()
    }
  }

  function duplicateFrom(r: OfferProduct) {
    setEditing(null)
    setName(`${r.name} (CÓPIA)`)
    setCategory(r.category ?? '')
    setProductLine(r.product_line ?? '')
    setProductType(r.product_type ?? '')
    const vars = normalizePayload(r.payload).variations ?? []
    setVarRows(
      vars.length
        ? vars.map((v) => ({ dimensions: v.dimensions, price: String(v.price).replace('.', ',') }))
        : [emptyVariationRow()],
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">CADASTRO — PRODUTOS (CATÁLOGO)</h2>
        <p className="mt-1 max-w-2xl text-sm font-normal normal-case text-slate-600">
          Modelo flexível: variações (dimensões e preço) ficam em <code className="rounded bg-slate-100 px-1 text-xs">payload</code> no Supabase
          (JSONB). Os <strong>códigos são automáticos</strong> na ordem das linhas (<strong>01, 02, 03…</strong>). Ao reordenar ou remover linhas e
          salvar, os códigos são recalculados — orçamentos já feitos continuam com o código gravado na venda. Use em pedidos na tela de vendas.
        </p>
        {loadError ? (
          <div
            role="alert"
            className="mt-3 max-w-3xl rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-normal normal-case text-amber-950"
          >
            {loadError}
          </div>
        ) : null}
      </div>

      <form onSubmit={submit} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-2">
        <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold">{editing ? 'EDITAR PRODUTO' : 'NOVO PRODUTO'}</h3>
          {editing ? (
            <Button type="button" variant="secondary" onClick={openNew}>
              CANCELAR EDIÇÃO
            </Button>
          ) : null}
        </div>
        <div className="sm:col-span-2">
          <label>NOME</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="EX.: LUNAR" />
        </div>
        <div>
          <label>CATEGORIA</label>
          <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="EX.: COLCHÃO" />
        </div>
        <div>
          <label>LINHA</label>
          <input value={productLine} onChange={(e) => setProductLine(e.target.value)} placeholder="EX.: RELEX" />
        </div>
        <div className="sm:col-span-2">
          <label>TIPO / TAMANHO BASE</label>
          <input value={productType} onChange={(e) => setProductType(e.target.value)} placeholder="EX.: SOLTEIRO" />
        </div>

        <div className="sm:col-span-2 rounded-lg border border-slate-100 bg-slate-50/80 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-slate-800">VARIAÇÕES (CÓD. AUTO + DIMENSÕES + PREÇO)</span>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setVarRows((v) => [...v, emptyVariationRow()])}
            >
              + LINHA
            </Button>
          </div>
          <div className="space-y-2">
            {varRows.map((row, idx) => (
              <div key={idx} className="grid gap-2 sm:grid-cols-12 sm:items-end">
                <div className="sm:col-span-2">
                  <label className="text-xs">CÓD. (AUTO)</label>
                  <div className="flex h-[38px] items-center rounded border border-slate-200 bg-slate-100 px-2 font-mono text-sm font-semibold text-slate-700">
                    {autoVariationCode(idx)}
                  </div>
                </div>
                <div className="sm:col-span-5">
                  <label className="text-xs">DIMENSÕES</label>
                  <input
                    value={row.dimensions}
                    onChange={(e) => setVarRows((r) => r.map((x, i) => (i === idx ? { ...x, dimensions: e.target.value } : x)))}
                    placeholder="0,80 x 1,88 x 26"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="text-xs">PREÇO (R$)</label>
                  <input
                    inputMode="decimal"
                    value={row.price}
                    onChange={(e) => setVarRows((r) => r.map((x, i) => (i === idx ? { ...x, price: e.target.value } : x)))}
                    placeholder="2300,00"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-red-600"
                    disabled={varRows.length <= 1}
                    onClick={() => setVarRows((r) => r.filter((_, i) => i !== idx))}
                  >
                    REMOVER
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="sm:col-span-2">
          <Button type="submit" variant="primary">
            {editing ? 'SALVAR ALTERAÇÕES' : 'ADICIONAR PRODUTO'}
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
                <th>NOME</th>
                <th>CATEGORIA</th>
                <th>LINHA</th>
                <th>TIPO</th>
                <th>VARIAÇÕES</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const n = r.payload.variations?.length ?? 0
                return (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td>{r.category || '—'}</td>
                    <td>{r.product_line || '—'}</td>
                    <td>{r.product_type || '—'}</td>
                    <td>{n}</td>
                    <td className="whitespace-nowrap">
                      <Button type="button" variant="ghost" className="inline-flex h-9 w-9 items-center justify-center p-0" onClick={() => openEdit(r)}>
                        <Pencil size={16} />
                      </Button>
                      <Button type="button" variant="ghost" className="inline-flex h-9 w-9 items-center justify-center p-0" onClick={() => duplicateFrom(r)}>
                        <Copy size={16} />
                      </Button>
                      <Button type="button" variant="ghost" className="inline-flex h-9 w-9 items-center justify-center p-0 text-red-600" onClick={() => remove(r.id)}>
                        <Trash2 size={16} />
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
