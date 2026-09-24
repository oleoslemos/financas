import { useState, useEffect } from 'react'
import { Sparkles, ArrowRight, CheckCircle2, RotateCcw } from 'lucide-react'
import { isV2DefaultActive, setV2DefaultActive } from '../config/cutover'

export function V2CutoverBanner() {
  const [isActive, setIsActive] = useState(false)

  useEffect(() => {
    setIsActive(isV2DefaultActive())
  }, [])

  const handleToggle = () => {
    const nextState = !isActive
    setV2DefaultActive(nextState)
    setIsActive(nextState)
    window.location.reload()
  }

  return (
    <div className="bg-gradient-to-r from-indigo-900 via-sky-900 to-slate-900 text-white px-4 py-2.5 shadow-md border-b border-indigo-500/30 flex flex-wrap items-center justify-between gap-3 text-xs">
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-400/40">
          <Sparkles className="h-4 w-4" />
        </span>
        <div>
          <span className="font-semibold text-sky-200">NOVA VERSÃO (V2):</span>{' '}
          <span className="text-slate-300">
            {isActive
              ? 'O sistema V2 está ativado como padrão principal para todas as rotas!'
              : 'Você está no ambiente V2 preparado. O sistema antigo continua acessível.'}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleToggle}
          className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-all duration-200 text-xs ${
            isActive
              ? 'bg-amber-500/20 text-amber-200 hover:bg-amber-500/30 border border-amber-500/40'
              : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400 font-bold shadow-sm'
          }`}
        >
          {isActive ? (
            <>
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Restaurar V1 como Padrão</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Substituir Sistema Atual (Tornar V2 Padrão)</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </>
          )}
        </button>
      </div>
    </div>
  )
}
