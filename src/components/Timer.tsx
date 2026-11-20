import { useLiveQuery } from 'dexie-react-hooks'
import { db, getMeta, setMeta } from '../db'
import { pauseTimer, startTimer } from '../domain/actions'
import { loadItem } from '../domain/queries'
import { type DayItem, currentStep, liveSpentSec, liveStepSec } from '../domain/stats'
import { formatClock, formatMin } from '../lib/format'
import { useNow, useRunning } from '../lib/hooks'
import { useItemActions } from '../lib/itemActions'
import { useNav } from '../lib/nav'
import { Icon, btnGhost, btnPrimary } from './ui'

const LONG_SEC = 3600
const SNOOZE_KEY = 'longTaskSnooze'

/** Clé de l'alerte « plus d'une heure » : la tâche (sur tous ses jours) ou le passage de routine. */
const alertKey = (item: DayItem) => item.taskId ?? item.id

/** Temps total sur une tâche sans durée prévue, tous jours confondus. */
function longTaskSec(item: DayItem, now: number): number | undefined {
  if (item.estimateMin) return undefined
  return liveSpentSec(item, now) + (item.otherDaysSec ?? 0)
}

/** L'alerte est-elle à montrer ? Elle est masquée jusqu'au temps choisi avec « Me le rappeler dans… ». */
function useLongTaskAlert(item: DayItem | undefined, now: number) {
  const snooze = useLiveQuery(() => getMeta<Record<string, number>>(db, SNOOZE_KEY, {}), [])
  if (!item || snooze === undefined) return { show: false, total: 0 }
  const total = longTaskSec(item, now)
  if (total === undefined || total < LONG_SEC) return { show: false, total: total ?? 0 }
  return { show: total >= (snooze[alertKey(item)] ?? 0), total }
}

/** Plus d'une heure sur une tâche sans durée : on invite à changer de tâche ou à s'arrêter. */
function LongTaskAlert({ item, total }: { item: DayItem; total: number }) {
  const remind = async (min: number) => {
    const all = await getMeta<Record<string, number>>(db, SNOOZE_KEY, {})
    await setMeta(db, SNOOZE_KEY, { ...all, [alertKey(item)]: total + min * 60 })
  }
  return (
    <div className="mt-5 w-full max-w-xs rounded-2xl bg-bad-soft px-4 py-3 text-center">
      <p className="text-sm font-semibold text-bad">Change de tâche ou arrête-toi pour mieux gérer ton temps !</p>
      <div className="mt-2 text-xs text-muted">Me le rappeler dans</div>
      <div className="mt-1.5 flex justify-center gap-1.5">
        {[15, 30, 60].map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => void remind(m)}
            className="rounded-full bg-surface px-3 py-1 text-xs font-semibold text-ink active:scale-95"
          >
            {formatMin(m)}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Barre visible sur tous les onglets tant qu'un chrono tourne. */
export function MiniPlayer() {
  const { setFocus } = useNav()
  const running = useRunning()
  const now = useNow(1000)
  const alert = useLongTaskAlert(running?.item, now)
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
          {alert.show ? (
            <div className="mt-0.5 w-fit max-w-full truncate rounded-md bg-bad px-1.5 text-xs font-semibold text-on-accent">
              Plus d'1 h : change de tâche ou arrête-toi !
            </div>
          ) : (
            <div className="truncate text-xs opacity-80">
              {step ? `Étape de « ${item.name} »` : 'Chrono en cours'}
              {est ? ` · estimé ${formatMin(est)}` : ''}
            </div>
          )}
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
  const alert = useLongTaskAlert(item ?? undefined, now)

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
        {alert.show && <LongTaskAlert item={item} total={alert.total} />}
        {(subtasks.length > 0 || !!item.otherDaysSec) && (
          <div className="mt-3 text-xs text-muted tabular">
            Total {item.kind === 'routine' ? 'routine' : 'tâche'} : {formatClock(totalSpent + (item.otherDaysSec ?? 0))}
            {item.estimateMin ? ` / ${formatMin(item.estimateMin)}` : ''}
            {item.otherDaysSec ? ` · dont ${formatMin(Math.round(item.otherDaysSec / 60))} les autres jours` : ''}
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
                        // étape cochée : le chrono se met en pause, tu relances la suivante quand tu es prêt
                        const finished = await toggleStep({ entryId: item.id, kind: item.kind, parentName: item.name }, st)
                        if (finished) onClose()
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
          {running ? 'Pause' : currentSub && !(currentSub.spentSec ?? 0) ? 'Lancer' : 'Reprendre'}
        </button>
        <button
          type="button"
          className={`${btnPrimary} flex-1 py-3.5 text-base`}
          onClick={async () => {
            // découpée : « Terminer » finit seulement l'étape en cours, et le chrono se met en pause
            if (currentSub && currentSub.status === 'todo') {
              const finished = await toggleStep({ entryId: item.id, kind: item.kind, parentName: item.name }, currentSub)
              if (finished) onClose()
              return
            }
            await complete(item)
            onClose()
          }}
        >
          <Icon name="check" className="size-5" strokeWidth={3} />
          {currentSub ? "Finir l'étape" : 'Terminer'}
        </button>
      </div>
    </div>
  )
}
