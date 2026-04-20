import { useUser } from '@clerk/clerk-react'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { useSupabase } from '../hooks/useSupabase'
import { resolveDataOwnerId } from '../lib/dataOwner'
import { clerkEmailCandidates } from '../lib/clerkEmails'
import { formatBRL, parseMoney } from '../lib/format'
import { toUpperTrim } from '../lib/text'

type Axis = { id: string; axis_key: string; axis_label: string; sort_order: number }
type AxisValue = { id: string; axis_id: string; value_label: string; sort_order: number }
type PriceCell = { id: string; row_value_id: string | null; col_value_id: string | null; price: number }
type Block = { id: string; name: string; price_catalog_id: string }
type Addon = { id: string; name: string; price: number; sort_order: number }

function cellKey(rowId: string, colId: string) {
  return `${rowId}|${colId}`
}

export function BemAvivCatalogoMatrizBlocoPage() {
  const { catalogId, blockId } = useParams<{ catalogId: string; blockId: string }>()
  const { user } = useUser()
  const supabase = useSupabase()
  const ownerUserId = resolveDataOwnerId(user?.id, clerkEmailCandidates(user).join(','))

  const [block, setBlock] = useState<Block | null>(null)
  const [axes, setAxes] = useState<Axis[]>([])
  const [axisValues, setAxisValues] = useState<AxisValue[]>([])
  const [cells, setCells] = useState<PriceCell[]>([])
  const [addons, setAddons] = useState<Addon[]>([])
  const [loading, setLoading] = useState(true)

  const [newRowLabel, setNewRowLabel] = useState('')
  const [newColLabel, setNewColLabel] = useState('')
  const [addonName, setAddonName] = useState('')
  const [addonPrice, setAddonPrice] = useState('')

  const [cellDrafts, setCellDrafts] = useState<Record<string, string>>({})

  const rowAxis = useMemo(() => axes.find((a) => a.axis_key === 'ROW') ?? null, [axes])
  const colAxis = useMemo(() => axes.find((a) => a.axis_key === 'COL') ?? null, [axes])

  const rowValues = useMemo(
    () => axisValues.filter((v) => rowAxis && v.axis_id === rowAxis.id).sort((a, b) => a.sort_order - b.sort_order || a.value_label.localeCompare(b.value_label)),
    [axisValues, rowAxis],
  )
  const colValues = useMemo(
    () => axisValues.filter((v) => colAxis && v.axis_id === colAxis.id).sort((a, b) => a.sort_order - b.sort_order || a.value_label.localeCompare(b.value_label)),
    [axisValues, colAxis],
  )

  const cellPriceByKey = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of cells) {
      if (c.row_value_id && c.col_value_id) m.set(cellKey(c.row_value_id, c.col_value_id), Number(c.price))
    }
    return m
  }, [cells])

  const load = useCallback(async () => {
    if (!supabase || !ownerUserId || !catalogId || !blockId) return
    setLoading(true)

    const { data: bl, error: eBl } = await supabase
      .from('bem_aviv_catalog_products')
      .select('id, name, price_catalog_id')
      .eq('id', blockId)
      .eq('user_id', ownerUserId)
      .maybeSingle()

    if (eBl || !bl || (bl as Block).price_catalog_id !== catalogId) {
      setBlock(null)
      setLoading(false)
      return
    }
    setBlock(bl as Block)

    const { data: ax } = await supabase.from('bem_aviv_catalog_axes').select('id, axis_key, axis_label, sort_order').eq('catalog_product_id', blockId).order('sort_order')

    const axisList = (ax as Axis[]) ?? []
    setAxes(axisList)

    const axisIds = axisList.map((a) => a.id)
    let vals: AxisValue[] = []
    if (axisIds.length > 0) {
      const { data: av } = await supabase.from('bem_aviv_catalog_axis_values').select('id, axis_id, value_label, sort_order').in('axis_id', axisIds).order('sort_order')
      vals = (av as AxisValue[]) ?? []
    }
    setAxisValues(vals)

    const { data: pc } = await supabase
      .from('bem_aviv_catalog_price_cells')
      .select('id, row_value_id, col_value_id, price')
      .eq('catalog_product_id', blockId)

    setCells((pc as PriceCell[]) ?? [])

    const { data: ad } = await supabase.from('bem_aviv_catalog_addons').select('id, name, price, sort_order').eq('catalog_product_id', blockId).order('sort_order')
    setAddons((ad as Addon[]) ?? [])

    const drafts: Record<string, string> = {}
    const rowA = axisList.find((a) => a.axis_key === 'ROW')
    const colA = axisList.find((a) => a.axis_key === 'COL')
    if (rowA && colA) {
      const rs = vals.filter((v) => v.axis_id === rowA.id)
      const cs = vals.filter((v) => v.axis_id === colA.id)
      const cellRows = (pc as PriceCell[]) ?? []
      const map = new Map<string, number>()
      for (const c of cellRows) {
        if (c.row_value_id && c.col_value_id) map.set(cellKey(c.row_value_id, c.col_value_id), Number(c.price))
      }
      for (const r of rs) {
        for (const c of cs) {
          const k = cellKey(r.id, c.id)
          const p = map.get(k)
          drafts[k] = p != null && p > 0 ? String(p).replace('.', ',') : ''
        }
      }
    }
    setCellDrafts(drafts)

    setLoading(false)
  }, [blockId, catalogId, ownerUserId, supabase])

  useEffect(() => {
    void load()
  }, [load])

  async function createAxes2D() {
    if (!supabase || !ownerUserId || !blockId) return
    const { error } = await supabase.from('bem_aviv_catalog_axes').insert([
      { user_id: ownerUserId, catalog_product_id: blockId, axis_key: 'ROW', axis_label: 'LINHA (EX.: TAMANHO)', sort_order: 0 },
      { user_id: ownerUserId, catalog_product_id: blockId, axis_key: 'COL', axis_label: 'COLUNA (EX.: MODELO / GRAMATURA)', sort_order: 1 },
    ])
    if (error) alert(error.message)
    else await load()
  }

  async function addRowValue(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !ownerUserId || !rowAxis) return
    const label = toUpperTrim(newRowLabel)
    if (!label) {
      alert('INFORME O RÓTULO DA LINHA.')
      return
    }
    const maxSort = rowValues.reduce((m, v) => Math.max(m, v.sort_order), -1)
    const { error } = await supabase.from('bem_aviv_catalog_axis_values').insert({
      user_id: ownerUserId,
      axis_id: rowAxis.id,
      value_label: label,
      sort_order: maxSort + 1,
      active: true,
    })
    if (error) alert(error.message)
    else {
      setNewRowLabel('')
      await load()
    }
  }

  async function addColValue(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !ownerUserId || !colAxis) return
    const label = toUpperTrim(newColLabel)
    if (!label) {
      alert('INFORME O RÓTULO DA COLUNA.')
      return
    }
    const maxSort = colValues.reduce((m, v) => Math.max(m, v.sort_order), -1)
    const { error } = await supabase.from('bem_aviv_catalog_axis_values').insert({
      user_id: ownerUserId,
      axis_id: colAxis.id,
      value_label: label,
      sort_order: maxSort + 1,
      active: true,
    })
    if (error) alert(error.message)
    else {
      setNewColLabel('')
      await load()
    }
  }

  async function removeAxisValue(id: string) {
    if (!supabase || !confirm('EXCLUIR ESTE VALOR? PREÇOS QUE O USEM SERÃO REMOVIDOS.')) return
    const { error } = await supabase.from('bem_aviv_catalog_axis_values').delete().eq('id', id)
    if (error) alert(error.message)
    else await load()
  }

  async function persistCell(rowId: string, colId: string, raw: string) {
    if (!supabase || !ownerUserId || !blockId) return
    const price = parseMoney(raw.trim() === '' ? '0' : raw)

    if (price <= 0) {
      const { error } = await supabase
        .from('bem_aviv_catalog_price_cells')
        .delete()
        .eq('catalog_product_id', blockId)
        .eq('row_value_id', rowId)
        .eq('col_value_id', colId)
      if (error) alert(error.message)
      else await load()
      return
    }

    const { error } = await supabase.from('bem_aviv_catalog_price_cells').upsert(
      {
        user_id: ownerUserId,
        catalog_product_id: blockId,
        row_value_id: rowId,
        col_value_id: colId,
        price,
        active: true,
      },
      { onConflict: 'catalog_product_id,row_value_id,col_value_id' },
    )
    if (error) alert(error.message)
    else await load()
  }

  function setDraft(rowId: string, colId: string, v: string) {
    setCellDrafts((d) => ({ ...d, [cellKey(rowId, colId)]: v }))
  }

  async function addAddon(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !ownerUserId || !blockId) return
    const nm = toUpperTrim(addonName)
    const pr = parseMoney(addonPrice)
    if (!nm) {
      alert('INFORME O NOME DO OPCIONAL.')
      return
    }
    if (pr <= 0) {
      alert('INFORME O PREÇO DO OPCIONAL.')
      return
    }
    const maxSort = addons.reduce((m, a) => Math.max(m, a.sort_order), -1)
    const { error } = await supabase.from('bem_aviv_catalog_addons').insert({
      user_id: ownerUserId,
      catalog_product_id: blockId,
      name: nm,
      price: pr,
      sort_order: maxSort + 1,
      active: true,
      is_per_item: true,
    })
    if (error) alert(error.message)
    else {
      setAddonName('')
      setAddonPrice('')
      await load()
    }
  }

  async function removeAddon(id: string) {
    if (!supabase || !confirm('EXCLUIR ESTE OPCIONAL?')) return
    const { error } = await supabase.from('bem_aviv_catalog_addons').delete().eq('id', id)
    if (error) alert(error.message)
    else await load()
  }

  if (!catalogId || !blockId) {
    return <p className="text-slate-500">ROTA INVÁLIDA.</p>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          to={`/bem-aviv/catalogos-preco/${catalogId}`}
          className="inline-flex items-center gap-1 text-sm font-medium text-emerald-800 underline-offset-2 hover:underline"
        >
          <ArrowLeft size={16} aria-hidden />
          VOLTAR AO CATÁLOGO
        </Link>
      </div>

      {loading ? (
        <p className="text-slate-500">CARREGANDO...</p>
      ) : !block ? (
        <p className="text-slate-500">BLOCO NÃO ENCONTRADO.</p>
      ) : (
        <>
          <header>
            <h2 className="text-2xl font-semibold">MATRIZ — {block.name}</h2>
            <p className="mt-1 max-w-3xl text-sm font-normal normal-case text-slate-600">
              Defina os rótulos das <strong>linhas</strong> e <strong>colunas</strong>, depois preencha o preço em cada célula. Valores vazios ou zero removem a célula.
            </p>
          </header>

          {axes.length === 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4">
              <p className="mb-2 text-sm font-normal normal-case text-amber-950">Este bloco ainda não tem eixos de matriz.</p>
              <Button type="button" variant="primary" onClick={() => void createAxes2D()}>
                CRIAR MATRIZ 2D (LINHA + COLUNA)
              </Button>
            </div>
          )}

          {rowAxis && colAxis && (
            <>
              <div className="grid gap-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm lg:grid-cols-2">
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-slate-800">{rowAxis.axis_label}</h3>
                  <form onSubmit={addRowValue} className="flex flex-wrap gap-2">
                    <input className="min-w-[12rem] flex-1" value={newRowLabel} onChange={(e) => setNewRowLabel(e.target.value)} placeholder="EX.: SOLTEIRO 0,88M" />
                    <Button type="submit" variant="secondary">
                      ADICIONAR LINHA
                    </Button>
                  </form>
                  <ul className="mt-2 space-y-1 text-sm">
                    {rowValues.map((v) => (
                      <li key={v.id} className="flex items-center justify-between gap-2 rounded border border-slate-100 bg-slate-50/80 px-2 py-1">
                        <span>{v.value_label}</span>
                        <Button type="button" variant="ghost" className="h-8 w-8 p-0 text-red-600" onClick={() => removeAxisValue(v.id)}>
                          <Trash2 size={14} />
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-slate-800">{colAxis.axis_label}</h3>
                  <form onSubmit={addColValue} className="flex flex-wrap gap-2">
                    <input className="min-w-[12rem] flex-1" value={newColLabel} onChange={(e) => setNewColLabel(e.target.value)} placeholder="EX.: 500 G/M², MALHA" />
                    <Button type="submit" variant="secondary">
                      ADICIONAR COLUNA
                    </Button>
                  </form>
                  <ul className="mt-2 space-y-1 text-sm">
                    {colValues.map((v) => (
                      <li key={v.id} className="flex items-center justify-between gap-2 rounded border border-slate-100 bg-slate-50/80 px-2 py-1">
                        <span>{v.value_label}</span>
                        <Button type="button" variant="ghost" className="h-8 w-8 p-0 text-red-600" onClick={() => removeAxisValue(v.id)}>
                          <Trash2 size={14} />
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {rowValues.length > 0 && colValues.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                  <h3 className="mb-2 text-sm font-semibold text-slate-800">PREÇOS (R$)</h3>
                  <table className="min-w-max text-sm">
                    <thead>
                      <tr>
                        <th className="sticky left-0 z-10 min-w-[8rem] bg-white px-2 py-1 text-left shadow-[1px_0_0_0_rgb(226_232_240)]">
                          LINHA \ COLUNA
                        </th>
                        {colValues.map((cv) => (
                          <th key={cv.id} className="min-w-[6rem] px-1 py-1 text-center font-medium normal-case">
                            {cv.value_label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rowValues.map((r) => (
                        <tr key={r.id}>
                          <td className="sticky left-0 z-10 bg-white px-2 py-1 font-medium shadow-[1px_0_0_0_rgb(226_232_240)]">{r.value_label}</td>
                          {colValues.map((cv) => {
                            const k = cellKey(r.id, cv.id)
                            const stored = cellPriceByKey.get(k)
                            const draft = cellDrafts[k] ?? (stored != null && stored > 0 ? String(stored).replace('.', ',') : '')
                            return (
                              <td key={cv.id} className="p-1">
                                <input
                                  className="w-full min-w-[5rem] text-right text-sm"
                                  inputMode="decimal"
                                  placeholder="—"
                                  value={draft}
                                  onChange={(e) => setDraft(r.id, cv.id, e.target.value)}
                                  onBlur={(e) => void persistCell(r.id, cv.id, e.currentTarget.value)}
                                />
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-2 text-xs font-normal normal-case text-slate-500">Ao sair do campo (blur), o valor é gravado. Use formato brasileiro (ex.: 1.234,56).</p>
                </div>
              )}
            </>
          )}

          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <h3 className="mb-2 text-sm font-semibold text-slate-800">OPCIONAIS / ADICIONAIS</h3>
            <form onSubmit={addAddon} className="mb-3 flex flex-wrap gap-2">
              <input className="min-w-[10rem] flex-1" value={addonName} onChange={(e) => setAddonName(e.target.value)} placeholder="NOME (EX.: ELETRÔNICOS)" />
              <input className="w-32" value={addonPrice} onChange={(e) => setAddonPrice(e.target.value)} placeholder="PREÇO" />
              <Button type="submit" variant="secondary">
                ADICIONAR
              </Button>
            </form>
            <ul className="space-y-1 text-sm">
              {addons.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 rounded border border-slate-100 px-2 py-1">
                  <span>
                    {a.name} — {formatBRL(Number(a.price))}
                  </span>
                  <Button type="button" variant="ghost" className="h-8 w-8 p-0 text-red-600" onClick={() => removeAddon(a.id)}>
                    <Trash2 size={14} />
                  </Button>
                </li>
              ))}
            </ul>
            {addons.length === 0 && <p className="text-xs text-slate-500">NENHUM OPCIONAL CADASTRADO.</p>}
          </div>
        </>
      )}
    </div>
  )
}
