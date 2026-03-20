import { Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/AppLayout'
import { RequireAuth } from './components/RequireAuth'
import { BankAccounts } from './pages/BankAccounts'
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
        <Route element={<AppLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/contas-bancarias" element={<BankAccounts />} />
          <Route path="/categorias" element={<Categories />} />
          <Route path="/fluxo" element={<CashflowPage />} />
          <Route path="/cartoes" element={<CreditCardsPage />} />
          <Route path="/cartoes/:cardId" element={<CardInvoicesPage />} />
          <Route path="/cartoes/:cardId/faturas/:invoiceId" element={<InvoiceDetailPage />} />
        </Route>
      </Route>
    </Routes>
  )
}
