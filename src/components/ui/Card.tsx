import { cn } from '../../lib/cn'

type CardProps = React.HTMLAttributes<HTMLDivElement>
type CardSectionProps = React.HTMLAttributes<HTMLDivElement>

export function Card({ className, ...props }: CardProps) {
  return <div className={cn('rounded-2xl border border-[color:var(--color-border-soft)] bg-white shadow-sm', className)} {...props} />
}

export function CardHeader({ className, ...props }: CardSectionProps) {
  return <div className={cn('p-4 pb-0', className)} {...props} />
}

export function CardContent({ className, ...props }: CardSectionProps) {
  return <div className={cn('p-4', className)} {...props} />
}
