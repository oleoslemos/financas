import { cn } from '../../lib/cn'

type InputProps = React.InputHTMLAttributes<HTMLInputElement>

export function Input({ className, ...props }: InputProps) {
  return <input className={cn(className)} {...props} />
}
