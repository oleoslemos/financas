import { lazy, Suspense } from 'react'
import { useUser } from '@clerk/clerk-react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AllowedEmailGuard } from './components/AllowedEmailGuard'
import { AppLayout } from './components/AppLayout'
import { RequireAuth } from './components/RequireAuth'
import { RequireFullHubAccess } from './components/RequireFullHubAccess'
import { RequireProjectsAccess } from './components/RequireProjectsAccess'
import { RequireTasksHomologAccess } from './components/RequireTasksHomologAccess'
import { clerkEmailCandidates } from './lib/clerkEmails'
import {
  getStoredHubChoice,
  isBemAvivOnlyUser,
  isMultiSystemUser,
} from './lib/userAccess'

const SignInPage = lazy(() => import('./pages/SignInPage').then((m) => ({ default: m.SignInPage })))
const SignUpPage = lazy(() => import('./pages/SignUpPage').then((m) => ({ default: m.SignUpPage })))
const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })))
const BankAccounts = lazy(() => import('./pages/BankAccounts').then((m) => ({ default: m.BankAccounts })))
const Categories = lazy(() => import('./pages/Categories').then((m) => ({ default: m.Categories })))
const CashflowPage = lazy(() => import('./pages/CashflowPage').then((m) => ({ default: m.CashflowPage })))
const CreditCardsPage = lazy(() => import('./pages/CreditCardsPage').then((m) => ({ default: m.CreditCardsPage })))
const CardInvoicesPage = lazy(() => import('./pages/CardInvoicesPage').then((m) => ({ default: m.CardInvoicesPage })))
const InvoiceDetailPage = lazy(() => import('./pages/InvoiceDetailPage').then((m) => ({ default: m.InvoiceDetailPage })))
const BemAvivClientesPage = lazy(() => import('./pages/BemAvivClientesPage').then((m) => ({ default: m.BemAvivClientesPage })))
const BemAvivFollowupPage = lazy(() => import('./pages/BemAvivFollowupPage').then((m) => ({ default: m.BemAvivFollowupPage })))
const BemAvivFollowupProdutividadePage = lazy(() =>
  import('./pages/BemAvivFollowupProdutividadePage').then((m) => ({ default: m.BemAvivFollowupProdutividadePage })),
)
const BemAvivProdutosPage = lazy(() => import('./pages/BemAvivProdutosPage').then((m) => ({ default: m.BemAvivProdutosPage })))
const BemAvivProdutosCatalogoPage = lazy(() =>
  import('./pages/BemAvivProdutosCatalogoPage').then((m) => ({ default: m.BemAvivProdutosCatalogoPage })),
)
const BemAvivPedidosPage = lazy(() => import('./pages/BemAvivPedidosPage').then((m) => ({ default: m.BemAvivPedidosPage })))
const BemAvivCategoriasPage = lazy(() => import('./pages/BemAvivCategoriasPage').then((m) => ({ default: m.BemAvivCategoriasPage })))
const BemAvivTabelaPrecoPage = lazy(() => import('./pages/BemAvivTabelaPrecoPage').then((m) => ({ default: m.BemAvivTabelaPrecoPage })))
const BemAvivTabelaPrecoCatalogoPage = lazy(() =>
  import('./pages/BemAvivTabelaPrecoCatalogoPage').then((m) => ({ default: m.BemAvivTabelaPrecoCatalogoPage })),
)
const BemAvivCatalogosPrecoPage = lazy(() => import('./pages/BemAvivCatalogosPrecoPage').then((m) => ({ default: m.BemAvivCatalogosPrecoPage })))
const BemAvivCatalogoPrecoDetailPage = lazy(() => import('./pages/BemAvivCatalogoPrecoDetailPage').then((m) => ({ default: m.BemAvivCatalogoPrecoDetailPage })))
const BemAvivCatalogoMatrizBlocoPage = lazy(() => import('./pages/BemAvivCatalogoMatrizBlocoPage').then((m) => ({ default: m.BemAvivCatalogoMatrizBlocoPage })))
const BemAvivHomePage = lazy(() => import('./pages/BemAvivHomePage').then((m) => ({ default: m.BemAvivHomePage })))
const AgendaPage = lazy(() => import('./pages/AgendaPage').then((m) => ({ default: m.AgendaPage })))
const TasksPage = lazy(() => import('./pages/TasksPage').then((m) => ({ default: m.TasksPage })))
const LshStartPage = lazy(() => import('./pages/LshStartPage').then((m) => ({ default: m.LshStartPage })))
const SystemChooserPage = lazy(() =>
  import('./pages/SystemChooserPage').then((m) => ({ default: m.SystemChooserPage })),
)
const ProjectsHubPage = lazy(() => import('./pages/ProjectsHubPage').then((m) => ({ default: m.ProjectsHubPage })))
const ProjectNotesPage = lazy(() => import('./pages/ProjectNotesPage').then((m) => ({ default: m.ProjectNotesPage })))
const ProjectKanbanPage = lazy(() => import('./pages/ProjectKanbanPage').then((m) => ({ default: m.ProjectKanbanPage })))
const ProjectBacklogPage = lazy(() => import('./pages/ProjectBacklogPage').then((m) => ({ default: m.ProjectBacklogPage })))
const ProjectSprintsPage = lazy(() => import('./pages/ProjectSprintsPage').then((m) => ({ default: m.ProjectSprintsPage })))
const ProjectActivitiesPage = lazy(() => import('./pages/ProjectActivitiesPage').then((m) => ({ default: m.ProjectActivitiesPage })))
const ProjectClientsPage = lazy(() => import('./pages/ProjectClientsPage').then((m) => ({ default: m.ProjectClientsPage })))
const ProjectAssigneesPage = lazy(() => import('./pages/ProjectAssigneesPage').then((m) => ({ default: m.ProjectAssigneesPage })))

