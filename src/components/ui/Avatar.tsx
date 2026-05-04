import { cn } from '../../lib/cn'

type DivProps = React.HTMLAttributes<HTMLDivElement>

export function Avatar({ className, ...props }: DivProps) {
  return (
    <div
      className={cn('relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full bg-white', className)}
      {...props}
    />
  )
}

export function AvatarFallback({ className, ...props }: DivProps) {
  return (
    <div className={cn('flex h-full w-full items-center justify-center rounded-full text-[11px] font-bold uppercase', className)} {...props} />
  )
}
