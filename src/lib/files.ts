/** Enregistre un fichier texte : feuille de partage sur iPhone (« Enregistrer dans Fichiers »), sinon téléchargement. */
export async function saveTextFile(filename: string, text: string, mime = 'application/json'): Promise<void> {
  const file = new File([text], filename, { type: mime })
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (nav.canShare?.({ files: [file] }) && nav.share) {
    try {
      await nav.share({ files: [file], title: filename })
      return
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      // sinon, repli sur le téléchargement
    }
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

export function readTextFile(file: File): Promise<string> {
  return file.text()
}
