import { CURRENT_VERSION } from '../changelog'
import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import { CapacityEditor } from '../components/CapacityEditor'
import { CATEGORY_COLORS, CategoryDot, Field, Icon, Sheet, btnGhost, btnSoft, inputClass } from '../components/ui'
import { DEFAULT_CAPACITY, META, db, getMeta, setMeta } from '../db'
import { archiveCategory, saveCategory } from '../domain/actions'
import { exportData, importData } from '../domain/backup'
import { copiesDb, copyData, listCopies, restoreCopy } from '../domain/copies'
import { dayLabel, dayShort, timeOfDay } from '../lib/format'
import { saveTextFile } from '../lib/files'
import { useCategories } from '../lib/hooks'
import { useNav } from '../lib/nav'
import { useToast } from '../lib/toast'

export function SettingsSheet({ onClose }: { onClose: () => void }) {
  const capacity = useLiveQuery(() => getMeta<number[]>(db, META.capacity, DEFAULT_CAPACITY), []) ?? DEFAULT_CAPACITY
  const { active } = useCategories()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)

  async function doExport() {
    const json = await exportData(db)
    const stamp = new Date().toISOString().slice(0, 10)
    await saveTextFile(`ma-journee-${stamp}.json`, json)
    await setMeta(db, 'lastExport', Date.now())
  }

  async function doImport(file: File) {
    if (!window.confirm('Remplacer TOUTES les données actuelles par celles de ce fichier ?')) return
    setBusy(true)
    try {
      const { rows } = await importData(db, await file.text())
      toast({ text: `Restauré : ${rows} enregistrements`, duration: 4000 })
      onClose()
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : 'Import impossible', duration: 5000 })
    } finally {
      setBusy(false)
    }
  }

  const lastExport = useLiveQuery(() => getMeta<number | undefined>(db, 'lastExport', undefined), [])

  return (
    <Sheet title="Réglages" onClose={onClose}>
      <Field label="Temps disponible par jour">
        <CapacityEditor value={capacity} onChange={(v) => void setMeta(db, META.capacity, v)} />
        <p className="mt-2 text-xs text-muted">
          Facultatif. Sert à repérer les journées surchargées : la jauge devient rouge quand la charge dépasse ce temps. Laisse « – »
          pour un jour sans limite.
        </p>
        {capacity.some((c) => c > 0) && (
          <button type="button" className={`${btnGhost} mt-2`} onClick={() => void setMeta(db, META.capacity, DEFAULT_CAPACITY)}>
            Tout effacer (pas de limite)
          </button>
        )}
      </Field>

      <Field label="Catégories">
        <ul className="space-y-2">
          {active.map((c) => (
            <li key={c.id} className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Changer la couleur"
                className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-line bg-surface active:scale-90"
                onClick={() => {
                  const i = CATEGORY_COLORS.indexOf(c.color)
                  void saveCategory(db, { id: c.id, name: c.name, color: CATEGORY_COLORS[(i + 1) % CATEGORY_COLORS.length] })
                }}
              >
                <CategoryDot color={c.color} className="size-4" />
              </button>
              <input
                key={c.id + c.name}
                defaultValue={c.name}
                aria-label="Nom de la catégorie"
                className={inputClass}
                onBlur={(e) => {
                  const v = e.target.value.trim()
                  if (v && v !== c.name) void saveCategory(db, { id: c.id, name: v, color: c.color })
                  else e.target.value = c.name
                }}
              />
              <button
                type="button"
                aria-label={`Supprimer ${c.name}`}
                className="rounded-full p-2 text-muted active:bg-bg"
                onClick={() => void archiveCategory(db, c.id, Date.now())}
              >
                <Icon name="trash" className="size-4" />
              </button>
            </li>
          ))}
        </ul>
        <form
          className="mt-2 flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!newName.trim()) return
            await saveCategory(db, { name: newName, color: CATEGORY_COLORS[active.length % CATEGORY_COLORS.length] })
            setNewName('')
          }}
        >
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nouvelle catégorie"
            className={inputClass}
          />
          <button type="submit" className={btnSoft} disabled={!newName.trim()}>
            <Icon name="plus" className="size-4" />
          </button>
        </form>
        <p className="mt-2 text-xs text-muted">Une catégorie supprimée reste affichée sur les éléments passés.</p>
      </Field>

      <Field label="Mes données">
        <p className="text-sm text-muted">
          Tout est enregistré sur cet iPhone. Exporte régulièrement un fichier : c'est ta sauvegarde.
          {lastExport ? ` Dernier export : ${dayShort(new Date(lastExport).toISOString().slice(0, 10))}.` : ' Aucun export pour l\'instant.'}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={btnSoft} onClick={() => void doExport()}>
            Exporter mes données
          </button>
          <button type="button" className={btnGhost} disabled={busy} onClick={() => fileRef.current?.click()}>
            Importer un fichier
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) void doImport(f)
            }}
          />
        </div>
      </Field>

      <CopiesField onRestored={onClose} />

      <div className="mt-8 text-center text-xs text-muted">Ma journée · version {CURRENT_VERSION}</div>
    </Sheet>
  )
}

