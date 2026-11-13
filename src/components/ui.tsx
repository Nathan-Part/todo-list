import { type ReactNode, useEffect, useState } from 'react'

/* ---------------------------------------------------------------- */
/* Icônes (traits fins, 24×24)                                       */
/* ---------------------------------------------------------------- */

const PATHS: Record<string, string> = {
  check: 'M20 6 9 17l-5-5',
  plus: 'M12 5v14M5 12h14',
  x: 'M18 6 6 18M6 6l12 12',
  play: 'M7 4.5v15l13-7.5z',
  pause: 'M8 5v14M16 5v14',
  left: 'm15 18-6-6 6-6',
  right: 'm9 18 6-6-6-6',
  down: 'm6 9 6 6 6-6',
  sliders: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  repeat: 'm17 2 4 4-4 4M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v1a4 4 0 0 1-4 4H3',
  inbox:
    'M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z',
  calendar: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  chart: 'M12 20V10M18 20V4M6 20v-4',
  trash:
    'M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6',
  search: 'm21 21-4.3-4.3M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2',
  arrow: 'M5 12h14M12 5l7 7-7 7',
  alert:
    'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01',
  skip: 'm5 4 10 8-10 8zM19 5v14',
  undo: 'M3 7v6h6M3 13a9 9 0 1 0 3-7l-3 3',
  grip: 'M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01',
  stop: 'M6 6h12v12H6z',
}

export type IconName = keyof typeof PATHS

export function Icon({
  name,
  className = 'size-5',
  fill = false,
  strokeWidth = 2,
}: {
  name: IconName
  className?: string
  fill?: boolean
  strokeWidth?: number
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill={fill ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  )
}

/* ---------------------------------------------------------------- */
/* Boutons et pastilles                                              */
/* ---------------------------------------------------------------- */

const base =
  'inline-flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2.5 text-sm font-medium transition active:scale-[.97] disabled:opacity-40 disabled:active:scale-100'

export const btnPrimary = `${base} bg-accent text-on-accent`
export const btnSoft = `${base} bg-accent-soft text-accent`
export const btnGhost = `${base} border border-line bg-surface text-ink`
export const btnDanger = `${base} bg-bad-soft text-bad`

export function Chip({
  active,
  onClick,
  children,
  className = '',
}: {
  active?: boolean
  onClick?: () => void
  children: ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition active:scale-[.97] ${
        active ? 'border-accent bg-accent text-on-accent' : 'border-line bg-surface text-ink'
      } ${className}`}
    >
      {children}
    </button>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-5">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{label}</div>
      {children}
    </div>
  )
}

export const inputClass =
  'w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 text-ink outline-none focus:border-accent placeholder:text-muted'

/* ---------------------------------------------------------------- */
/* Feuille modale                                                    */
/* ---------------------------------------------------------------- */

/**
 * Sur iPhone, le clavier recouvre le bas de la page sans la redimensionner : on cale la feuille
 * sur la zone réellement visible pour que les boutons du bas restent accessibles.
 */
function useKeyboardViewport() {
  const [vv, setVv] = useState<{ top: number; height: number } | null>(null)
  useEffect(() => {
    const v = window.visualViewport
    if (!v) return
    const update = () => {
      if (window.innerHeight - v.height > 120) setVv({ top: v.offsetTop, height: v.height })
      else setVv(null)
    }
    update()
    v.addEventListener('resize', update)
    v.addEventListener('scroll', update)
    return () => {
      v.removeEventListener('resize', update)
      v.removeEventListener('scroll', update)
    }
  }, [])
  return vv
}

export function Sheet({
  title,
  onClose,
  children,
  footer,
}: {
  title: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  const vv = useKeyboardViewport()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center"
      style={vv ? { top: vv.top, height: vv.height, bottom: 'auto' } : undefined}
      role="dialog"
      aria-modal="true"
    >
      <div className="anim-fade absolute inset-0 bg-black/45" onClick={onClose} />
      <div className="anim-sheet relative flex max-h-[92%] w-full max-w-md flex-col rounded-t-3xl bg-surface shadow-2xl">
        <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-line" />
        <header className="flex shrink-0 items-start justify-between gap-3 px-5 pb-1 pt-3">
          <h2 className="min-w-0 flex-1 text-xl font-semibold leading-tight">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="-mr-2 -mt-1 rounded-full p-2 text-muted active:bg-bg"
          >
            <Icon name="x" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5">{children}</div>
        {footer ? (
          <div className="shrink-0 border-t border-line px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
            {footer}
          </div>
        ) : (
          <div className="h-[env(safe-area-inset-bottom)] shrink-0" />
        )}
      </div>
    </div>
  )
}

export function CategoryDot({ color, className = 'size-2.5' }: { color: string; className?: string }) {
  return <span className={`inline-block shrink-0 rounded-full ${className}`} style={{ backgroundColor: color }} />
}

export const CATEGORY_COLORS = [
  '#6366f1',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#0ea5e9',
  '#a855f7',
  '#14b8a6',
  '#f97316',
  '#64748b',
]
