import { diffDays, weekdayIndex } from './dates'
import type { DayKey, Frequency, Pause, Routine } from './types'

/** La fréquence de la routine tombe-t-elle ce jour-là (hors pauses) ? */
export function isRoutineScheduledOn(r: Routine, day: DayKey): boolean {
  if (day < r.startDate) return false
  if (r.endDate && day > r.endDate) return false
  const f = r.frequency
  switch (f.type) {
    case 'daily':
      return true
    case 'weekdays':
      return f.weekdays.includes(weekdayIndex(day))
    case 'interval':
      return f.intervalDays > 0 && diffDays(day, r.startDate) % f.intervalDays === 0
  }
}

export function isPaused(pauses: Pause[], routineId: string, day: DayKey): boolean {
  return pauses.some(
    (p) =>
      (p.routineId === undefined || p.routineId === routineId) &&
      p.fromDate <= day &&
      (p.toDate === undefined || day <= p.toDate),
  )
}

const DAY_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

export function frequencyLabel(f: Frequency): string {
  switch (f.type) {
    case 'daily':
      return 'Tous les jours'
    case 'weekdays': {
      const days = [...f.weekdays].sort((a, b) => a - b)
      if (days.length === 7) return 'Tous les jours'
      if (days.length === 1) return `Chaque ${DAY_LONG[days[0]]}`
      return days.map((d) => DAY_SHORT[d]).join(' · ')
    }
    case 'interval':
      return f.intervalDays === 1 ? 'Tous les jours' : `Tous les ${f.intervalDays} jours`
  }
}

const DAY_LONG = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']
