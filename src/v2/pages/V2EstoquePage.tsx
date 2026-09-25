import { Warehouse } from 'lucide-react'
import { ComingSoonPage } from '../components/ComingSoonPage'

export function V2EstoquePage() {
  return (
    <ComingSoonPage
      title="Estoque"
      description="Controle entradas, saídas e saldo de estoque por produto e depósito. Alertas de estoque mínimo e relatórios de movimentação."
      icon={<Warehouse size={32} color="#EF4444" />}
    />
  )
}
