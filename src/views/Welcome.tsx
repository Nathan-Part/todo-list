import { useState } from 'react'
import { CapacityEditor } from '../components/CapacityEditor'
import { btnGhost, btnPrimary } from '../components/ui'
import { DEFAULT_CAPACITY, META, db, newId, setMeta } from '../db'

const SEED = [
  { name: 'Études', color: '#6366f1' },
  { name: 'Sport', color: '#10b981' },
  { name: 'Admin', color: '#f59e0b' },
  { name: 'Maison', color: '#0ea5e9' },
  { name: 'Perso', color: '#a855f7' },
]

/** Premier lancement : le temps disponible chaque jour, une seule fois. */
export function Welcome({ onDone }: { onDone: () => void }) {
  const [capacity, setCapacity] = useState(DEFAULT_CAPACITY)

  async function start(cap: number[]) {
    await db.transaction('rw', db.meta, db.categories, async () => {
      await setMeta(db, META.capacity, cap)
      if ((await db.categories.count()) === 0) {
        await db.categories.bulkAdd(SEED.map((c, i) => ({ id: newId(), name: c.name, color: c.color, position: i + 1 })))
      }
      await setMeta(db, META.onboarded, true)
    })
    onDone()
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))]">
      <h1 className="text-3xl font-bold tracking-tight">Bienvenue</h1>
      <p className="mt-2 text-muted">
        Tes routines reviennent toutes seules, tes tâches ne disparaissent jamais, et tu vois si ta journée tient avant de la commencer.
      </p>

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-muted">
        Combien de temps as-tu chaque jour ? <span className="normal-case font-normal">(facultatif)</span>
      </h2>
      <p className="mb-3 mt-1 text-sm text-muted">
        Sert à te prévenir quand une journée est trop chargée. Tu ne sais pas ? Passe cette étape : tu pourras le régler plus tard
        dans les réglages (roue dentée en haut à droite).
      </p>
      <CapacityEditor value={capacity} onChange={setCapacity} />

      <div className="flex-1" />
      <div className="mt-8 flex gap-2">
        <button type="button" className={`${btnGhost} flex-1 py-3.5 text-base`} onClick={() => void start(DEFAULT_CAPACITY)}>
          Passer
        </button>
        <button type="button" className={`${btnPrimary} flex-1 py-3.5 text-base`} onClick={() => void start(capacity)}>
          Commencer
        </button>
      </div>
    </div>
  )
}
