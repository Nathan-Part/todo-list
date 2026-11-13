# Ma journée

Application personnelle (PWA pour iPhone) qui réunit tâches, routines et suivi du temps autour d'une seule unité : la journée.
Cahier des charges : [`docs/cahier-des-charges.md`](docs/cahier-des-charges.md).

## Commandes

```bash
npm install
npm run dev        # serveur de développement
npm test           # règles métier (bascule de minuit, reports, routines, chrono…)
npm run typecheck
npm run build      # produit dist/
```

Les données restent sur l'appareil (IndexedDB) : aucun compte, aucun serveur, l'app fonctionne hors ligne.

## Fait

- Vue **Jour** : bande semaine avec la charge de chaque jour, chiffres clés, liste à ordre manuel (appui long puis glisser), jours passés en mode bilan.
- **Tâches** : ajout rapide, fiche (durée, catégorie, échéance, note, temps, parcours), report, suppression qui conserve le temps passé, tâche imprévue.
- **Réserve** et **revue** des tâches « à replanifier » : rien ne disparaît tout seul.
- **Routines** : tous les jours, jours choisis, tous les N jours ; pause, saut, déplacement d'une occurrence, régularité, calibrage des estimations.
- **Bascule de minuit** sans doublon ; question au retour après plusieurs jours d'absence.
- **Chrono** (un seul actif) avec écran focus et mini-lecteur.
- **Bilan** hebdomadaire, recherche, réglages (capacité par jour, catégories), export et import des données.

## Pas encore fait

- Sous-tâches (avec durée et chrono propres).
- Frise du temps réel dans la journée.
- Glisser une ligne pour la reporter (aujourd'hui : via la fiche).
- Sauvegarde automatique chiffrée (abandonnée pour l'instant : l'export manuel la remplace).
- Notifications.

## Mise en ligne sur OVH

1. Dans l'espace client OVH : rattacher le nom de domaine à l'hébergement, activer le certificat SSL gratuit, activer le SFTP.
2. Dans GitHub, **Settings → Secrets and variables → Actions** : créer les secrets `SFTP_HOST`, `SFTP_USER`, `SFTP_PASSWORD` (sans virgule) et `SFTP_DIR` (dossier du site, par exemple `www`), puis la variable `DEPLOY_ENABLED` = `true`.
3. Fusionner la branche dans `main` : le déploiement (`.github/workflows/deploy.yml`) s'exécute seul. À tester au premier envoi.

## Installer sur l'iPhone

Ouvrir l'adresse dans Safari, **Partager → Sur l'écran d'accueil**, puis lancer l'app depuis l'icône (les données de l'app installée sont séparées de celles de Safari).
