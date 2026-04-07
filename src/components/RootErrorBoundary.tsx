import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }

type State = { error: Error | null }

export class RootErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[LSH]', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white p-4 text-center sm:p-6">
          <p className="text-lg font-medium text-red-600">Erro ao carregar o app</p>
          <p className="max-w-lg text-sm text-slate-600">
            Abra o console do navegador (F12 → Console) para ver o detalhe. Confira na Vercel as variáveis{' '}
            <code className="text-sky-700">VITE_CLERK_PUBLISHABLE_KEY</code>,{' '}
            <code className="text-sky-700">VITE_SUPABASE_URL</code> e{' '}
            <code className="text-sky-700">VITE_SUPABASE_ANON_KEY</code> (sem espaços extras) e faça um novo deploy.
          </p>
          <pre className="max-h-40 max-w-full overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-left text-xs text-slate-800">
            {this.state.error.message}
          </pre>
          <button
            type="button"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-800 shadow-sm hover:bg-slate-50"
            onClick={() => window.location.reload()}
          >
            Recarregar
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
