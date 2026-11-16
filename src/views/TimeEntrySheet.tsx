import { useState } from 'react'
import { TimeRangeInput, rangeToMs } from '../components/pickers'
import { Sheet, btnGhost, btnPrimary, btnSoft } from '../components/ui'
import { db } from '../db'
import { addSession } from '../domain/actions'
import type { DayKey } from '../domain/types'
import { formatMin, formatSec, timeOfDay } from '../lib/format'
import { useToast } from '../lib/toast'

/**
 * Tâche cochée sans chrono : « de quand à quand l'as-tu faite ? »
 * Le temps enregistré nourrit la frise, le résumé du jour et les statistiques.
 */
export function TimeEntrySheet({
  entryId,
  name,
  estimateMin,
  day,
  onClose,
}: {
  entryId: string
  name: string
  estimateMin?: number
  day: DayKey
  onClose: () => void
}) {
  const toast = useToast()
  const now = Date.now()
  const [end, setEnd] = useState(timeOfDay(now))
  const [start, setStart] = useState(timeOfDay(now - (estimateMin ?? 30) * 60_000))
  const range = rangeToMs(day, start, end)

  const save = async (r: { startAt: number; endAt: number } | null, durationSec?: number) => {
    if (r) await addSession(db, entryId, { durationSec: (r.endAt - r.startAt) / 1000, ...r }, 'manual')
    else if (durationSec) await addSession(db, entryId, { durationSec }, 'quick')
    toast({ text: 'Temps enregistré', duration: 2000 })
    onClose()
  }

  return (
    <Sheet title="Bravo, c'est fait !" onClose={onClose}>
      <p className="mt-1 text-sm text-muted">
        Quand as-tu fait <span className="font-semibold text-ink">{name}</span> ? Ça sert à ta frise, au résumé du jour et à mieux
        estimer la prochaine fois.
      </p>
      <div className="mt-4">
        <TimeRangeInput start={start} end={end} onChange={(a, b) => (setStart(a), setEnd(b))} />
      </div>
      <div className="mt-4 space-y-2">
        <button type="button" className={`${btnPrimary} w-full`} disabled={!range} onClick={() => void save(range)}>
          Enregistrer{range ? ` (${formatSec((range.endAt - range.startAt) / 1000)})` : ''}
        </button>
        {estimateMin ? (
          <button type="button" className={`${btnSoft} w-full`} onClick={() => void save(null, estimateMin * 60)}>
            Juste la durée prévue ({formatMin(estimateMin)}), sans heure
          </button>
        ) : null}
        <button type="button" className={`${btnGhost} w-full`} onClick={onClose}>
          Passer
        </button>
      </div>
    </Sheet>
  )
}
