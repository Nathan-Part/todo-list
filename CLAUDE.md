# Ma journée — règles du projet

## Historique des versions (obligatoire à chaque push sur `main`)

L'application affiche son numéro de version en bas de la page Bilan ; un appui ouvre la liste
de toutes les versions et de ce que chacune a apporté. Cette liste vit dans `src/changelog.ts`.

À **chaque push sur `main`**, avant de pousser :

1. Ajouter une entrée **en tête** de `RELEASES` dans `src/changelog.ts`.
2. Numéro = version précédente **+ 0.1** (0.1, 0.2 … 0.9, 1.0, 1.1 …). Toujours un seul chiffre après le point,
   jamais de saut, jamais de réutilisation d'un numéro.
3. `date` = jour du push (AAAA-MM-JJ), `title` = résumé en une ligne, `changes` = 1 à 4 phrases courtes.
4. Écrire **en français, pour l'utilisateur** : ce qu'il peut faire de nouveau ou ce qui change pour lui,
   pas le détail technique (pas de noms de fichiers ni de fonctions).
5. Un push = une version, même s'il contient plusieurs commits. Une correction seule compte aussi
   (titre du type « Correction : … »).
6. Ne jamais modifier ni supprimer les entrées déjà publiées.

`src/changelog.test.ts` vérifie la suite des numéros : `npm test` doit passer.

## Avant de pousser

- `npm run typecheck`, `npm test` et `npm run build` doivent passer.
- Interface, commentaires et textes de l'historique en français.
