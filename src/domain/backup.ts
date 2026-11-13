import type { AppDB } from '../db'

const APP = 'ma-journee'
const VERSION = 1

/** Toutes les données dans un fichier JSON lisible : ta seconde sécurité. */
export async function exportData(d: AppDB): Promise<string> {
  const tables: Record<string, unknown[]> = {}
  for (const t of d.tables) tables[t.name] = await t.toArray()
  return JSON.stringify({ app: APP, version: VERSION, exportedAt: new Date().toISOString(), tables }, null, 1)
}

/** Remplace toutes les données locales par celles du fichier. Tout ou rien. */
export async function importData(d: AppDB, json: string): Promise<{ rows: number }> {
  let data: { app?: string; version?: number; tables?: Record<string, unknown[]> }
  try {
    data = JSON.parse(json)
  } catch {
    throw new Error("Ce fichier n'est pas un JSON valide.")
  }
  if (data.app !== APP || !data.tables || typeof data.tables !== 'object') {
    throw new Error("Ce fichier n'est pas une sauvegarde de l'application.")
  }
  if (data.version !== VERSION) throw new Error('Version de sauvegarde non prise en charge.')
  const names = new Set(d.tables.map((t) => t.name))
  for (const [name, rows] of Object.entries(data.tables)) {
    if (!names.has(name) || !Array.isArray(rows)) throw new Error(`Table inconnue ou invalide : ${name}`)
  }
  let rows = 0
  await d.transaction('rw', d.tables, async () => {
    for (const t of d.tables) {
      await t.clear()
      const list = data.tables![t.name] ?? []
      if (list.length) await t.bulkAdd(list as never[])
      rows += list.length
    }
  })
  return { rows }
}
