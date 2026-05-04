import { cn } from '../../lib/cn'

type ProgressProps = React.HTMLAttributes<HTMLDivElement> & {
  /** 0–100 */
  value: number
}

export function Progress({ className, value, ...props }: ProgressProps) {
  const v = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0))
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(v)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn('relative h-2 w-full overflow-hidden rounded-full bg-slate-100', className)}
      {...props}
    >
      <div
        className="h-full rounded-full bg-gradient-to-r from-[#185FA5] to-sky-400 transition-[width] duration-300 ease-out"
        style={{ width: `${v}%` }}
      />
    </div>
  )
}
