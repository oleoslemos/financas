import type { ReactNode } from 'react'

type FormDialogProps = {
  open: boolean
  title: string
  description?: string
  children: ReactNode
  actions: ReactNode
  onClose: () => void
}

export function FormDialog({ open, title, description, children, actions, onClose }: FormDialogProps) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="form-dialog-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="max-h-[min(90dvh,720px)] w-full max-w-md overflow-y-auto rounded-t-2xl border border-slate-200 bg-white p-4 shadow-xl sm:max-h-[85vh] sm:rounded-2xl sm:p-5"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3 id="form-dialog-title" className="text-lg font-semibold tracking-tight text-slate-900">
          {title}
        </h3>
        {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
        <div className="mt-4 space-y-3">{children}</div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">{actions}</div>
      </div>
    </div>
  )
}
