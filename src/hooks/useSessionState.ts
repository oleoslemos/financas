import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Persists state in sessionStorage so it survives React Router navigations.
 * On mount it restores the last saved value; on every change it writes back.
 *
 * @param key     A unique session-storage key (prefixed with 'ss:' internally)
 * @param initial The initial value when nothing is stored yet
 */
export function useSessionState<T>(
  key: string,
  initial: T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const storageKey = `ss:${key}`

  const [state, setStateRaw] = useState<T>(() => {
    try {
      const raw = sessionStorage.getItem(storageKey)
      if (raw !== null) return JSON.parse(raw) as T
    } catch {
      // silently ignore parse errors
    }
    return initial
  })

  // Keep a ref so the effect below always sees the latest value without
  // needing to be listed as a dependency (avoids spurious re-runs).
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(state))
    } catch {
      // Quota exceeded or private browsing — degrade gracefully
    }
  }, [storageKey, state])

  const setState = useCallback<React.Dispatch<React.SetStateAction<T>>>(
    (action) => {
      setStateRaw((prev) => {
        const next = typeof action === 'function' ? (action as (v: T) => T)(prev) : action
        return next
      })
    },
    [],
  )

  return [state, setState]
}
