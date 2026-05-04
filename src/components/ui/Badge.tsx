import { cn } from '../../lib/cn'

type BadgeVariant = 'default' | 'outline' | 'secondary'

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant
}

const variantClass: Record<BadgeVariant, string> = {
  default: 'border-slate-200 bg-slate-50 text-slate-800',
  outline: 'border-amber-200/90 bg-amber-50 text-amber-800',
  secondary: 'border-transparent bg-slate-100 text-slate-700 hover:bg-slate-200/90',
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center truncate rounded-md border px-2 py-0.5 text-xs font-medium transition-colors',
        variantClass[variant],
        className,
      )}
      {...props}
    />
  )
}
