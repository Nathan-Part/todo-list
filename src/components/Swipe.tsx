import { type HTMLAttributes, type ReactNode, type Ref, useRef, useState } from 'react'

export interface SwipeAction {
  label: string
  tone: 'accent' | 'warn' | 'muted' | 'bad'
  onClick: () => void
  /** Déclenchée aussi en glissant jusqu'au bout. */
  full?: boolean
}

const ACTION_W = 88
const TONES = {
  accent: 'bg-accent text-on-accent',
  warn: 'bg-warn text-surface',
  muted: 'bg-muted text-surface',
  bad: 'bg-bad text-surface',
}

/**
 * Ligne qui révèle des actions quand on la glisse vers la gauche.
 * Glisser jusqu'au bout déclenche l'action marquée `full`.
 */
export function Swipeable({
  actions,
  className = '',
  children,
  rootRef,
  rootProps,
}: {
  actions?: SwipeAction[]
  /** Classes de la ligne visible (premier plan). */
  className?: string
  children: ReactNode
  rootRef?: Ref<HTMLDivElement>
  rootProps?: HTMLAttributes<HTMLDivElement>
}) {
  const [dx, setDx] = useState(0)
  const [anim, setAnim] = useState(false)
  const start = useRef<{ x: number; y: number; base: number; dir?: 'h' | 'v' } | null>(null)
  const fgRef = useRef<HTMLDivElement>(null)
  const maxOpen = (actions?.length ?? 0) * ACTION_W
  const fullAction = actions?.find((a) => a.full)
  const width = () => fgRef.current?.offsetWidth ?? 360
  // seuil du « glisser jusqu'au bout » : bien au-delà de l'ouverture normale des boutons
  const fullAt = () => Math.max(width() * 0.6, maxOpen + 48)
  const pastFull = !!fullAction && -dx > fullAt()

  const handlers = actions?.length
    ? {
        onTouchStart: (e: React.TouchEvent) => {
          start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, base: dx }
          setAnim(false)
        },
        onTouchMove: (e: React.TouchEvent) => {
          const st = start.current
          if (!st) return
          const mx = e.touches[0].clientX - st.x
          const my = e.touches[0].clientY - st.y
          if (!st.dir && (Math.abs(mx) > 10 || Math.abs(my) > 10)) st.dir = Math.abs(mx) > Math.abs(my) ? 'h' : 'v'
          if (st.dir === 'h') setDx(Math.max(fullAction ? -width() : -maxOpen - 24, Math.min(0, st.base + mx)))
        },
        onTouchEnd: () => {
          const st = start.current
          start.current = null
          if (!st || st.dir !== 'h') return
          setAnim(true)
          if (fullAction && -dx > fullAt()) {
            setDx(-width())
            setTimeout(() => {
              fullAction.onClick()
              setAnim(false)
              setDx(0)
            }, 180)
            return
          }
          setDx((cur) => (cur < -maxOpen / 2 ? -maxOpen : 0))
        },
      }
    : {}
  const close = () => {
    setAnim(true)
    setDx(0)
  }

  return (
    <div ref={rootRef} {...rootProps} className={`relative overflow-hidden rounded-2xl ${rootProps?.className ?? ''}`}>
      {actions && dx < 0 && (
        <div className="absolute inset-y-0 right-0 flex" style={{ width: Math.max(maxOpen, -dx) }}>
          {(pastFull ? [fullAction!] : actions).map((a, i, arr) => (
            <button
              key={a.label}
              type="button"
              onClick={() => {
                close()
                a.onClick()
              }}
              className={`flex items-center justify-center text-sm font-semibold transition-all ${TONES[a.tone]}`}
              style={i === arr.length - 1 ? { flex: 1, minWidth: ACTION_W } : { width: ACTION_W }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
      <div
        ref={fgRef}
        {...handlers}
        onClickCapture={(e) => {
          if (dx !== 0) {
            e.stopPropagation()
            e.preventDefault()
            close()
          }
        }}
        style={{ transform: dx ? `translateX(${dx}px)` : undefined, touchAction: 'pan-y' }}
        className={`relative ${anim ? 'transition-transform duration-200' : ''} ${className}`}
      >
        {children}
      </div>
    </div>
  )
}