/** Le tiroir : copies automatiques, une par jour, à restaurer en cas d'erreur. */
function CopiesField({ onRestored }: { onRestored: () => void }) {
  const { today } = useNav()
  const toast = useToast()
  const copies = useLiveQuery(() => listCopies(copiesDb), [])
  const [all, setAll] = useState(false)
  const [busy, setBusy] = useState(false)
  if (!copies) return null
  const shown = all ? copies : copies.slice(0, 7)

  const restore = async (id: string, label: string) => {
    if (!window.confirm(`Revenir à l'état du ${label} ? Ce que tu as fait depuis sera remplacé (l'état actuel est gardé dans le tiroir).`)) return
    setBusy(true)
    try {
      await restoreCopy(db, copiesDb, id, today, Date.now())
      toast({ text: `Données revenues au ${label}`, duration: 4000 })
      onRestored()
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : 'Restauration impossible', duration: 5000 })
    } finally {
      setBusy(false)
    }
  }
  const exportCopy = async (id: string, day: string) => {
    const data = await copyData(copiesDb, id)
    if (data) await saveTextFile(`ma-journee-copie-${day}.json`, data)
  }

  return (
    <Field label="Copies automatiques">
      <p className="text-sm text-muted">
        Chaque jour, l'app garde une copie de tes données. Cette semaine : une par jour ; les semaines passées : la dernière de
        chaque semaine. Elles restent sur ce téléphone.
      </p>
      {copies.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Aucune copie pour l'instant : la première se fera à ta prochaine ouverture.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line">
          {shown.map((c) => {
            const label = dayLabel(c.day, today).toLowerCase() === "aujourd'hui" ? "aujourd'hui" : dayShort(c.day)
            return (
              <li key={c.id} className="flex items-center gap-2 px-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium">
                    {dayLabel(c.day, today)} <span className="text-xs font-normal tabular text-muted">{timeOfDay(c.createdAt)}</span>
                  </span>
                  {c.kind === 'beforeRestore' && <span className="block text-xs text-warn">état avant une restauration</span>}
                </span>
                <button type="button" className={btnGhost} disabled={busy} onClick={() => void exportCopy(c.id, c.day)} aria-label="Exporter cette copie">
                  <Icon name="inbox" className="size-4" />
                </button>
                <button type="button" className={btnSoft} disabled={busy} onClick={() => void restore(c.id, label)}>
                  Restaurer
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {copies.length > 7 && (
        <button type="button" className="mt-2 text-sm font-medium text-accent" onClick={() => setAll(!all)}>
          {all ? 'Voir moins' : `Voir les ${copies.length} copies`}
        </button>
      )}
    </Field>
  )
}
