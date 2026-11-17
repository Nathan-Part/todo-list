/**
 * Historique des versions, affiché depuis le pied de la page Bilan.
 * Règle (voir CLAUDE.md) : à chaque push sur main, ajouter une entrée EN TÊTE de liste,
 * avec le numéro précédent + 0.1 et un court texte sur ce que la mise à jour apporte.
 */
export interface Release {
  version: string
  /** Jour de la mise à jour, AAAA-MM-JJ. */
  date: string
  /** Résumé en une ligne. */
  title: string
  /** Ce qui change pour l'utilisateur, en phrases courtes. */
  changes: string[]
}

export const RELEASES: Release[] = [
  {
    version: '1.7',
    date: '2026-11-17',
    title: 'Correction : anciennes tâches finies sans heures par étape',
    changes: [
      'Pour les tâches découpées terminées avant la version 1.4, les étapes restées sans horaire reprennent le créneau de l\'étape chronométrée : elles sont notées faites en même temps.',
      'Le temps total n\'est pas compté deux fois.',
    ],
  },
  {
    version: '1.6',
    date: '2026-11-17',
    title: 'Correction : toutes les étapes d\'une tâche finie dans le résumé',
    changes: [
      'Quand une tâche découpée est terminée, le résumé du jour liste toutes ses étapes, y compris celles sans horaire (avec « heures ? » pour les ajouter).',
      'Le badge indique « Étape 1 sur 3 » : c\'est la position de l\'étape, pas le nombre d\'étapes faites.',
    ],
  },
  {
    version: '1.5',
    date: '2026-11-17',
    title: 'Historique des versions',
    changes: [
      'Le numéro de version est affiché en bas de la page Bilan.',
      'Un appui dessus ouvre la liste de toutes les versions et de ce que chacune a ajouté.',
    ],
  },
  {
    version: '1.4',
    date: '2026-11-17',
    title: 'Les étapes dans le résumé de la journée',
    changes: [
      'Une étape finie apparaît dans « Ma journée » avec ses heures, même si la tâche entière n\'est pas terminée.',
      'Cocher une étape sans chrono demande de quelle heure à quelle heure tu l\'as faite.',
      'On peut corriger les heures d\'une étape ou la remettre à faire depuis le résumé.',
    ],
  },
  {
    version: '1.3',
    date: '2026-11-17',
    title: 'Chrono par étape, routines facultatives, étapes de routine',
    changes: [
      'Sur une tâche découpée, le chrono montre le temps de l\'étape en cours, plus seulement le total.',
      'Une routine peut être facultative : un jour manqué reste vide, pas rouge.',
      'Les routines peuvent avoir des étapes, chacune avec sa durée.',
    ],
  },
  {
    version: '1.2',
    date: '2026-11-16',
    title: 'Barres de la semaine des routines et imprévus',
    changes: [
      'Les barres des routines montrent la semaine en cours avec le nom des jours, et une couleur « faite en retard ».',
      'Une routine non faite peut être rattrapée d\'un appui sur sa barre.',
      'Un imprévu demande ses heures de début et de fin et se comporte comme une tâche normale.',
    ],
  },
  {
    version: '1.1',
    date: '2026-11-16',
    title: 'Corriger le résumé de la journée',
    changes: [
      'Chaque ligne du résumé peut être modifiée : heures, temps, ou « finalement pas faite ».',
      'Rouvrir une tâche retire le temps saisi au moment de la cocher.',
    ],
  },
  {
    version: '1.0',
    date: '2026-11-16',
    title: 'Trous dans la journée et recherche',
    changes: [
      'Le bilan signale les moments sans rien d\'enregistré et permet de les remplir.',
      'Un résultat de recherche amène directement à la tâche, sur son jour.',
    ],
  },
  {
    version: '0.9',
    date: '2026-11-16',
    title: 'Heures de début et de fin, résumé du jour',
    changes: [
      'Cocher une tâche sans chrono demande de quelle heure à quelle heure tu l\'as faite.',
      'Le bilan affiche « Ma journée » : ce que tu as fait, à quelle heure et combien de temps.',
    ],
  },
  {
    version: '0.8',
    date: '2026-11-15',
    title: 'Analyse du temps réel',
    changes: [
      'Retour immédiat en cochant : temps réel face à l\'estimation.',
      'Statistiques par routine (durée habituelle, régularité, tendance) et précision par catégorie.',
      'L\'app propose d\'ajuster une estimation qui ne colle plus à la réalité.',
    ],
  },
  {
    version: '0.7',
    date: '2026-11-15',
    title: 'Heure fixe',
    changes: ['Une tâche ou une routine peut avoir une heure prévue, signalée « en retard » une fois dépassée.'],
  },
  {
    version: '0.6',
    date: '2026-11-15',
    title: 'Tout se range en glissant',
    changes: [
      'Routines, sous-tâches et tâches de la réserve se réordonnent par glisser-déposer.',
      'Les sous-tâches s\'affichent dans un volet sous chaque tâche ; leur nom et leur durée se modifient.',
    ],
  },
  {
    version: '0.5',
    date: '2026-11-15',
    title: 'Routines archivées et date de fin',
    changes: [
      'Les routines archivées restent visibles et peuvent être réactivées.',
      'Une routine peut avoir une date de fin, avec le nombre de jours restants.',
      'Supprimer une tâche l\'efface complètement.',
    ],
  },
  {
    version: '0.4',
    date: '2026-11-14',
    title: 'Gestes de glissement et durées en heures',
    changes: [
      'Glisser une ligne vers la gauche pour supprimer, reporter ou récupérer, avec annulation.',
      'Les durées se saisissent en heures et minutes.',
      'Le temps disponible par jour devient facultatif.',
    ],
  },
  {
    version: '0.3',
    date: '2026-11-14',
    title: 'Mise en ligne',
    changes: ['L\'application est publiée sur GitHub Pages et s\'installe sur le téléphone.'],
  },
  {
    version: '0.2',
    date: '2026-11-14',
    title: 'Sous-tâches, report et frise',
    changes: [
      'Découper une tâche en sous-tâches.',
      'Glisser une tâche pour la reporter ; frise du temps réel de la journée.',
      'Question « chrono oublié ? » après 3 heures, et rappel de sauvegarde.',
    ],
  },
  {
    version: '0.1',
    date: '2026-11-13',
    title: 'Première version',
    changes: [
      'Vue du jour, réserve, routines, chrono et bilan de la semaine.',
      'Les tâches non terminées partent en réserve au lieu de disparaître.',
      'Fonctionne hors ligne, les données restent sur l\'appareil.',
    ],
  },
]

export const CURRENT_VERSION = RELEASES[0].version
