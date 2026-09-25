import { ShoppingCart } from 'lucide-react'
import { ComingSoonPage } from '../components/ComingSoonPage'

export function V2PedidoCompraPage() {
  return (
    <ComingSoonPage
      title="Pedido de Compra"
      description="Gerencie seus pedidos de compra junto aos fornecedores, acompanhe o status, prazos de entrega e histórico."
      icon={<ShoppingCart size={32} color="#F59E0B" />}
    />
  )
}
