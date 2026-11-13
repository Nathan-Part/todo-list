import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { pauseTimer, startTimer } from '../domain/actions'
import { loadItem } from '../domain/queries'
import { liveSpentSec } from '../domain/stats'
import { formatClock, formatMin } from '../lib/format'
import { useNow, useRunning } from '../lib/hooks'
import { useItemActions } from '../lib/itemActions'
import { useNav } from '../lib/nav'
import { Icon, btnGhost, btnPrimary } from './ui'

/** Barre visible sur tous les onglets tant qu'un chrono tourne. */
export function MiniPlayer() {
  const { setFocus } = useNav()
  const running = useRunning()
  const now = useNow(1000)
  if (!running) return null
  const { item } = running
  const spent = liveSpentSec(item, now)
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4.25rem)] z-30 flex justify-center px-3">
      <div className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl bg-accent px-3 py-2 text-on-accent shadow-lg">
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setFocus(item.id)}>
          <div className="truncate text-sm font-semibold">{item.name}</div>
          <div className="text-xs opacity-80">
            Chrono en cours{item.estimateMin ? ` · estimé ${formatMin(item.estimateMin)}` : ''}
          </div>
        </button>
        <span className="text-lg font-semibold tabular">{formatClock(spent)}</span>
        <button
          type="button"
          aria-label="Mettre en pause"
          onClick={() => void pauseTimer(db, Date.now())}
          className="flex size-9 items-center justify-center rounded-full bg-on-accent/20 active:scale-90"
        >
          <Icon name="pause" className="size-4" />
        </button>
      </div>
    </div>
  )
}

/** Écran focus : chrono plein écran sur la tâche en cours (E8). */
export function FocusScreen({ entryId, onClose }: { entryId: string; onClose: () => void }) {
  const item = useLiveQuery(() => loadItem(db, entryId), [entryId])
  const note = useLiveQuery(async () => {
    const e = await db.entries.get(entryId)
    if (e?.taskId) return (await db.tasks.get(e.taskId))?.note
    if (e?.routineId) return (await db.routines.get(e.routineId))?.note
  }, [entryId])
  const now = useNow(1000)
  const { complete } = useItemActions()

  if (!item) return null
  const running = item.runningSince !== undefined
  const spent = liveSpentSec(item, now)
  const est = item.estimateMin ? item.estimateMin * 60 : undefined
  const over = est !== undefined && spent > est
  const ratio = est ? Math.min(1, spent / est) : 0

  return (
    <div className="anim-fade fixed inset-0 z-50 flex flex-col bg-bg px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="flex items-center justify-between">
        <button type="button" onClick={onClose} aria-label="Réduire" className="-ml-2 rounded-full p-2 text-muted active:bg-surface">
          <Icon name="down" className="size-6" />
        </button>
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">
          {running ? 'En cours' : 'En pause'}
        </span>
        <span className="size-10" />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="max-w-xs text-xl font-semibold">{item.name}</div>
        {item.kind === 'routine' && <div className="mt-1 text-sm text-muted">routine</div>}
        <div className="mt-8 text-7xl font-light tabular tracking-tight">{formatClock(spent)}</div>
        {est !== undefined ? (
          <>
            <div className={`mt-3 text-sm ${over ? 'font-semibold text-bad' : 'text-muted'}`}>
              {over
                ? `Dépassement : + ${formatMin(Math.max(1, Math.round((spent - est) / 60)))}`
                : `Estimé ${formatMin(item.estimateMin!)} · reste ${formatClock(est - spent)}`}
            </div>
            <div className="mt-4 h-2 w-64 overflow-hidden rounded-full bg-line">
              <div
                className={`h-full rounded-full ${over ? 'bg-bad' : 'bg-accent'}`}
                style={{ width: `${(over ? 1 : ratio) * 100}%` }}
              />
            </div>
          </>
        ) : (
          <div className="mt-3 text-sm text-warn">Pas de durée estimée</div>
        )}
        {note && <p className="mt-8 max-w-xs whitespace-pre-wrap text-sm text-muted">{note}</p>}
      </div>

      <div className="mx-auto flex w-full max-w-sm gap-3">
        <button
          type="button"
          className={`${btnGhost} flex-1 py-3.5 text-base`}
          onClick={() => (running ? pauseTimer(db, Date.now()) : startTimer(db, item.id, Date.now()))}
        >
          <Icon name={running ? 'pause' : 'play'} fill={!running} className="size-5" />
          {running ? 'Pause' : 'Reprendre'}
        </button>
        <button
          type="button"
          className={`${btnPrimary} flex-1 py-3.5 text-base`}
          onClick={async () => {
            await complete(item)
            onClose()
          }}
        >
          <Icon name="check" className="size-5" strokeWidth={3} />
          Terminer
        </button>
      </div>
    </div>
  )
}
