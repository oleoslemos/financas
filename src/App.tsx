import { Navigate, Route, Routes } from 'react-router-dom'
import { AllowedEmailGuard } from './components/AllowedEmailGuard'
import { AppLayout } from './components/AppLayout'
import { RequireAuth } from './components/RequireAuth'
import { BankAccounts } from './pages/BankAccounts'
import { BemAvivCategoriasPage } from './pages/BemAvivCategoriasPage'
import { BemAvivClientesPage } from './pages/BemAvivClientesPage'
import { BemAvivPedidosPage } from './pages/BemAvivPedidosPage'
import { BemAvivProdutosPage } from './pages/BemAvivProdutosPage'
import { BemAvivTabelaPrecoPage } from './pages/BemAvivTabelaPrecoPage'
import { CardInvoicesPage } from './pages/CardInvoicesPage'
import { CashflowPage } from './pages/CashflowPage'
import { Categories } from './pages/Categories'
import { CreditCardsPage } from './pages/CreditCardsPage'
import { Dashboard } from './pages/Dashboard'
import { InvoiceDetailPage } from './pages/InvoiceDetailPage'
import { SignInPage } from './pages/SignInPage'
import { SignUpPage } from './pages/SignUpPage'

export default function App() {
  return (
    <Routes>
      <Route path="/sign-in/*" element={<SignInPage />} />
      <Route path="/sign-up/*" element={<SignUpPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AllowedEmailGuard />}>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Navigate to="/lsh/resumo" replace />} />
            <Route path="/lsh/resumo" element={<Dashboard />} />
            <Route path="/lsh/contas-bancarias" element={<BankAccounts />} />
            <Route path="/lsh/categorias" element={<Categories />} />
            <Route path="/lsh/fluxo" element={<CashflowPage />} />
            <Route path="/lsh/cartoes" element={<CreditCardsPage />} />
            <Route path="/lsh/cartoes/:cardId" element={<CardInvoicesPage />} />
            <Route path="/lsh/cartoes/:cardId/faturas/:invoiceId" element={<InvoiceDetailPage />} />

            <Route path="/contas-bancarias" element={<Navigate to="/lsh/contas-bancarias" replace />} />
            <Route path="/categorias" element={<Navigate to="/lsh/categorias" replace />} />
            <Route path="/fluxo" element={<Navigate to="/lsh/fluxo" replace />} />
            <Route path="/cartoes" element={<Navigate to="/lsh/cartoes" replace />} />
            <Route path="/cartoes/:cardId" element={<CardInvoicesPage />} />
            <Route path="/cartoes/:cardId/faturas/:invoiceId" element={<InvoiceDetailPage />} />
            <Route path="/bem-aviv/clientes" element={<BemAvivClientesPage />} />
            <Route path="/bem-aviv/produtos" element={<BemAvivProdutosPage />} />
            <Route path="/bem-aviv/produtos/plataforma-de-descanso" element={<BemAvivProdutosPage />} />
            <Route path="/bem-aviv/produtos/cabeceiras" element={<BemAvivProdutosPage />} />
            <Route path="/bem-aviv/produtos/bases-camas" element={<BemAvivProdutosPage />} />
            <Route path="/bem-aviv/produtos/acessorios" element={<BemAvivProdutosPage />} />
            <Route path="/bem-aviv/pedidos" element={<BemAvivPedidosPage />} />
            <Route path="/bem-aviv/categorias" element={<BemAvivCategoriasPage />} />
            <Route path="/bem-aviv/tabela-preco" element={<BemAvivTabelaPrecoPage />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  )
}
