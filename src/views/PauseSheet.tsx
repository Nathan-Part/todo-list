import { useState } from 'react'
import { Chip, Sheet, btnPrimary, inputBase } from '../components/ui'
import { db } from '../db'
import { pauseRoutines } from '../domain/actions'
import { addDays } from '../domain/dates'
import { dayShort } from '../lib/format'
import { useNav } from '../lib/nav'
import { useToast } from '../lib/toast'

/** Pause d'une routine, ou de toutes (RG-37). Les jours en pause sont exclus des statistiques. */
export function PauseSheet({ routineId, onClose }: { routineId?: string; onClose: () => void }) {
  const { today } = useNav()
  const toast = useToast()
  const [mode, setMode] = useState<'until' | 'manual'>('until')
  const [until, setUntil] = useState(addDays(today, 7))

  return (
    <Sheet
      title={routineId ? 'Mettre en pause' : 'Tout mettre en pause'}
      onClose={onClose}
      footer={
        <button
          type="button"
          className={`${btnPrimary} w-full`}
          onClick={async () => {
            await pauseRoutines(db, { routineId, fromDate: today, toDate: mode === 'until' ? until : undefined }, Date.now())
            toast({ text: mode === 'until' ? `En pause jusqu'au ${dayShort(until)}` : 'En pause jusqu\'à la reprise', duration: 3000 })
            onClose()
          }}
        >
          Mettre en pause
        </button>
      }
    >
      <p className="mt-2 text-sm text-muted">
        Pendant la pause, aucune occurrence n'est créée et ces jours ne comptent pas comme « non faits ».
      </p>
      <div className="mt-4 flex flex-wrap gap-1.5">
        <Chip active={mode === 'until'} onClick={() => setMode('until')}>
          Jusqu'à une date
        </Chip>
        <Chip active={mode === 'manual'} onClick={() => setMode('manual')}>
          Jusqu'à la reprise
        </Chip>
      </div>
      {mode === 'until' && (
        <label className="mt-4 flex items-center gap-3 text-sm">
          Reprise le lendemain de
          <input
            type="date"
            min={today}
            value={until}
            onChange={(e) => e.target.value && setUntil(e.target.value)}
            className={`${inputBase} w-auto`}
          />
        </label>
      )}
    </Sheet>
  )
}