function HomeRedirect() {
  const { user } = useUser()
  const emails = clerkEmailCandidates(user)
  if (isBemAvivOnlyUser(emails)) {
    return <Navigate to="/bem-aviv" replace />
  }
  if (isMultiSystemUser(emails)) {
    const choice = getStoredHubChoice()
    if (choice === 'lsh') return <Navigate to="/lsh/inicio" replace />
    if (choice === 'bem-aviv') return <Navigate to="/bem-aviv" replace />
    if (choice === 'projetos') return <Navigate to="/projetos" replace />
    return <Navigate to="/escolher-sistema" replace />
  }
  return <Navigate to="/lsh/inicio" replace />
}

export default function App() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Carregando módulo...</p>}>
      <Routes>
        <Route path="/sign-in/*" element={<SignInPage />} />
        <Route path="/sign-up/*" element={<SignUpPage />} />
        <Route element={<RequireAuth />}>
          <Route element={<AllowedEmailGuard />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<HomeRedirect />} />
              <Route path="/inicio" element={<HomeRedirect />} />
              <Route path="/escolher-sistema" element={<SystemChooserPage />} />
              <Route path="/bem-aviv" element={<BemAvivHomePage />} />
              <Route path="/bem-aviv/clientes" element={<BemAvivClientesPage />} />
              <Route path="/bem-aviv/follow-up" element={<BemAvivFollowupPage />} />
              <Route path="/bem-aviv/follow-up/produtividade" element={<BemAvivFollowupProdutividadePage />} />
              <Route path="/bem-aviv/produtos-catalogo" element={<BemAvivProdutosCatalogoPage />} />
              <Route path="/bem-aviv/produtos" element={<BemAvivProdutosPage />} />
              <Route path="/bem-aviv/produtos/plataforma-de-descanso" element={<BemAvivProdutosPage />} />
              <Route path="/bem-aviv/produtos/cabeceiras" element={<BemAvivProdutosPage />} />
              <Route path="/bem-aviv/produtos/bases-camas" element={<BemAvivProdutosPage />} />
              <Route path="/bem-aviv/produtos/acessorios" element={<BemAvivProdutosPage />} />
              <Route path="/bem-aviv/pedidos" element={<BemAvivPedidosPage />} />
              <Route path="/bem-aviv/categorias" element={<BemAvivCategoriasPage />} />
              <Route path="/bem-aviv/tabela-preco" element={<BemAvivTabelaPrecoPage />} />
              <Route path="/bem-aviv/tabela-preco-catalogo" element={<BemAvivTabelaPrecoCatalogoPage />} />
              <Route path="/bem-aviv/catalogos-preco" element={<BemAvivCatalogosPrecoPage />} />
              <Route path="/bem-aviv/catalogos-preco/:catalogId" element={<BemAvivCatalogoPrecoDetailPage />} />
              <Route path="/bem-aviv/catalogos-preco/:catalogId/bloco/:blockId" element={<BemAvivCatalogoMatrizBlocoPage />} />

              <Route element={<RequireFullHubAccess />}>
                <Route path="/lsh/inicio" element={<LshStartPage />} />
                <Route element={<RequireProjectsAccess />}>
                  <Route path="/projetos" element={<ProjectsHubPage />} />
                  <Route path="/projetos/kanban" element={<ProjectKanbanPage />} />
                  <Route path="/projetos/backlog" element={<ProjectBacklogPage />} />
                  <Route path="/projetos/clientes" element={<ProjectClientsPage />} />
                  <Route path="/projetos/responsaveis" element={<ProjectAssigneesPage />} />
                  <Route path="/projetos/sprints" element={<ProjectSprintsPage />} />
                  <Route path="/projetos/atividades" element={<ProjectActivitiesPage />} />
                  <Route path="/projetos/anotacoes" element={<ProjectNotesPage />} />
                </Route>
                <Route path="/lsh/resumo" element={<Dashboard />} />
                <Route path="/lsh/contas-bancarias" element={<BankAccounts />} />
                <Route path="/lsh/categorias" element={<Categories />} />
                <Route path="/lsh/fluxo" element={<CashflowPage />} />
                <Route path="/lsh/cartoes" element={<CreditCardsPage />} />
                <Route path="/lsh/cartoes/:cardId" element={<CardInvoicesPage />} />
                <Route path="/lsh/cartoes/:cardId/faturas/:invoiceId" element={<InvoiceDetailPage />} />
                <Route element={<RequireTasksHomologAccess />}>
                  <Route path="/lsh/agenda" element={<AgendaPage />} />
                  <Route path="/lsh/tarefas" element={<TasksPage />} />
                </Route>

                <Route path="/contas-bancarias" element={<Navigate to="/lsh/contas-bancarias" replace />} />
                <Route path="/categorias" element={<Navigate to="/lsh/categorias" replace />} />
                <Route path="/fluxo" element={<Navigate to="/lsh/fluxo" replace />} />
                <Route path="/cartoes" element={<Navigate to="/lsh/cartoes" replace />} />
                <Route element={<RequireTasksHomologAccess />}>
                  <Route path="/agenda" element={<Navigate to="/lsh/agenda" replace />} />
                  <Route path="/tarefas" element={<Navigate to="/lsh/tarefas" replace />} />
                </Route>
                <Route path="/cartoes/:cardId" element={<CardInvoicesPage />} />
                <Route path="/cartoes/:cardId/faturas/:invoiceId" element={<InvoiceDetailPage />} />
              </Route>
            </Route>
          </Route>
        </Route>
      </Routes>
    </Suspense>
  )
}
