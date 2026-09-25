import { ClipboardList } from 'lucide-react'
import { ComingSoonPage } from '../components/ComingSoonPage'

export function V2PedidoVendasPage() {
  return (
    <ComingSoonPage
      title="Pedido de Vendas"
      description="Crie e acompanhe pedidos de vendas para seus clientes. Vincule produtos, tabela de preço, formas de pagamento e status de entrega."
      icon={<ClipboardList size={32} color="#10B981" />}
    />
  )
}
