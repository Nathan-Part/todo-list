import Dexie, { type EntityTable } from 'dexie'
import type { AppDB } from '../db'
import { exportData, importData } from './backup'
import { startOfWeek } from './dates'
import type { DayKey } from './types'

/**
 * Le « tiroir » : des copies automatiques de toutes les données, rangées à part
 * (elles ne font pas partie de l'export et ne se copient pas elles-mêmes).
 *
 * Règle : une copie le premier jour d'ouverture de chaque journée, dès qu'il existe une tâche.
 * Semaine en cours (lundi → dimanche) : on garde tous les jours.
 * Semaines passées : on ne garde que la dernière copie de chaque semaine.
 */
export interface Copy {
  id: string
  /** Jour de la copie. */
  day: DayKey
  createdAt: number
  /** daily = copie du jour ; beforeRestore = état juste avant une restauration. */
  kind: 'daily' | 'beforeRestore'
  data: string
}

export class CopiesDB extends Dexie {
  copies!: EntityTable<Copy, 'id'>
  constructor(name = 'ma-journee-copies') {
    super(name)
    this.version(1).stores({ copies: 'id, day, kind' })
  }
}

export const copiesDb = new CopiesDB()

/** Copies du jour à supprimer : pour chaque semaine passée, toutes sauf la plus récente. */
export function copiesToPrune(days: DayKey[], today: DayKey): DayKey[] {
  const current = startOfWeek(today)
  const lastOfWeek = new Map<DayKey, DayKey>()
  for (const d of days) {
    const w = startOfWeek(d)
    if (w >= current) continue
    if (!lastOfWeek.has(w) || d > lastOfWeek.get(w)!) lastOfWeek.set(w, d)
  }
  return days.filter((d) => startOfWeek(d) < current && lastOfWeek.get(startOfWeek(d)) !== d)
}

/** Fait la copie du jour si elle n'existe pas encore. Retourne true si une copie vient d'être faite. */
export async function takeDailyCopy(d: AppDB, c: CopiesDB, today: DayKey, nowMs: number): Promise<boolean> {
  // pas de copie tant qu'il n'y a encore aucune tâche
  if ((await d.tasks.count()) === 0) return false
  const id = `daily-${today}`
  if (await c.copies.get(id)) return false
  const data = await exportData(d)
  await c.copies.put({ id, day: today, createdAt: nowMs, kind: 'daily', data })
  await pruneCopies(c, today)
  return true
}

export async function pruneCopies(c: CopiesDB, today: DayKey): Promise<void> {
  const daily = await c.copies.where('kind').equals('daily').toArray()
  const drop = new Set(copiesToPrune(daily.map((x) => x.day), today))
  const ids = daily.filter((x) => drop.has(x.day)).map((x) => x.id)
  // on ne garde que les 3 dernières sauvegardes « avant restauration »
  const before = (await c.copies.where('kind').equals('beforeRestore').toArray()).sort((a, b) => b.createdAt - a.createdAt)
  ids.push(...before.slice(3).map((x) => x.id))
  if (ids.length) await c.copies.bulkDelete(ids)
}

/** Liste des copies, la plus récente d'abord (sans leur contenu). */
export async function listCopies(c: CopiesDB): Promise<Omit<Copy, 'data'>[]> {
  const all = await c.copies.toArray()
  return all
    .map(({ data: _data, ...rest }) => rest)
    .sort((a, b) => b.createdAt - a.createdAt)
}

/** Revient à l'état d'une copie ; l'état actuel est d'abord mis de côté dans le tiroir. */
export async function restoreCopy(d: AppDB, c: CopiesDB, id: string, today: DayKey, nowMs: number): Promise<number> {
  const copy = await c.copies.get(id)
  if (!copy) throw new Error('Copie introuvable.')
  const current = await exportData(d)
  await c.copies.put({ id: `before-${nowMs}`, day: today, createdAt: nowMs, kind: 'beforeRestore', data: current })
  const { rows } = await importData(d, copy.data)
  await pruneCopies(c, today)
  return rows
}

export async function copyData(c: CopiesDB, id: string): Promise<string | undefined> {
  return (await c.copies.get(id))?.data
}
