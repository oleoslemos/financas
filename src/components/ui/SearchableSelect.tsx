import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { cn } from '../../lib/cn'

export type SearchableSelectOption = { value: string; label: string }

function normalizeSearchValue(v: string) {
  return v
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

type SearchableSelectProps = {
  value: string
  onChange: (value: string) => void
  options: SearchableSelectOption[]
  placeholder?: string
  disabled?: boolean
  id?: string
  'aria-label'?: string
  className?: string
}

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = '— SELECIONE —',
  disabled,
  id: idProp,
  'aria-label': ariaLabel,
  className,
}: SearchableSelectProps) {
  const reactId = useId()
  const listId = `${reactId}-listbox`
  const inputId = idProp ?? `${reactId}-input`

  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')

  const selectedLabel = useMemo(
    () => options.find((o) => o.value === value)?.label ?? (value ? value : ''),
    [options, value],
  )

  useEffect(() => {
    if (!open) setText(value ? selectedLabel : '')
  }, [value, selectedLabel, open])

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const filtered = useMemo(() => {
    const q = normalizeSearchValue(text)
    if (!q) return options
    return options.filter((o) => {
      const label = normalizeSearchValue(o.label)
      const value = normalizeSearchValue(o.value)
      return label.includes(q) || value.includes(q)
    })
  }, [options, text])

  function pick(opt: SearchableSelectOption) {
    onChange(opt.value)
    setText(opt.label)
    setOpen(false)
  }

  if (disabled) {
    return (
      <input
        id={inputId}
        aria-label={ariaLabel}
        disabled
        value={value ? selectedLabel : ''}
        placeholder={placeholder}
        className={cn(className)}
      />
    )
  }

  return (
    <div ref={rootRef} className={cn('relative w-full', className)}>
      <input
        id={inputId}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        autoComplete="off"
        value={open ? text : value ? selectedLabel : ''}
        placeholder={placeholder}
        onFocus={() => {
          setOpen(true)
          setText(value ? selectedLabel : '')
        }}
        onChange={(e) => {
          setText(e.target.value)
          setOpen(true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            setOpen(false)
            setText(value ? selectedLabel : '')
            return
          }
          if (e.key === 'Enter') {
            e.preventDefault()
            if (filtered.length === 1) pick(filtered[0]!)
            else if (filtered.length > 0) {
              const typed = normalizeSearchValue(text)
              const exact = filtered.find(
                (o) => normalizeSearchValue(o.label) === typed || normalizeSearchValue(o.value) === typed,
              )
              if (exact) pick(exact)
            }
          }
        }}
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm normal-case text-slate-500">Nenhum resultado.</li>
          ) : (
            filtered.map((opt) => (
              <li key={opt.value} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={opt.value === value}
                  className="w-full px-3 py-2 text-left text-sm normal-case hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
                  onMouseDown={(ev) => {
                    ev.preventDefault()
                    pick(opt)
                  }}
                >
                  {opt.label}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
