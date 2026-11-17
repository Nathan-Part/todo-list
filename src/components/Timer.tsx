import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { pauseTimer, startTimer } from '../domain/actions'
import { loadItem } from '../domain/queries'
import { currentStep, liveSpentSec, liveStepSec } from '../domain/stats'
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
  // sur une tâche ou une routine découpée, le chrono affiché est celui de l'étape en cours
  const step = item.runningSubtaskId ? item.subtasks.find((x) => x.id === item.runningSubtaskId) : undefined
  const spent = step ? liveStepSec(item, step.id, now) : liveSpentSec(item, now)
  const est = step ? step.estimateMin : item.estimateMin
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4.25rem)] z-30 flex justify-center px-3">
      <div className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl bg-accent px-3 py-2 text-on-accent shadow-lg">
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setFocus(item.id)}>
          <div className="truncate text-sm font-semibold">{step ? step.name : item.name}</div>
          <div className="truncate text-xs opacity-80">
            {step ? `Étape de « ${item.name} »` : 'Chrono en cours'}
            {est ? ` · estimé ${formatMin(est)}` : ''}
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
  const { complete, toggleStep } = useItemActions()

  if (!item) return null
  const subtasks = item.subtasks
  const running = item.runningSince !== undefined
  // découpée : le grand chrono est celui de l'étape (en cours, ou la prochaine à faire), pas le total
  const currentSub = currentStep(item)
  const totalSpent = liveSpentSec(item, now)
  const spent = currentSub ? liveStepSec(item, currentSub.id, now) : totalSpent
  const estMin = currentSub ? currentSub.estimateMin : item.estimateMin
  const est = estMin ? estMin * 60 : undefined
  const over = est !== undefined && spent > est
  const ratio = est ? Math.min(1, spent / est) : 0

  return (
    <div role="dialog" aria-modal="true" aria-label="Chrono" className="anim-fade fixed inset-0 z-50 flex flex-col bg-bg px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="flex items-center justify-between">
        <button type="button" onClick={onClose} aria-label="Réduire" className="-ml-2 rounded-full p-2 text-muted active:bg-surface">
          <Icon name="down" className="size-6" />
        </button>
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">
          {running ? 'En cours' : 'En pause'}
        </span>
        <span className="size-10" />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto py-4 text-center">
        {currentSub ? (
          <>
            <div className="max-w-xs text-sm text-muted">
              {item.name}
              {item.kind === 'routine' ? ' · routine' : ''}
            </div>
            <div className="mt-2 text-xs font-semibold uppercase tracking-wide text-accent">
              {running ? 'Étape en cours' : 'Prochaine étape'} · {subtasks.indexOf(currentSub) + 1}/{subtasks.length}
            </div>
            <div className="mt-1 max-w-xs text-xl font-semibold">{currentSub.name}</div>
          </>
        ) : (
          <>
            <div className="max-w-xs text-xl font-semibold">{item.name}</div>
            {item.kind === 'routine' && <div className="mt-1 text-sm text-muted">routine</div>}
          </>
        )}
        <div className="mt-8 text-7xl font-light tabular tracking-tight">{formatClock(spent)}</div>
        {est !== undefined ? (
          <>
            <div className={`mt-3 text-sm ${over ? 'font-semibold text-bad' : 'text-muted'}`}>
              {over
                ? `Dépassement : + ${formatMin(Math.max(1, Math.round((spent - est) / 60)))}`
                : `Estimé ${formatMin(estMin!)} · reste ${formatClock(est - spent)}`}
            </div>
            <div className="mt-4 h-2 w-64 overflow-hidden rounded-full bg-line">
              <div
                className={`h-full rounded-full ${over ? 'bg-bad' : 'bg-accent'}`}
                style={{ width: `${(over ? 1 : ratio) * 100}%` }}
              />
            </div>
          </>
        ) : (
          <div className="mt-3 text-sm text-warn">{currentSub ? "Pas de durée estimée pour cette étape" : 'Pas de durée estimée'}</div>
        )}
        {subtasks.length > 0 && (
          <div className="mt-3 text-xs text-muted tabular">
            Total {item.kind === 'routine' ? 'routine' : 'tâche'} : {formatClock(totalSpent)}
            {item.estimateMin ? ` / ${formatMin(item.estimateMin)}` : ''}
          </div>
        )}
        {subtasks.length > 0 && (
          <div className="mt-8 w-full max-w-xs text-left">
            <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
              {subtasks.map((st) => {
                const stSpent = liveStepSec(item, st.id, now)
                const stOver = !!st.estimateMin && stSpent > st.estimateMin * 60
                const isCurrent = currentSub?.id === st.id
                return (
                  <li key={st.id} className="flex items-center gap-2.5 px-3 py-2 text-sm">
                    <button
                      type="button"
                      aria-label={st.status === 'done' ? 'Décocher' : 'Cocher'}
                      onClick={async () => {
                        const wasRunning = running && item.runningSubtaskId === st.id
                        const finished = await toggleStep({ entryId: item.id, kind: item.kind, parentName: item.name }, st)
                        if (finished) onClose()
                        // étape en cours cochée : le chrono passe tout seul à la suivante
                        else if (wasRunning && st.status === 'todo') await startTimer(db, entryId, Date.now())
                      }}
                      className={`flex size-6 shrink-0 items-center justify-center rounded-full border-2 ${
                        st.status === 'done' ? 'border-good bg-good text-on-accent' : 'border-line text-transparent'
                      }`}
                    >
                      <Icon name="check" className="size-3" strokeWidth={3} />
                    </button>
                    <button
                      type="button"
                      disabled={st.status === 'done' || item.status !== 'todo'}
                      onClick={() => void startTimer(db, entryId, Date.now(), st.id)}
                      className={`min-w-0 flex-1 break-words text-left leading-snug ${st.status === 'done' ? 'text-muted line-through' : ''} ${
                        isCurrent ? 'font-semibold text-accent' : ''
                      }`}
                    >
                      {st.name}
                    </button>
                    <span className={`text-xs tabular ${stOver ? 'font-semibold text-bad' : 'text-muted'}`}>
                      {stSpent > 0 ? formatClock(stSpent) : ''}
                      {stSpent > 0 && st.estimateMin ? ' / ' : ''}
                      {st.estimateMin ? formatMin(st.estimateMin) : ''}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
        {note && <p className="mt-6 max-w-xs whitespace-pre-wrap text-sm text-muted">{note}</p>}
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
