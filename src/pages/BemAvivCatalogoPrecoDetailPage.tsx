import { useUser } from '@clerk/clerk-react'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { useSupabase } from '../hooks/useSupabase'
import { resolveDataOwnerId } from '../lib/dataOwner'
import { clerkEmailCandidates } from '../lib/clerkEmails'
import { toUpperTrim } from '../lib/text'

type Catalog = {
  id: string
  name: string
  description: string | null
}

type Block = {
  id: string
  name: string
  product_type: string
  product_id: string | null
  active: boolean
}

type ProdutoOpt = { id: string; name: string }

export function BemAvivCatalogoPrecoDetailPage() {
  const { catalogId } = useParams<{ catalogId: string }>()
  const { user } = useUser()
  const supabase = useSupabase()
  const ownerUserId = resolveDataOwnerId(user?.id, clerkEmailCandidates(user).join(','))
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [blocks, setBlocks] = useState<Block[]>([])
  const [products, setProducts] = useState<ProdutoOpt[]>([])
  const [loading, setLoading] = useState(true)
  const [blockName, setBlockName] = useState('')
  const [linkProductId, setLinkProductId] = useState('')

  const load = useCallback(async () => {
    if (!supabase || !ownerUserId || !catalogId) return
    setLoading(true)
    const [{ data: cat }, { data: bl }, { data: pr }] = await Promise.all([
      supabase.from('bem_aviv_price_catalogs').select('id, name, description').eq('id', catalogId).eq('user_id', ownerUserId).maybeSingle(),
      supabase
        .from('bem_aviv_catalog_products')
        .select('id, name, product_type, product_id, active')
        .eq('price_catalog_id', catalogId)
        .eq('user_id', ownerUserId)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true }),
      supabase.from('bem_aviv_products').select('id, name').eq('user_id', ownerUserId).order('name'),
    ])
    setCatalog((cat as Catalog) ?? null)
    setBlocks((bl as Block[]) ?? [])
    setProducts((pr as ProdutoOpt[]) ?? [])
    setLoading(false)
  }, [catalogId, ownerUserId, supabase])

  useEffect(() => {
    void load()
  }, [load])

  async function addBlock(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !ownerUserId || !catalogId) return
    const nm = toUpperTrim(blockName)
    if (!nm) {
      alert('INFORME O NOME DO BLOCO (EX.: BANHO, EDREDOM).')
      return
    }
    const { error } = await supabase.from('bem_aviv_catalog_products').insert({
      user_id: ownerUserId,
      price_catalog_id: catalogId,
      name: nm,
      product_type: 'MATRIX_2D',
      product_id: linkProductId || null,
      sort_order: blocks.length,
      active: true,
    })
    if (error) alert(error.message)
    else {
      setBlockName('')
      setLinkProductId('')
      await load()
    }
  }

  async function removeBlock(id: string) {
    if (!supabase || !confirm('EXCLUIR ESTE BLOCO E TODA A MATRIZ?')) return
    const { error } = await supabase.from('bem_aviv_catalog_products').delete().eq('id', id)
    if (error) alert(error.message)
    else await load()
  }

  if (!catalogId) {
    return <p className="text-slate-500">CATÁLOGO INVÁLIDO.</p>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/bem-aviv/catalogos-preco" className="inline-flex items-center gap-1 text-sm font-medium text-emerald-800 underline-offset-2 hover:underline">
          <ArrowLeft size={16} aria-hidden />
          CATÁLOGOS
        </Link>
      </div>

      {loading ? (
        <p className="text-slate-500">CARREGANDO...</p>
      ) : !catalog ? (
        <p className="text-slate-500">CATÁLOGO NÃO ENCONTRADO.</p>
      ) : (
        <>
          <header>
            <h2 className="text-2xl font-semibold">{catalog.name}</h2>
            {catalog.description ? <p className="mt-1 text-sm font-normal normal-case text-slate-600">{catalog.description}</p> : null}
          </header>

          <form onSubmit={addBlock} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label>NOVO BLOCO (PRODUTO NA MATRIZ)</label>
              <input value={blockName} onChange={(e) => setBlockName(e.target.value)} placeholder="EX.: JOGO DE TOALHAS, EDREDOM MALHA" required />
            </div>
            <div className="sm:col-span-2">
              <label>VÍNCULO COM PRODUTO CADASTRADO (OPCIONAL)</label>
              <select value={linkProductId} onChange={(e) => setLinkProductId(e.target.value)}>
                <option value="">— NENHUM —</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" variant="primary">
                ADICIONAR BLOCO
              </Button>
            </div>
          </form>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>BLOCO</th>
                  <th>TIPO</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {blocks.map((b) => (
                  <tr key={b.id}>
                    <td>{b.name}</td>
                    <td>{b.product_type}</td>
                    <td className="whitespace-nowrap">
                      <Link to={`/bem-aviv/catalogos-preco/${catalogId}/bloco/${b.id}`}>
                        <Button type="button" variant="secondary" className="mr-2">
                          MATRIZ DE PREÇOS
                        </Button>
                      </Link>
                      <button
                        type="button"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-red-300 bg-white text-red-700 shadow-sm hover:bg-red-50"
                        onClick={() => removeBlock(b.id)}
                        title="EXCLUIR BLOCO"
                        aria-label="Excluir bloco"
                      >
                        <Trash2 size={15} strokeWidth={2.2} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {blocks.length === 0 && <p className="p-4 text-sm text-slate-500">NENHUM BLOCO. ADICIONE UM PARA CONFIGURAR LINHAS, COLUNAS E PREÇOS.</p>}
          </div>
        </>
      )}
    </div>
  )
}
