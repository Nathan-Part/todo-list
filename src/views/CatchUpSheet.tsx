import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { DurationInput } from '../components/pickers'
import { Sheet, btnGhost, btnPrimary } from '../components/ui'
import { db } from '../db'
import { addSession, markDoneOnDay } from '../domain/actions'
import { loadItem } from '../domain/queries'
import { dayTitle, formatMin } from '../lib/format'
import { useToast } from '../lib/toast'

/** Routine oubliée un jour : dire qu'on l'a rattrapée, et en combien de temps. */
export function CatchUpSheet({ entryId, onClose }: { entryId: string; onClose: () => void }) {
  const toast = useToast()
  const item = useLiveQuery(() => loadItem(db, entryId), [entryId])
  const [minutes, setMinutes] = useState<number | undefined>()
  const [init, setInit] = useState(false)
  useEffect(() => {
    if (item && !init) {
      setMinutes(item.estimateMin)
      setInit(true)
    }
  }, [item, init])
  if (!item) return <Sheet title="…" onClose={onClose}>{null}</Sheet>

  const save = async () => {
    await markDoneOnDay(db, entryId, Date.now())
    if (minutes) await addSession(db, entryId, { durationSec: minutes * 60 }, 'quick')
    toast({ text: 'Routine rattrapée', duration: 2500 })
    onClose()
  }

  return (
    <Sheet title={item.name} onClose={onClose}>
      <p className="mt-1 text-sm text-muted">
        Non faite le <span className="font-semibold text-ink">{dayTitle(item.date).toLowerCase()}</span>. Tu l'as rattrapée ? Indique en
        combien de temps{item.estimateMin ? ` (prévu : ${formatMin(item.estimateMin)})` : ''}.
      </p>
      <div className="mt-4">
        <DurationInput value={minutes} onChange={setMinutes} />
      </div>
      <div className="mt-4 space-y-2">
        <button type="button" className={`${btnPrimary} w-full`} onClick={() => void save()}>
          Je l'ai rattrapée{minutes ? ` en ${formatMin(minutes)}` : ''}
        </button>
        <button type="button" className={`${btnGhost} w-full`} onClick={onClose}>
          Non, laisser en rouge
        </button>
      </div>
    </Sheet>
  )
}
