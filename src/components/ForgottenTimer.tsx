import { useState } from 'react'
import { db } from '../db'
import { pauseTimer, stopTimerAt } from '../domain/actions'
import type { Session } from '../domain/types'
import { formatSec, timeOfDay } from '../lib/format'
import { Sheet, btnGhost, btnPrimary, inputBase } from './ui'

/** Un chrono tourne depuis plus de 3 heures ou depuis la veille : on demande quoi en faire (RG-67). */
export function ForgottenTimer({ session, name, onDone }: { session: Session; name: string; onDone: () => void }) {
  const start = session.startAt ?? Date.now()
  const [time, setTime] = useState(timeOfDay(Math.min(Date.now(), start + 3_600_000)))
  const endAt = (() => {
    const [h, m] = time.split(':').map(Number)
    const d = new Date(start)
    d.setHours(h, m, 0, 0)
    if (d.getTime() < start) d.setDate(d.getDate() + 1)
    return Math.min(Date.now(), d.getTime())
  })()
  return (
    <Sheet title="Chrono oublié ?" onClose={onDone}>
      <p className="mt-1 text-sm text-muted">
        Le chrono de <span className="font-semibold text-ink">{name}</span> tourne depuis {timeOfDay(start)} (
        {formatSec((Date.now() - start) / 1000)}).
      </p>
      <label className="mt-5 flex items-center justify-between gap-3 text-sm">
        Tu as arrêté à
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={`${inputBase} w-auto`} />
      </label>
      <div className="mt-4 space-y-2">
        <button
          type="button"
          className={`${btnPrimary} w-full`}
          onClick={async () => {
            await stopTimerAt(db, endAt)
            onDone()
          }}
        >
          Arrêter à {timeOfDay(endAt)} ({formatSec((endAt - start) / 1000)})
        </button>
        <button
          type="button"
          className={`${btnGhost} w-full`}
          onClick={async () => {
            await pauseTimer(db, Date.now())
            onDone()
          }}
        >
          Arrêter maintenant
        </button>
        <button type="button" className={`${btnGhost} w-full`} onClick={onDone}>
          Il tourne toujours, continuer
        </button>
      </div>
    </Sheet>
  )
}
