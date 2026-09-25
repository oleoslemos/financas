import { Package } from 'lucide-react'
import { ComingSoonPage } from '../components/ComingSoonPage'

export function V2ProdutosPage() {
  return (
    <ComingSoonPage
      title="Produtos"
      description="Cadastre e gerencie o catálogo de produtos, incluindo descrição, unidade de medida, código de barras e categorias."
      icon={<Package size={32} color="#3B82F6" />}
    />
  )
}
