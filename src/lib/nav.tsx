import { createContext, useContext } from 'react'
import type { DayKey } from '../domain/types'

export type Tab = 'day' | 'reserve' | 'routines' | 'bilan'

export type SheetState =
  | { type: 'add'; plan?: DayKey | 'reserve' }
  | { type: 'task'; taskId: string; entryId?: string }
  | { type: 'occurrence'; entryId: string }
  | { type: 'routine'; routineId: string | 'new' }
  | { type: 'pause'; routineId?: string }
  | { type: 'review' }
  | { type: 'settings' }
  | { type: 'versions' }
  | { type: 'gap'; startAt: number; endAt: number; day?: DayKey }
  | { type: 'dayLine'; entryId: string; sessionId?: string; subtaskId?: string }
  | { type: 'catchUp'; entryId: string }
  | { type: 'hourly'; day: DayKey }
  | {
      type: 'timeEntry'
      entryId: string
      name: string
      estimateMin?: number
      day: DayKey
      /** Étape cochée sans chrono : le temps saisi lui est rattaché. */
      subtaskId?: string
      /** Nom de la tâche ou routine dont l'étape fait partie. */
      parentName?: string
    }
  | null

export interface Nav {
  today: DayKey
  tab: Tab
  setTab: (t: Tab) => void
  selectedDay: DayKey
  setSelectedDay: (d: DayKey) => void
  sheet: SheetState
  setSheet: (s: SheetState) => void
  /** Élément à mettre en évidence dans la liste (tâche ou routine trouvée par la recherche). */
  highlight: string | null
  setHighlight: (id: string | null) => void
  focusEntryId: string | null
  setFocus: (entryId: string | null) => void
}

export const NavContext = createContext<Nav>(null as unknown as Nav)

export const useNav = () => useContext(NavContext)
