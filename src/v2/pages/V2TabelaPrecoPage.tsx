import { Tag } from 'lucide-react'
import { ComingSoonPage } from '../components/ComingSoonPage'

export function V2TabelaPrecoPage() {
  return (
    <ComingSoonPage
      title="Tabela de Preço"
      description="Defina tabelas de preço por produto, canal de venda ou cliente. Aplique descontos, margens e vigências de forma fácil."
      icon={<Tag size={32} color="#8B5CF6" />}
    />
  )
}
