import { Link } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import { Button } from '../ui/Button'
import { formatBRL } from '../../lib/format'
import { isRepresentante } from '../../lib/companyKind'
import {
  formatGoalMoneyInput,
  monthLabels,
  parseGoalMoneyInput,
  suggestMonthGoalFromHistory,
  sumMonthlyGoals,
  type MonthlyGoalsMap,
} from '../../lib/salesGoals'

type Props = {
  companyKind?: string | null
  goalYear: number
  onGoalYearChange: (year: number) => void
  annualGoalDraft: string
  onAnnualGoalDraftChange: (v: string) => void
  monthlyGoalsDraft: Record<string, string>
  onMonthlyGoalDraftChange: (month: string, v: string) => void
  monthlySoldAllTime: Record<string, number>
  soldForProgress: number
  goalsLoading: boolean
  goalsSaving: boolean
  goalsMsg: string | null
  onSave: () => void
  onApplySuggestionsAll: () => void
}

export function SalesGoalsEditor({
  companyKind,
  goalYear,
  onGoalYearChange,
  annualGoalDraft,
  onAnnualGoalDraftChange,
  monthlyGoalsDraft,
  onMonthlyGoalDraftChange,
  monthlySoldAllTime,
  soldForProgress,
  goalsLoading,
  goalsSaving,
  goalsMsg,
  onSave,
  onApplySuggestionsAll,
}: Props) {
  const representante = isRepresentante(companyKind)
  const annualNum = parseGoalMoneyInput(annualGoalDraft)
  const monthlySum = sumMonthlyGoals(
    Object.fromEntries(
      Object.entries(monthlyGoalsDraft).map(([k, v]) => [k, parseGoalMoneyInput(v)]),
    ) as MonthlyGoalsMap,
  )
  const progressPct = annualNum > 0 ? Math.min(100, (soldForProgress / annualNum) * 100) : 0
  const goalReached = annualNum > 0 && soldForProgress >= annualNum
  const yearOptions = [goalYear - 1, goalYear, goalYear + 1]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {representante ? 'Meta global' : 'Meta anual'}
          </p>
          <p className="mt-1 font-hub text-2xl font-bold tabular-nums text-slate-900">{formatBRL(annualNum)}</p>
          <p className="mt-1 text-xs text-slate-500">
            {representante ? (
              <>
                Vendido acumulado (todo o histórico): <strong>{formatBRL(soldForProgress)}</strong>
              </>
            ) : (
              <>
                Vendido no ano ({goalYear}) até agora: <strong>{formatBRL(soldForProgress)}</strong>
              </>
            )}
            {annualNum > 0 ? (
              <>
                {' '}
                · Progresso{representante ? ' na meta global' : ''}:{' '}
                <strong className="text-[#185FA5]">{progressPct.toFixed(1)}%</strong>
              </>
            ) : null}
          </p>
          {representante && goalReached ? (
            <p className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50/90 px-3 py-2 text-xs leading-relaxed text-emerald-900">
              Meta global atingida. Você pode solicitar o perfil de{' '}
              <strong>Distribuidor</strong> em{' '}
              <Link to="/bem-aviv/empresa" className="font-semibold text-emerald-800 underline">
                Dados da empresa
              </Link>
              .
            </p>
          ) : null}
        </div>
        {!representante ? (
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
            Ano da meta
            <select
              value={goalYear}
              onChange={(e) => onGoalYearChange(Number(e.target.value))}
              className="mt-1 block rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm font-medium text-slate-800"
              disabled={goalsLoading || goalsSaving}
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {representante ? (
        <p className="rounded-lg border border-sky-100 bg-sky-50/80 px-3 py-2 text-xs leading-relaxed text-sky-900">
          Representantes possuem apenas a <strong>meta global</strong> (valor único). Metas por mês e por ano são
          exclusivas de <strong>distribuidores</strong>, para planejamento comercial.
        </p>
      ) : null}

      <label className="block space-y-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          {representante ? 'Valor da meta global (R$)' : 'Valor da meta anual (R$)'}
        </span>
        <input
          className="w-full max-w-xs rounded-md border border-slate-300 px-3 py-2 text-sm tabular-nums"
          value={annualGoalDraft}
          onChange={(e) => onAnnualGoalDraftChange(e.target.value)}
          inputMode="decimal"
          placeholder="Ex: 100000"
          disabled={goalsLoading || goalsSaving}
        />
      </label>

      {!representante ? (
        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Meta por mês</p>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-800 hover:bg-sky-100 disabled:opacity-50"
              onClick={onApplySuggestionsAll}
              disabled={goalsLoading || goalsSaving}
            >
              <Sparkles size={14} aria-hidden />
              Sugerir todos (histórico)
            </button>
          </div>
          <p className="mb-3 text-xs text-slate-500">
            Sugestão = média das vendas do mesmo mês em anos anteriores (pedidos finalizados / entrega pendente /
            entregues). Soma das metas mensais: <strong>{formatBRL(monthlySum)}</strong>
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {monthLabels().map((label, idx) => {
              const month = idx + 1
              const key = String(month)
              const sold = monthlySoldAllTime[`${goalYear}-${String(month).padStart(2, '0')}`] ?? 0
              const suggestion = suggestMonthGoalFromHistory(month, monthlySoldAllTime, goalYear)
              return (
                <div key={key} className="rounded-lg border border-slate-100 bg-slate-50/80 p-2">
                  <div className="mb-1 flex items-center justify-between gap-1">
                    <span className="text-xs font-semibold text-slate-700">{label}</span>
                    <span className="text-[10px] text-slate-500">Vendido: {formatBRL(sold)}</span>
                  </div>
                  <input
                    className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm tabular-nums"
                    value={monthlyGoalsDraft[key] ?? ''}
                    onChange={(e) => onMonthlyGoalDraftChange(key, e.target.value)}
                    inputMode="decimal"
                    placeholder={suggestion != null ? formatGoalMoneyInput(suggestion) : '0'}
                    disabled={goalsLoading || goalsSaving}
                  />
                  {suggestion != null ? (
                    <button
                      type="button"
                      className="mt-1 text-[10px] font-semibold text-sky-700 hover:underline"
                      onClick={() => onMonthlyGoalDraftChange(key, formatGoalMoneyInput(suggestion))}
                      disabled={goalsLoading || goalsSaving}
                    >
                      Usar sugestão {formatBRL(suggestion)}
                    </button>
                  ) : (
                    <p className="mt-1 text-[10px] text-slate-400">Sem histórico anterior</p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      {goalsMsg ? <p className="text-sm text-slate-600">{goalsMsg}</p> : null}
      <div className="flex justify-end">
        <Button type="button" onClick={onSave} disabled={goalsLoading || goalsSaving}>
          {goalsSaving ? 'Salvando metas…' : representante ? 'Salvar meta global' : 'Salvar metas'}
        </Button>
      </div>
    </div>
  )
}
