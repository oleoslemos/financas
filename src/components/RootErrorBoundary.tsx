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
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 p-6 text-center">
          <p className="text-lg font-medium text-red-300">Erro ao carregar o app</p>
          <p className="max-w-lg text-sm text-slate-400">
            Abra o console do navegador (F12 → Console) para ver o detalhe. Confira na Vercel as variáveis{' '}
            <code className="text-sky-300">VITE_CLERK_PUBLISHABLE_KEY</code>,{' '}
            <code className="text-sky-300">VITE_SUPABASE_URL</code> e{' '}
            <code className="text-sky-300">VITE_SUPABASE_ANON_KEY</code> (sem espaços extras) e faça um novo deploy.
          </p>
          <pre className="max-h-40 max-w-full overflow-auto rounded-lg border border-slate-800 bg-slate-900 p-3 text-left text-xs text-slate-300">
            {this.state.error.message}
          </pre>
          <button
            type="button"
            className="rounded-lg bg-slate-800 px-4 py-2 text-sm text-slate-200"
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
