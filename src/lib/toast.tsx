import { type ReactNode, createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

export interface ToastInput {
  text: string
  actionLabel?: string
  onAction?: () => void
  /** Durée d'affichage en ms (6 s par défaut). */
  duration?: number
}

interface ToastState extends ToastInput {
  id: number
}

const ToastContext = createContext<(t: ToastInput) => void>(() => {})

export const useToast = () => useContext(ToastContext)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null)
  const counter = useRef(0)

  const show = useCallback((t: ToastInput) => {
    counter.current += 1
    setToast({ ...t, id: counter.current })
  }, [])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast((cur) => (cur?.id === toast.id ? null : cur)), toast.duration ?? 6000)
    return () => clearTimeout(id)
  }, [toast])

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+12.5rem)] z-50 flex justify-center px-4">
          <div
            key={toast.id}
            role="status"
            className="anim-toast pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-sm text-bg shadow-lg"
          >
            <span className="min-w-0 flex-1">{toast.text}</span>
            {toast.actionLabel && (
              <button
                type="button"
                className="shrink-0 font-semibold text-accent"
                onClick={() => {
                  toast.onAction?.()
                  setToast(null)
                }}
              >
                {toast.actionLabel}
              </button>
            )}
          </div>
        </div>
      )}
    </ToastContext.Provider>
  )
}
