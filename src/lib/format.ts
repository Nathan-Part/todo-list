import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { type DayKey, diffDays, parseDayKey } from '../domain/dates'

/** 20 → « 20 min », 90 → « 1 h 30 », 120 → « 2 h ». */
export function formatMin(min: number): string {
  const m = Math.round(min)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r === 0 ? `${h} h` : `${h} h ${String(r).padStart(2, '0')}`
}

/** Durée en secondes arrondie à la minute (au moins 1 min si > 0). */
export function formatSec(sec: number): string {
  if (sec <= 0) return '0 min'
  return formatMin(Math.max(1, Math.round(sec / 60)))
}

/** Forme compacte pour la bande semaine : 90 → « 1h30 », 180 → « 3h ». */
export function formatCompact(min: number): string {
  if (min <= 0) return '–'
  const m = Math.round(min)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r === 0 ? `${h}h` : `${h}h${String(r).padStart(2, '0')}`
}

/** Chrono : 12:04 ou 1:02:03. */
export function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(r).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** « Vendredi 13 novembre » */
export function dayTitle(k: DayKey): string {
  return cap(format(parseDayKey(k), 'EEEE d MMMM', { locale: fr }))
}

/** « ven. 13 nov. » */
export function dayShort(k: DayKey): string {
  return format(parseDayKey(k), 'EEE d MMM', { locale: fr })
}

/** « Aujourd'hui », « Demain », « Hier », sinon « ven. 13 nov. ». */
export function dayLabel(k: DayKey, today: DayKey): string {
  const diff = diffDays(k, today)
  if (diff === 0) return "Aujourd'hui"
  if (diff === 1) return 'Demain'
  if (diff === -1) return 'Hier'
  return dayShort(k)
}

export function weekdayLetter(k: DayKey): string {
  return format(parseDayKey(k), 'EEEEE', { locale: fr }).toUpperCase()
}

export function dayNumber(k: DayKey): string {
  return String(parseDayKey(k).getDate())
}

export function timeOfDay(ms: number): string {
  return format(new Date(ms), 'HH:mm')
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n > 1 ? many : one}`
}
