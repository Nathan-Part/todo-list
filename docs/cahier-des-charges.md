# Cahier des charges — Todo & gestion du temps (PWA personnelle)

| | |
|---|---|
| **Version** | 1.0 du 13 novembre 2026 |
| **Statut** | Issu du cadrage ; à relire et valider avant tout développement |
| **Périmètre** | Version 1 complète, puis évolutions futures |

Les règles suivies de la mention *(à confirmer)* sont des propositions posées pour combler un vide : elles n'ont pas été tranchées pendant le cadrage. Elles sont récapitulées en [section 15](#15-points-à-confirmer).

## Sommaire

1. [Résumé](#1-résumé)
2. [Contexte et contraintes](#2-contexte-et-contraintes)
3. [Décisions validées](#3-décisions-validées)
4. [Glossaire](#4-glossaire)
5. [Fonctionnalités de la V1](#5-fonctionnalités-de-la-v1)
6. [Règles métier](#6-règles-métier)
7. [Écrans](#7-écrans)
8. [Parcours utilisateurs](#8-parcours-utilisateurs)
9. [Modèle de données](#9-modèle-de-données)
10. [Architecture et choix techniques](#10-architecture-et-choix-techniques)
11. [Sauvegarde, sécurité et confidentialité](#11-sauvegarde-sécurité-et-confidentialité)
12. [Priorités de développement](#12-priorités-de-développement)
13. [Évolutions futures](#13-évolutions-futures)
14. [Risques et points à vérifier](#14-risques-et-points-à-vérifier)
15. [Points à confirmer](#15-points-à-confirmer)
16. [Ce dont j'ai besoin de ta part](#16-ce-dont-jai-besoin-de-ta-part)

---

## 1. Résumé

Une application personnelle, installée sur iPhone, qui réunit une todo list, un suivi de routines et un suivi du temps autour d'une seule unité : **la journée**.

Elle doit résoudre trois problèmes, dans cet ordre :

1. **Les journées surchargées** : prévoir plus que ce qui tient réellement dans une journée.
2. **Les routines irrégulières** : ne pas tenir ses tâches récurrentes dans la durée.
3. **Les tâches qui traînent** : des tâches oubliées ou repoussées sans décision.

Mieux connaître son temps n'est pas un objectif en soi. Le chrono est pourtant conservé, parce que c'est le temps réel qui corrige les estimations, donc les journées surchargées.

### Principes directeurs

| # | Principe | Conséquence |
|---|---|---|
| 1 | Rien ne disparaît tout seul | Une tâche non terminée reste quelque part (la réserve) jusqu'à ce que tu décides de son sort. |
| 2 | Aucun report silencieux | L'app ne change jamais le jour d'une tâche à ta place. |
| 3 | L'historique est fidèle | Chaque jour garde la trace de ce qui était prévu et de ce qui s'est passé ; un report ne l'efface pas. |
| 4 | Zéro doublon | Une routine ne peut pas apparaître deux fois le même jour ; une tâche terminée ne revient pas. |
| 5 | Un geste | Ajouter, cocher, lancer le chrono, reporter : un seul geste depuis la vue du jour. |
| 6 | Rien à administrer | Pas de compte, pas de serveur à surveiller ; l'app fonctionne sans réseau. |

---

## 2. Contexte et contraintes

| Sujet | Donnée |
|---|---|
| Utilisateur | Une seule personne, usage strictement personnel |
| Appareil | iPhone uniquement, app installée sur l'écran d'accueil ; pas d'usage sur ordinateur |
| Volume | Moins de 8 éléments par jour (routines et tâches confondues) |
| Langue | Français |
| Développement | Réalisé par Claude ; tu pilotes et tu n'as pas à toucher au code |
| Hébergement | OVH mutualisé, offre Starter ; un nom de domaine entier dédié à l'app |
| Code | Dépôt GitHub privé `Nathan-Part/todo-list` |
| Budget | 0 € au-delà de l'hébergement OVH existant |
| Notifications | Aucune en V1 |

---

## 3. Décisions validées

### Journée et tâches

| Sujet | Décision |
|---|---|
| Fin de journée | Minuit pile, heure du téléphone |
| Tâche ponctuelle non terminée | Elle quitte la journée et part dans la **réserve**, marquée « à replanifier » |
| Information au changement de jour | Revue **proposée** par un bandeau, jamais imposée |
| Réserve | Une seule liste, qui accueille aussi les tâches créées sans date |
| Échéance | Date limite facultative sur les tâches ponctuelles, distincte du jour prévu |
| Ne plus faire une tâche | Suppression ; le temps déjà enregistré dessus reste dans l'historique |
| Sous-tâches | De vraies sous-tâches (durée et chrono propres), sur le même jour que leur tâche parente, pour les tâches ponctuelles uniquement |

### Routines

| Sujet | Décision |
|---|---|
| Routine non faite | Archivée « non faite » ; le lendemain repart avec la sienne, sans accumulation |
| Fréquences | Tous les jours ; jours de la semaine choisis ; tous les N jours |
| Calcul de « tous les N jours » | Calendrier fixe depuis la date de début, que la routine ait été faite ou non |
| Répétition dans la journée | Une fois par jour au maximum |
| Déplacer une occurrence | Possible à la main (le ménage du samedi fait le dimanche) |
| Absence de plusieurs jours | L'app demande au retour : « non faites » ou « pause » |

### Temps

| Sujet | Décision |
|---|---|
| Temps réel | Chrono dès la V1 (un seul actif, pause et reprise) + correction manuelle |
| Tâche cochée sans chrono | Proposition discrète de la durée réelle, que l'on peut ignorer |
| Heures précises | Aucune : une liste ordonnée, pas d'agenda |
| Durée estimée | Facultative, saisie par raccourcis |
| Journée surchargée | Capacité fixée par jour de la semaine ; alerte quand la charge la dépasse |

### Organisation et interface

| Sujet | Décision |
|---|---|
| Priorité | Ordre manuel seul (pas d'étoile, pas de niveaux) |
| Classement | Catégories simples : une catégorie facultative par élément, avec une couleur |
| Rappels | Aucun en V1 |
| Écran d'accueil | La journée elle-même, avec les chiffres clés en tête |
| Liste du jour | Une seule liste mêlant routines et tâches |
| Journées passées | Consultées depuis la vue Jour ; l'onglet Bilan sert aux synthèses et à la recherche |

### Périmètre de la V1

| Retenu en V1 | Repoussé à plus tard |
|---|---|
| Bande semaine avec charge | Série en cours (jours consécutifs) |
| Calibrage des estimations | Alerte « tâches dormantes » |
| Écran focus | Statut « abandonnée » (remplacé par la suppression) |
| Tâche imprévue | Notifications |
| Taux de régularité des routines | |
| Pause et saut volontaire | |
| Ancienneté visible en réserve | |
| Sous-tâches | |
| Note libre | |
| Bilan hebdomadaire | |
| Frise du temps réel | |
| Recherche | |

Le découpage retenu est **tout en V1** : une seule version, construite par jalons successifs ([section 12](#12-priorités-de-développement)).

### Technique

| Sujet | Décision |
|---|---|
| Données | Sur l'iPhone, avec sauvegarde automatique chiffrée sur l'hébergement OVH ; l'export manuel reste disponible |
| Déploiement | Automatique à chaque version validée dans le dépôt GitHub |
| Adresse | Le nom de domaine entier, dédié à l'app |

---

## 4. Glossaire

| Terme | Définition |
|---|---|
| **Journée** | Un jour de calendrier, de 00 h 00 à 23 h 59, à l'heure du téléphone. |
| **Tâche ponctuelle** | Une chose à faire une seule fois. Elle est soit prévue un jour, soit en réserve. |
| **Routine** | Une règle de répétition (« Sport, lundi-mercredi-vendredi, 1 h »). |
| **Occurrence** | L'apparition d'une routine sur un jour donné. |
| **Élément** | Une ligne de la liste du jour : une tâche ponctuelle ou une occurrence. |
| **Passage** | La présence d'un élément sur un jour, avec son issue. C'est la brique de l'historique. |
| **Issue** | Ce qu'il est advenu d'un passage : fait, non terminé, reporté, non fait, sauté. |
| **Réserve** | La liste des tâches ponctuelles à faire qui n'ont pas de jour prévu. |
| **À replanifier** | Marqueur d'une tâche arrivée en réserve par le changement de jour et pas encore triée. |
| **Sous-tâche** | Une étape d'une tâche ponctuelle, avec sa durée estimée et son chrono. |
| **Session** | Un intervalle de temps enregistré sur un élément (chrono ou saisie manuelle). |
| **Durée estimée / temps réel** | Ce que tu prévois / la somme des sessions. |
| **Capacité** | Le temps dont tu disposes un jour de la semaine donné. |
| **Charge** | La somme des durées estimées des éléments prévus un jour. |
| **Bascule** | Le traitement qui clôt les journées écoulées. |
| **Échéance** | Date limite facultative d'une tâche ponctuelle. |
| **Imprévu** | Une tâche non prévue, enregistrée après coup. |

---

## 5. Fonctionnalités de la V1

Le jalon renvoie à l'ordre de construction décrit en [section 12](#12-priorités-de-développement).

| Domaine | Fonctionnalité | Jalon |
|---|---|---|
| Journée | Vue du jour : liste unique, ordre manuel par glisser-déposer | 1 |
| Journée | Navigation entre les jours (bande semaine, glissement) | 1 |
| Journée | Chiffres clés en tête : progression, reste estimé, temps passé, charge | 1 puis 4 |
| Journée | Bascule de minuit sans doublon ni perte | 1 |
| Tâches | Ajout rapide (nom, durée, jour, catégorie) | 1 |
| Tâches | Fiche détaillée : jour prévu, échéance, catégorie, note, temps, parcours | 1 |
| Tâches | Report manuel : demain, autre jour, réserve | 1 |
| Tâches | Suppression avec conservation du temps passé | 1 |
| Tâches | Sous-tâches avec durée et chrono propres | 4 |
| Tâches | Tâche imprévue enregistrée après coup | 4 |
| Réserve | Liste unique, ancienneté et nombre de reports visibles | 1 |
| Réserve | Bandeau et revue des tâches à replanifier, échéances proches signalées | 1 |
| Organisation | Catégories avec couleur, note libre | 1 |
| Routines | Création : quotidienne, jours choisis, tous les N jours | 2 |
| Routines | Génération automatique, archivage « non faite » | 2 |
| Routines | Déplacer une occurrence, sauter une occurrence | 2 |
| Routines | Pause d'une routine ou de toutes | 2 |
| Routines | Retour d'absence : « non faites » ou « pause » | 2 |
| Routines | Taux de régularité sur 7 et 30 jours, mini-calendrier | 5 |
| Temps | Durée estimée par raccourcis | 4 |
| Temps | Capacité par jour de semaine, jauge de charge, alerte de surcharge | 4 |
| Temps | Bande semaine avec la charge de chaque jour | 4 |
| Temps | Chrono : démarrer, mettre en pause, reprendre, terminer | 4 |
| Temps | Proposition discrète de durée réelle à la validation | 4 |
| Temps | Ajout et correction manuels des sessions | 4 |
| Temps | Écran focus et mini-lecteur du chrono | 4 |
| Temps | Calibrage : suggestion d'ajuster l'estimation d'une routine | 5 |
| Historique | Jours passés en mode bilan, corrections manuelles | 5 |
| Historique | Frise du temps réel de la journée | 5 |
| Historique | Bilan hebdomadaire | 5 |
| Historique | Recherche par nom | 5 |
| Données | Export et import manuels d'un fichier | 1 |
| Données | Sauvegarde automatique chiffrée et restauration | 3 |
| Application | Installation sur l'écran d'accueil, fonctionnement hors ligne | 0 |
| Application | Premier lancement guidé, thème clair et sombre | 6 |

---

## 6. Règles métier

### 6.1 Journée et bascule

- **RG-01** — Une journée va de 00 h 00 à 23 h 59, à l'heure locale du téléphone.
- **RG-02** — La bascule clôt les journées écoulées. Elle s'exécute à l'ouverture de l'app, à son retour au premier plan, et à minuit si l'app est ouverte. Elle traite chaque jour écoulé une seule fois, dans l'ordre chronologique.
- **RG-03** — À la bascule d'un jour J :
  - chaque **tâche ponctuelle** encore à faire reçoit l'issue « non terminée » pour J et part en réserve, marquée « à replanifier » ;
  - chaque **occurrence de routine** encore à faire reçoit l'issue « non faite » pour J et ne s'accumule pas ;
  - les éléments faits, reportés ou sautés ne changent pas.
- **RG-04** — Exception du chrono : un élément dont le chrono tourne à minuit reste sur sa journée tant que le chrono n'est pas arrêté. RG-03 s'applique à l'arrêt. Toute la session est comptée sur la journée de départ. *(à confirmer)*
- **RG-05** — Une nouvelle journée contient les occurrences des routines prévues ce jour-là et les tâches ponctuelles que tu y avais planifiées. Rien d'autre n'y est ajouté.
- **RG-06** — Le seul mouvement automatique d'une tâche est son départ en réserve (RG-03). Aucune tâche n'est jamais placée sur un jour sans action de ta part.
- **RG-07** — Absence : si au moins 2 journées entières se sont écoulées sans ouverture de l'app, l'app demande au retour comment compter les routines de ces journées : « non faites », ou « en pause » (exclues des statistiques). Pour une seule journée sans ouverture, elles sont « non faites ». Les tâches ponctuelles planifiées sur ces journées partent en réserve. *(seuil à confirmer)*

### 6.2 Tâches ponctuelles

- **RG-10** — Seul le nom est obligatoire. Durée estimée, catégorie, échéance, note et sous-tâches sont facultatives.
- **RG-11** — Une tâche se crée pour aujourd'hui (par défaut), pour un autre jour, ou sans date (en réserve).
- **RG-12** — Une tâche ponctuelle n'est jamais recréée automatiquement.
- **RG-13** — Report manuel, à tout moment, vers demain, un jour choisi ou la réserve :
  - si la tâche était prévue **aujourd'hui**, la journée en garde la trace (« reportée au … ») ;
  - si elle était prévue un **jour futur**, c'est un simple changement de date, sans trace sur ce jour.
- **RG-14** — Cocher une tâche l'enregistre comme faite **aujourd'hui**, d'où qu'on la coche (jour, réserve, jour futur). Jour prévu et jour réel sont conservés séparément.
- **RG-15** — Une tâche faite peut être rouverte. Rouverte le jour même, elle revient dans la liste du jour ; rouverte plus tard, elle va en réserve. *(à confirmer)*
- **RG-16** — L'échéance n'entraîne aucune planification automatique. Elle sert uniquement aux signalements (RG-22).
- **RG-17** — Tâche imprévue : enregistrée après coup comme déjà faite aujourd'hui, avec sa durée. Elle compte dans le temps passé, pas dans la charge prévue ni dans la progression.

### 6.3 Réserve et revue

- **RG-20** — La réserve contient toutes les tâches ponctuelles à faire sans jour prévu : celles créées sans date, celles renvoyées par la bascule, celles que tu y envoies à la main.
- **RG-21** — Chaque tâche en réserve affiche depuis quand elle y est, combien de fois elle a été reportée ou non terminée, et son échéance éventuelle.
- **RG-22** — Tant que des tâches « à replanifier » existent, un bandeau s'affiche en haut de la vue Jour (« 2 tâches d'hier à replanifier »). Il signale aussi les échéances à 3 jours ou moins et les échéances dépassées. Il peut être ignoré et ne bloque jamais l'accès à la journée.
- **RG-23** — Dans la revue, chaque tâche se traite en un geste : *Aujourd'hui · Demain · Autre jour · Garder en réserve · Déjà faite · Supprimer*. Tout choix retire le marqueur « à replanifier ».
- **RG-24** — Tri de la réserve : tâches à replanifier d'abord, puis échéance la plus proche, puis ancienneté en réserve. *(à confirmer)*

### 6.4 Routines

- **RG-30** — Une routine a un nom, une fréquence et une date de début. Durée estimée, catégorie, note et date de fin sont facultatives.
- **RG-31** — Fréquences : tous les jours ; jours de la semaine choisis (un seul jour coché = hebdomadaire) ; tous les N jours.
- **RG-32** — « Tous les N jours » suit un calendrier fixe compté depuis la date de début, que les occurrences aient été faites ou non.
- **RG-33** — Une routine produit au plus une occurrence par jour.
- **RG-34** — Une occurrence non faite en fin de journée est archivée « non faite » (RG-03).
- **RG-35** — Déplacer une occurrence : vers aujourd'hui ou un jour futur où la routine n'a pas déjà d'occurrence. Le jour d'origine garde la trace « reportée au … ». Non faite le jour d'arrivée, elle devient « non faite ». Une occurrence ne va jamais en réserve. Conséquence : une routine quotidienne ne se déplace pas. *(à confirmer)*
- **RG-36** — Sauter une occurrence lui donne l'issue « sautée », exclue des statistiques.
- **RG-37** — Pause : une routine, ou toutes à la fois, peut être suspendue d'une date à une autre, ou jusqu'à reprise manuelle. Aucune occurrence n'est créée pendant la pause, et ces jours sont exclus des statistiques.
- **RG-38** — Modifier une routine s'applique à partir d'aujourd'hui, y compris à l'occurrence du jour si elle n'est pas commencée. Les jours passés ne changent jamais.
- **RG-39** — Supprimer une routine l'archive : plus aucune occurrence n'est créée, tout son historique est conservé.
- **RG-40** — Les routines n'ont ni sous-tâches ni échéance.
- **RG-41** — Une routine garde d'un jour à l'autre la place que tu lui as donnée en dernier dans la liste.

### 6.5 Sous-tâches

- **RG-50** — Réservées aux tâches ponctuelles. Chaque sous-tâche a un nom, une durée estimée facultative, son propre chrono et son état (à faire, faite).
- **RG-51** — Les sous-tâches vivent dans leur tâche parente et suivent son jour ; elles n'ont pas de date propre.
- **RG-52** — Dès qu'une tâche a des sous-tâches, sa durée estimée est la somme de celles de ses sous-tâches, et son temps réel la somme de leurs temps (plus le temps éventuellement enregistré sur la tâche avant sa découpe).
- **RG-53** — Le chrono se lance sur une sous-tâche. Lancé depuis la tâche parente, il démarre la première sous-tâche à faire.
- **RG-54** — Cocher la dernière sous-tâche termine la tâche. Cocher la tâche parente termine toutes ses sous-tâches restantes, après confirmation. *(à confirmer)*
- **RG-55** — À la bascule, une tâche partiellement faite part en réserve avec ses sous-tâches restantes. Les sous-tâches faites restent acquises et figurent dans le bilan du jour où elles ont été faites.

### 6.6 Temps

- **RG-60** — La durée estimée se saisit par raccourcis (15, 30, 45 min, 1 h, 1 h 30, 2 h) ou par valeur libre. Un élément sans durée est signalé et compte pour zéro dans la charge.
- **RG-61** — Un seul chrono actif à la fois. En lancer un autre met le précédent en pause.
- **RG-62** — Une pause termine une session ; une reprise en ouvre une nouvelle. Le temps réel d'un élément est la somme de ses sessions. Son heure de début est celle de la première session, son heure de fin celle de la dernière.
- **RG-63** — Le chrono est calculé à partir de l'heure de départ enregistrée, pas d'un décompte : il reste juste si l'app est fermée ou l'iPhone verrouillé.
- **RG-64** — Cocher un élément dont le chrono tourne arrête le chrono.
- **RG-65** — Cocher un élément sans aucun temps enregistré affiche quelques secondes « Durée réelle : *estimation* ? OK / Modifier ». OK enregistre cette durée ; ignorer laisse l'élément sans temps réel. Sans estimation, le bandeau propose seulement « Ajouter une durée ».
- **RG-66** — On peut ajouter, modifier ou supprimer une session (durée seule, ou heures de début et de fin) depuis la fiche de l'élément, y compris pour un jour passé.
- **RG-67** — Chrono oublié : si un chrono tourne depuis plus de 3 heures ou depuis la veille, l'app demande à la réouverture de confirmer ou de corriger l'heure de fin. *(à confirmer)*
- **RG-68** — Calibrage : pour une routine comptant au moins 5 réalisations chronométrées, si le temps réel moyen des 10 dernières s'écarte de plus de 20 % de l'estimation, sa fiche propose d'ajuster l'estimation. L'ajustement ne vaut que pour l'avenir. *(seuils à confirmer)*

### 6.7 Charge et capacité

- **RG-70** — La capacité est un temps disponible fixé pour chaque jour de la semaine (7 valeurs), modifiable dans les réglages.
- **RG-71** — La charge d'un jour est la somme des durées estimées de tous ses éléments prévus, faits ou non, hors éléments reportés ou sautés et hors imprévus.
- **RG-72** — Quand la charge dépasse la capacité, la jauge du jour et sa case dans la bande semaine passent en alerte, avec le dépassement chiffré. L'app n'empêche rien et ne déplace rien.
- **RG-73** — La charge des jours futurs inclut les occurrences de routines à venir.

### 6.8 Historique et corrections

- **RG-80** — Chaque présence d'un élément sur un jour (un passage) est enregistrée avec son issue : fait, non terminé, reporté (et vers où), non fait, sauté. Reporter crée un nouveau passage sur le jour d'arrivée ; celui du jour de départ reste.
- **RG-81** — À la clôture d'un passage, le nom, la durée estimée et la catégorie de l'élément sont figés pour ce jour. Les modifications ultérieures ne changent pas les bilans passés.
- **RG-82** — Pour chaque tâche, on retrouve : son nom, le ou les jours où elle était prévue, le jour où elle a été faite, ses heures de début et de fin si elle a été chronométrée, son temps réel, et l'issue de chaque jour.
- **RG-83** — Corrections manuelles permises sur un jour passé : marquer « fait ce jour-là » un élément oublié (tâche encore à faire, ou routine non faite), marquer une routine « sautée », corriger les sessions de temps. Aucune correction n'est automatique. *(à confirmer)*

### 6.9 Suppression

- **RG-90** — Supprimer une tâche sans temps enregistré l'efface entièrement.
- **RG-91** — Supprimer une tâche avec du temps enregistré la retire de toutes les listes, mais ses sessions restent dans les bilans des jours concernés, sous son nom, avec la mention « supprimée ».
- **RG-92** — Toute suppression demande confirmation et peut être annulée dans les secondes qui suivent.
- **RG-93** — Une catégorie supprimée est archivée : elle reste affichée sur les éléments passés.

### 6.10 Prévention des doublons

- **RG-100** — Une occurrence est identifiée par le couple (routine, date d'origine). La créer deux fois est impossible, même si la bascule s'exécute plusieurs fois, si l'app est rouverte ou si l'heure du téléphone change.
- **RG-101** — Une tâche a au plus un jour prévu à la fois, et au plus un passage par jour.
- **RG-102** — La bascule est atomique et rejouable : interrompue, elle reprend sans rien dupliquer ni perdre.
- **RG-103** — Un seul chrono actif (RG-61).

### 6.11 Fuseaux horaires et horloge

- **RG-110** — Les jours sont des dates de calendrier à l'heure du téléphone, sans fuseau. Les instants (début et fin de session) sont enregistrés en temps universel.
- **RG-111** — En voyage, la journée suit l'heure affichée par le téléphone. Un changement de fuseau ne crée, ne duplique et ne supprime rien.
- **RG-112** — Si la date du téléphone recule (voyage vers l'ouest, réglage manuel), l'app ne rouvre pas les jours déjà clos ; elle attend que la date rattrape le dernier jour traité. *(à confirmer)*
- **RG-113** — Les changements d'heure été / hiver n'affectent pas les durées.

### 6.12 Indicateurs

| Indicateur | Définition |
|---|---|
| Progression | Éléments faits / éléments prévus du jour (tâches et occurrences ; hors imprévus, reportés, sautés) |
| Charge prévue | Voir RG-71, comparée à la capacité du jour |
| Reste estimé | Pour chaque élément à faire : estimation moins temps déjà passé (minimum zéro) ; somme du tout |
| Temps passé | Somme des sessions du jour, imprévus compris |
| À replanifier | Nombre de tâches en réserve portant ce marqueur |
| Reportées | Éléments du jour ayant l'issue « reporté » |
| Sans durée | Éléments à faire sans estimation |
| Régularité d'une routine | Sur 7 et 30 jours : faites / (faites + non faites) ; sautées, en pause et reportées sont neutres |
| Précision des estimations | Temps réel total / temps estimé total, sur les éléments faits disposant des deux |
| Part d'imprévu | Temps des imprévus / temps passé |

---

## 7. Écrans

### Principes d'interface

- Quatre onglets en bas de l'écran, à portée de pouce : **Jour · Réserve · Routines · Bilan**. Les réglages s'ouvrent depuis l'en-tête de l'onglet Jour.
- Une couleur d'accent ; les catégories n'apparaissent que comme une pastille de couleur.
- Zones tactiles larges, police du système, thème clair ou sombre selon le réglage de l'iPhone.
- Aucune fenêtre bloquante en dehors des confirmations de suppression.

### E1 — Jour (écran d'accueil)

```
Ven. 13 novembre                [réglages]
 L   M   M   J  [V]  S   D
 3h  4h  6h! 3h  4h  1h  -
------------------------------------------
3/7 faites - reste 2 h 10
Charge [########..] 4 h 30 / 5 h
------------------------------------------
! 2 tâches d'hier à replanifier          >
------------------------------------------
[ ] Étudier (R)                  1 h 30  >
[ ] Démarche CAF  2/5            45 min  >
[~] Emails (R)           12:04 / 20 min ||
[ ] Sport (R)                    1 h     >
---------------- Fait ----------------
[x] Courses                28 min (30)
------------------------------------------
+ Ajouter une tâche
------------------------------------------
> Emails - 12:04                        ||
==========================================
  Jour     Réserve     Routines     Bilan
```

Le même écran sert trois situations :

| Jour affiché | Mode | Ce qu'on y fait |
|---|---|---|
| Aujourd'hui | Action | Cocher, lancer le chrono, ordonner, ajouter, reporter |
| Jour futur | Planification | Ajouter, ordonner, déplacer ; les routines à venir sont affichées pour le calcul de la charge |
| Jour passé | Bilan | Lire ce qui s'est passé (issues, temps, frise) ; corriger un oubli |

Gestes sur une ligne :

| Geste | Effet |
|---|---|
| Toucher la case | Terminer l'élément |
| Toucher `>` | Lancer le chrono ; le même bouton sert ensuite à le mettre en pause |
| Toucher la ligne | Ouvrir la fiche |
| Glisser vers la gauche | Demain · Réserve · Autre jour (ou Sauter · Déplacer pour une routine) |
| Appui long puis glisser | Changer l'ordre |

Autres éléments : la bande semaine se fait défiler d'une semaine à l'autre et un toucher sur un jour l'ouvre ; un toucher sur les chiffres clés en déplie le détail (temps estimé total, temps passé, imprévus, éléments sans durée, reportés). Le mini-lecteur du chrono reste visible sur tous les onglets tant qu'un chrono est actif ou en pause.

Un jour passé s'affiche en mode bilan :

```
<  Mer. 11 novembre                      >
------------------------------------------
5/7 faites - 3 h 40 passées / 4 h 10 estimées
Frise  8h ..##..###...#.. 22h
------------------------------------------
[x] Étudier (R)          1 h 42 (1 h 30)
[x] Sport (R)            0 h 55 (1 h)
[x] Emails (R)           0 h 18 (20 min)
[-] Lecture (R)          non faite
[>] Démarche CAF         reportée au ven. 13
[+] Dépannage voisin     35 min (imprévu)
```

La frise situe dans la journée les sessions chronométrées, colorées par catégorie. Les durées saisies sans heure sont listées à part.

### E2 — Ajout rapide

```
Nouvelle tâche
------------------------------------------
[ Nom de la tâche                        ]
Durée   15   30   45   1h   1h30   2h   Autre
Quand   [Aujourd'hui]  Demain  Date  Réserve
Plus    Catégorie - Échéance - Sous-tâches - Note
Répéter Jamais                           >
------------------------------------------
[ Imprévu déjà fait ]           [ Ajouter ]
```

Un nom et un toucher suffisent. « Répéter » transforme la saisie en routine *(à confirmer)*. « Imprévu déjà fait » enregistre la tâche comme faite aujourd'hui avec la durée choisie.

### E3 — Fiche d'une tâche

```
Démarche CAF                       [Fait]
------------------------------------------
Jour prévu       Ven. 13 nov.           >
Échéance         30 nov. (dans 17 j)    >
Catégorie        Admin                  >
Durée estimée    45 min (somme des sous-tâches)
------------------------------------------
Sous-tâches                          2/5
[x] Rassembler les pièces       10 min
[x] Remplir le formulaire       15 min
[ ] Scanner                     10 min  >
[ ] Envoyer                      5 min  >
[ ] Vérifier l'accusé            5 min  >
+ Ajouter une sous-tâche
------------------------------------------
Temps réel                       27 min
  Ven. 13   09:12 - 09:24        12 min
  Ven. 13   09:40 - 09:55        15 min
+ Ajouter du temps
------------------------------------------
Note
Dossier n° 1234567
------------------------------------------
Parcours
  Lun. 9    non terminée -> réserve
  Mer. 11   reportée au ven. 13
  Ven. 13   en cours
------------------------------------------
Reporter :  Demain - Autre jour - Réserve
Supprimer
```

### E4 — Réserve

```
Réserve                          6 tâches
------------------------------------------
À REPLANIFIER
[ ] Démarche CAF                 45 min
    d'hier - reportée 2x - avant le 30
[ ] Appeler la banque            15 min
    d'hier
------------------------------------------
[ ] Déclaration impôts           1 h
    en réserve 12 j - avant le 20 (!)
[ ] Trier les photos             2 h
    en réserve 34 j - reportée 1x
[ ] Lire l'article               sans durée
    en réserve 3 j
------------------------------------------
+ Ajouter à la réserve
```

Glisser une ligne propose *Aujourd'hui · Demain · Autre jour*.

### E5 — Revue

Ouverte depuis le bandeau. Les tâches à replanifier défilent une par une, avec les six choix de RG-23. Le choix d'un autre jour affiche la bande semaine avec la charge de chaque jour, pour placer la tâche là où il reste de la place.

### E6 — Routines

Liste des routines avec, pour chacune : fréquence, durée estimée, régularité sur 30 jours, résultat des 7 dernières occurrences. En tête : « Nouvelle routine » et « Tout mettre en pause ».

### E7 — Fiche d'une routine

```
Sport                           [Modifier]
Lun - Mer - Ven    1 h    Catégorie Sport
------------------------------------------
Régularité     7 j : 2/3     30 j : 9/12 (75 %)
 L  M  M  J  V  S  D
 x  .  x  .  o  .  .       x fait    o non fait
 x  .  -  .  x  .  .       - sauté   p pause
 x  .  x  .  x  .  .       . non prévu
------------------------------------------
Temps réel moyen 1 h 20 (estimé 1 h)
[ Ajuster l'estimation à 1 h 20 ]
------------------------------------------
Mettre en pause - Archiver
```

### E8 — Focus et mini-lecteur

```
                 Étudier
                (routine)

                  47:12
        estimé 1 h 30 - reste 42:48
        [###############.........]

        [ Pause ]        [ Terminer ]

Note : chapitre 4, exercices 1 à 6
```

L'écran focus s'ouvre au lancement d'un chrono et se replie en mini-lecteur. Au-delà de l'estimation, il affiche le dépassement (« + 5 min ») dans une couleur d'alerte. Pour une tâche à sous-tâches, il liste les sous-tâches et permet de passer de l'une à l'autre.

### E9 — Bilan

```
Bilan     <  Semaine du 9 au 15 nov.  >   [recherche]
------------------------------------------
Réalisation            31 / 40   (78 %)
 L ########   M ######..   M #####...   J ...
------------------------------------------
Temps passé            18 h 40
 Études   ############          9 h 10
 Sport    #####                 3 h 05
 Admin    ###                   2 h 00
 Autre    ######                4 h 25
------------------------------------------
Estimations     réel = 118 % de l'estimé
Surcharge       2 jours au-dessus de la capacité
Imprévus        4 tâches - 2 h 15 (12 %)
------------------------------------------
Routines
 Étudier 6/7     Sport 2/3     Emails 7/7
------------------------------------------
Réserve         6 tâches (+3, -2) - la plus ancienne : 34 j
```

La semaine va du lundi au dimanche *(à confirmer)*. La recherche porte sur le nom et la note des tâches et des routines, quel que soit leur état ; un résultat ouvre la fiche correspondante.

### E10 — Réglages

Capacité de chaque jour de la semaine ; catégories (nom, couleur, ordre) ; sauvegarde (état, « Sauvegarder maintenant », « Restaurer », export et import d'un fichier) ; informations de diagnostic (version, date de la dernière sauvegarde, état du stockage).

### E11 — Premier lancement

1. Dans Safari : écran d'installation (« Partager, puis Sur l'écran d'accueil »). La saisie de données n'est proposée qu'une fois l'app installée, car Safari et l'app installée n'ont pas le même espace de stockage.
2. Dans l'app installée : nouvelle installation ou restauration d'une sauvegarde.
3. Capacité de chaque jour de la semaine.
4. Mot de passe de sauvegarde.

---

## 8. Parcours utilisateurs

**P1 — Commencer la journée.** Ouvrir l'app. Le bandeau annonce 2 tâches d'hier à replanifier : l'une va à aujourd'hui, l'autre reste en réserve. La jauge passe au rouge (5 h 40 pour 5 h) : une tâche est glissée vers « Demain ». Les éléments sont rangés dans l'ordre voulu.

**P2 — Ajouter une tâche.** Toucher « Ajouter », saisir le nom, toucher « 30 », valider. Variante : choisir « Réserve », ou ouvrir « Plus » pour une échéance et des sous-tâches.

**P3 — Travailler avec le chrono.** Toucher `>` sur « Étudier » : l'écran focus s'ouvre. Pause au déjeuner, reprise ensuite, puis « Terminer ». La ligne passe dans « Fait » avec 1 h 42 pour 1 h 30 estimée.

**P4 — Cocher sans chrono.** Toucher la case de « Courses ». Le bandeau « Durée réelle : 30 min ? » apparaît ; « OK » l'enregistre, ou on l'ignore.

**P5 — Absorber un imprévu.** Après avoir dépanné un voisin, « Ajouter », nom, « 30 », « Imprévu déjà fait ». La tâche figure dans le temps passé du jour sans fausser la progression.

**P6 — Découper une grosse tâche.** Ouvrir la fiche, ajouter cinq sous-tâches avec leur durée. La durée de la tâche devient leur somme ; le chrono se lance sous-tâche par sous-tâche.

**P7 — Gérer une routine.** Créer « Sport, lundi-mercredi-vendredi, 1 h ». Un mercredi impossible : glisser la ligne, « Déplacer », jeudi. Une semaine de vacances : « Tout mettre en pause » du 20 au 27.

**P8 — Revenir après une absence.** Après quatre jours sans ouvrir l'app, celle-ci demande comment compter les routines de ces jours. Les tâches qui y étaient planifiées attendent en réserve, à replanifier.

**P9 — Relire une journée.** Glisser vers la veille ou toucher un jour dans la bande semaine. Le bilan montre chaque élément avec son issue et son temps. Un oubli se corrige par « Faite ce jour-là ».

**P10 — Faire le point de la semaine.** Onglet Bilan : taux de réalisation, temps par catégorie, précision des estimations, jours en surcharge. La fiche d'une routine propose d'ajuster son estimation.

**P11 — Changer de téléphone.** Installer l'app sur le nouvel iPhone, choisir « Restaurer », saisir le mot de passe de sauvegarde, sélectionner la copie la plus récente.

---

## 9. Modèle de données

### 9.1 Vue d'ensemble

```
Catégorie --< Tâche --< Sous-tâche
    |           |
    |           +--< Passage --< Session
    +--< Routine ----^
            |
            +--< Pause

Réglages (une seule fiche)
```

Trois niveaux distincts portent toute la logique :

| Niveau | Contenu | Exemple |
|---|---|---|
| L'élément | Ce qu'il faut faire | Tâche « Démarche CAF » ; routine « Sport, lun-mer-ven, 1 h » |
| Le passage | Sa présence sur un jour et l'issue de ce jour | « Démarche CAF, lundi 9 : non terminée » |
| La session | Le temps réellement passé | « de 09 h 12 à 09 h 24 » |

C'est cette séparation qui permet de reporter une tâche sans réécrire le passé, et de générer les routines sans doublon. Un passage appartient soit à une tâche, soit à une routine.

### 9.2 Entités

**Tâche**

| Champ | Type | Rôle |
|---|---|---|
| `id` | identifiant | |
| `name` | texte | Nom |
| `categoryId` | référence facultative | Catégorie |
| `estimateMin` | entier facultatif | Durée estimée en minutes ; ignorée si la tâche a des sous-tâches |
| `dueDate` | date facultative | Échéance |
| `note` | texte facultatif | Note libre |
| `status` | `todo`, `done`, `deleted` | État global |
| `needsReview` | booléen | Arrivée en réserve par la bascule, pas encore triée |
| `reserveSince` | date facultative | Date d'entrée en réserve |
| `isUnplanned` | booléen | Tâche imprévue |
| `doneDate` | date facultative | Jour réel de réalisation |
| `createdAt`, `doneAt`, `deletedAt` | instants | |

Le jour prévu d'une tâche n'est pas un champ : c'est la date de son passage ouvert. Sans passage ouvert, la tâche est en réserve.

**Sous-tâche**

| Champ | Type | Rôle |
|---|---|---|
| `id`, `taskId` | identifiant, référence | Tâche parente |
| `name` | texte | Nom |
| `estimateMin` | entier facultatif | Durée estimée |
| `status` | `todo`, `done` | État |
| `doneDate`, `doneAt` | date, instant | Réalisation |
| `position` | ordre | Ordre dans la tâche |

**Routine**

| Champ | Type | Rôle |
|---|---|---|
| `id` | identifiant | |
| `name` | texte | Nom |
| `categoryId`, `estimateMin`, `note` | facultatifs | Comme pour une tâche |
| `frequency.type` | `daily`, `weekdays`, `interval` | Type de fréquence |
| `frequency.weekdays` | liste de jours | Pour `weekdays` |
| `frequency.intervalDays` | entier | Pour `interval` |
| `startDate` | date | Début, et point de départ du calendrier fixe |
| `endDate` | date facultative | Fin |
| `position` | ordre | Place par défaut dans la liste du jour |
| `createdAt`, `archivedAt` | instants | |

**Pause**

| Champ | Type | Rôle |
|---|---|---|
| `id` | identifiant | |
| `routineId` | référence facultative | Vide = toutes les routines |
| `fromDate`, `toDate` | dates | `toDate` vide = jusqu'à reprise |
| `origin` | `manual`, `absence` | Pause décidée, ou choisie au retour d'une absence |

**Passage**

| Champ | Type | Rôle |
|---|---|---|
| `id` | identifiant déterministe | Voir 9.3 |
| `kind` | `task`, `routine` | Nature de l'élément |
| `taskId` ou `routineId` | référence | Élément concerné |
| `date` | date | Jour du passage |
| `scheduledDate` | date (routines) | Date d'origine fixée par la fréquence |
| `status` | `todo`, `done`, `not_done`, `postponed`, `skipped`, `deleted` | Issue |
| `movedTo` | date ou « réserve » | Destination d'un report |
| `position` | ordre | Ordre manuel dans le jour |
| `nameSnapshot`, `estimateMinSnapshot`, `categoryIdSnapshot` | copies | Valeurs figées à la clôture |
| `closedAt` | instant | Clôture |

`not_done` s'affiche « non terminée » pour une tâche et « non faite » pour une routine.

**Session**

| Champ | Type | Rôle |
|---|---|---|
| `id` | identifiant | |
| `entryId` | référence | Passage auquel la session est rattachée |
| `subtaskId` | référence facultative | Sous-tâche chronométrée |
| `date` | date | Jour auquel le temps est compté |
| `startAt`, `endAt` | instants facultatifs | Vides pour une durée saisie sans heure ; `endAt` vide = chrono en cours |
| `durationSec` | entier | Durée |
| `source` | `timer`, `manual`, `quick` | Chrono, saisie manuelle, proposition discrète |

**Catégorie** : `id`, `name`, `color`, `position`, `archivedAt`.

**Réglages** : capacité des 7 jours, dernier jour traité par la bascule, dernier jour d'ouverture, état de la sauvegarde, version du schéma.

### 9.3 Garanties d'intégrité

- L'identifiant d'un passage est calculé, pas tiré au hasard : `t:<tâche>:<jour>` pour une tâche, `r:<routine>:<date d'origine>:<jour>` pour une routine. Créer deux fois le même passage est donc impossible.
- Une tâche a au plus un passage `todo`.
- Une occurrence n'est générée que s'il n'existe aucun passage pour son couple (routine, date d'origine).
- Au plus une session sans `endAt` : un seul chrono actif.
- Les occurrences des jours futurs ne sont pas stockées ; elles sont calculées à l'affichage à partir des routines. Seules les exceptions décidées à l'avance (déplacée, sautée) sont enregistrées.
- Toute opération touchant plusieurs enregistrements (bascule, report, suppression) est une transaction : elle réussit entièrement ou pas du tout.

### 9.4 Origine des informations d'historique demandées

| Information | Source |
|---|---|
| Nom | Tâche ou routine, figé dans le passage à la clôture |
| Jour où elle devait être effectuée | Dates des passages ; le premier donne le jour prévu initial |
| Jour où elle a réellement été effectuée | `doneDate`, soit le passage d'issue « fait » |
| Heures de début et de fin | Première et dernière session chronométrée |
| Temps réellement consacré | Somme des sessions |
| Statut | Issue de chaque passage et état global de la tâche |

---

## 10. Architecture et choix techniques

### 10.1 Vue d'ensemble

```
iPhone - app installée                      OVH Starter - domaine dédié
+-----------------------------+            +------------------------------+
| Interface                   |   HTTPS    | Fichiers de l'app            |
| Règles métier               | <--------- | (HTML, JavaScript, CSS)      |
| Base locale (sur l'iPhone)  |            |                              |
| Service worker (hors ligne) | ---------> | Script de sauvegarde (PHP)   |
+-----------------------------+   copie    | 30 copies chiffrées          |
                                 chiffrée  +------------------------------+
                                                         ^
GitHub (dépôt privé) -- construction et envoi automatiques (SFTP)
```

Toute l'application s'exécute sur l'iPhone. Le serveur ne fait que deux choses : distribuer les fichiers de l'app, et conserver des copies de sauvegarde qu'il est incapable de lire. Il n'y a ni compte utilisateur, ni base de données en ligne.

### 10.2 Choix techniques

| Besoin | Choix | Raison |
|---|---|---|
| Langage | TypeScript | Détecte les erreurs avant l'exécution ; règles métier testables |
| Interface | React + Vite | Outillage le plus répandu, pérenne, facile à reprendre par quiconque |
| Styles | Tailwind CSS | Cohérence visuelle, thèmes clair et sombre |
| Installation et hors ligne | Manifeste + service worker (vite-plugin-pwa) | Icône sur l'écran d'accueil, fonctionnement sans réseau, mises à jour |
| Données locales | IndexedDB via Dexie | Base structurée sur l'appareil, transactions, migrations de schéma |
| Glisser-déposer | dnd-kit | Réordonner au doigt |
| Dates | date-fns | Calculs sur des dates de calendrier locales |
| Graphiques | CSS et SVG écrits à la main | Quelques barres suffisent ; aucune bibliothèque à maintenir |
| Chiffrement | Web Crypto (intégré au navigateur) | Aucun code de cryptographie maison |
| Serveur | Un script PHP, sans base de données | Reçoit et restitue les sauvegardes chiffrées |
| Tests | Vitest pour les règles ; Playwright (moteur WebKit) pour les parcours clés | La fiabilité de la bascule et de l'historique se prouve par des tests |
| Déploiement | GitHub Actions, envoi par SFTP vers OVH | Automatique ; aucun envoi manuel de fichiers |

Solutions écartées : une application native (App Store, compte développeur payant, complexité) ; une base de données en ligne avec compte (inutile pour un seul appareil, et contraire au principe 6) ; un hébergement supplémentaire.

### 10.3 Organisation du code

- Les règles métier (bascule, génération des occurrences, indicateurs) sont des fonctions isolées de l'interface, testées avec une horloge simulée. Les règles de la [section 6](#6-règles-métier) deviennent des tests automatiques.
- Le calcul du « jour courant » est centralisé en un seul endroit, pour qu'une heure de fin de journée réglable reste ajoutable plus tard.
- La branche `main` correspond à la version en ligne. Chaque évolution passe par une branche puis une validation avant d'y arriver.

### 10.4 Spécificités de l'iPhone

| Sujet | Traitement |
|---|---|
| Installation | Depuis Safari, « Sur l'écran d'accueil » ; l'app affiche la marche à suivre |
| Stockage | Une app installée a son propre espace, distinct de Safari, et n'est pas soumise à l'effacement après 7 jours d'inactivité qui touche les sites ouverts dans Safari. L'app demande en plus un stockage persistant |
| Arrière-plan | iOS suspend l'app en arrière-plan : le chrono est donc calculé à partir d'heures enregistrées (RG-63) |
| Changement de jour | Vérifié à chaque retour au premier plan |
| Mises à jour | Un message « Nouvelle version disponible » propose de recharger |
| Écran | Respect des zones sûres (encoche, barre d'accueil), thème clair et sombre |
| Version d'iOS | iOS 17 ou plus récent *(à confirmer selon ton iPhone)* |

### 10.5 Déploiement

1. Une modification est validée sur la branche `main`.
2. GitHub Actions vérifie le code, exécute les tests, construit l'app.
3. Si tout passe, les fichiers sont envoyés sur OVH par SFTP.
4. Au lancement suivant, l'app installée détecte la nouvelle version.

Les identifiants OVH sont enregistrés une fois comme secrets chiffrés du dépôt GitHub. Ils ne figurent jamais dans le code.

---

## 11. Sauvegarde, sécurité et confidentialité

### 11.1 Sauvegarde automatique

| Étape | Fonctionnement |
|---|---|
| Mise en place | Tu choisis un mot de passe de sauvegarde, une seule fois |
| Contenu | Une copie complète des données, compressée puis chiffrée sur l'iPhone |
| Envoi | À la première ouverture de chaque jour, puis lorsque des données ont changé ; une copie par jour, remplacée au fil de la journée |
| Conservation | Les 30 copies quotidiennes les plus récentes, dans un dossier inaccessible depuis le web |
| Hors ligne | L'envoi est retenté à la prochaine connexion |
| Suivi | Les réglages affichent la date de la dernière sauvegarde réussie ; une alerte apparaît au-delà de 3 jours sans succès |
| Restauration | Mot de passe, choix d'une copie, remplacement des données locales après confirmation |

### 11.2 Sécurité

- Le chiffrement a lieu sur l'iPhone. Le serveur ne reçoit que des données illisibles, et le mot de passe ne quitte jamais l'appareil.
- Du mot de passe sont dérivées deux clés distinctes : l'une chiffre les données et reste sur l'iPhone ; l'autre sert de laissez-passer auprès du script de sauvegarde.
- Le script n'accepte que les requêtes portant ce laissez-passer, enregistré lors de la première mise en place.
- **Mot de passe oublié et téléphone perdu : les sauvegardes sont irrécupérables.** L'app le dit clairement à la création du mot de passe. Tant que le téléphone fonctionne, un nouveau mot de passe peut être défini.

### 11.3 Export manuel

Depuis les réglages, un fichier lisible contenant toutes les données peut être enregistré dans Fichiers ou iCloud, et réimporté. Il sert de seconde sécurité et garantit que tes données restent les tiennes, indépendamment de l'app.

### 11.4 Confidentialité

- L'adresse de l'app est publique, mais l'app ne contient aucune donnée : quiconque l'ouvre voit une app vide.
- Aucun compte, aucun outil de mesure d'audience, aucun service tiers.
- Le dépôt GitHub reste privé et ne contient jamais de données personnelles.

---

## 12. Priorités de développement

Tu as choisi de ne pas séparer un MVP : la V1 contient tout ce qui a été retenu. Elle se construit en sept jalons, chacun installable et vérifiable sur l'iPhone, et les données sont conservées d'un jalon à l'autre. Les jalons 0 à 3 jouent le rôle de socle : **l'usage quotidien réel peut commencer à la fin du jalon 3**, quand la sauvegarde automatique est en place. Ce qui dépasse la V1 figure en [section 13](#13-évolutions-futures).

| Jalon | Contenu | Résultat |
|---|---|---|
| **0 — Socle et vérifications** | Squelette du projet ; app installable ; déploiement automatique vers OVH ; essais des points incertains (script PHP sur l'offre Starter, envoi SFTP, persistance du stockage, export de fichier) | Une app vide installée sur l'iPhone, mise à jour automatiquement |
| **1 — La journée** | Vue Jour, liste unique, ordre manuel ; ajout rapide ; fiche ; catégories, note, échéance ; réserve et ancienneté ; reports ; bascule de minuit ; bandeau et revue ; suppression ; navigation entre les jours ; export et import manuels | Une todo quotidienne utilisable |
| **2 — Les routines** | Création (trois fréquences) ; génération sans doublon ; « non faite » ; déplacer ; sauter ; pause ; retour d'absence | Les routines reviennent seules |
| **3 — La sauvegarde** | Mot de passe ; chiffrement ; envoi quotidien ; 30 copies ; restauration ; suivi | Les données sont à l'abri : usage réel possible |
| **4 — Le temps** | Durées estimées ; capacités ; jauge et alerte ; charge dans la bande semaine ; chrono ; proposition discrète ; sessions manuelles ; focus et mini-lecteur ; sous-tâches ; tâche imprévue | Les journées surchargées se voient avant de commencer |
| **5 — Historique et bilans** | Jours passés en mode bilan et corrections ; frise ; régularité ; calibrage ; bilan hebdomadaire ; recherche | Le passé est lisible et sert à mieux prévoir |
| **6 — Finitions** | Premier lancement guidé ; thème sombre ; accessibilité ; messages hors ligne et de mise à jour ; essais prolongés sur l'iPhone ; corrections | V1 terminée |

Le schéma de données est conçu dès le jalon 1 pour l'ensemble de la V1, afin de limiter les migrations.

---

## 13. Évolutions futures

Hors V1, sans engagement d'ordre :

| Évolution | Remarque |
|---|---|
| Notifications (rappel du matin, du soir, par tâche) | Sur iPhone, exigent un service d'envoi côté serveur |
| Série en cours pour les routines | Écartée de la V1 |
| Alerte « tâches dormantes » dans la revue | Écartée de la V1 |
| Statut « abandonnée » | Écarté au profit de la suppression |
| Usage sur ordinateur et synchronisation | Demanderait un compte et une base en ligne |
| Heure de fin de journée réglable | Préparée par la centralisation du calcul du jour |
| Heure fixe sur certaines tâches, agenda | Écartés de la V1 |
| Fréquences avancées (mensuelle, toutes les N semaines, « 3 fois par semaine ») | Non demandées à ce stade |
| Sous-tâches sur les routines, routines plusieurs fois par jour | Écartées de la V1 |
| Marqueur « essentiel » ou niveaux de priorité | Écartés au profit de l'ordre manuel |
| Statistiques sur le mois et l'année, export tableur | |
| Interface en anglais | |

---

## 14. Risques et points à vérifier

| Risque | Conséquence | Parade | Quand |
|---|---|---|---|
| L'offre OVH Starter n'exécute pas le script de sauvegarde comme prévu (PHP, écriture sur disque) | Pas de sauvegarde automatique | Essai réel ; à défaut, export manuel seul ou autre destination | Jalon 0 |
| L'envoi SFTP depuis GitHub échoue | Pas de déploiement automatique | Repli sur FTP | Jalon 0 |
| iOS efface les données locales (app retirée de l'écran d'accueil, manque d'espace) | Perte de l'historique | Sauvegarde quotidienne, stockage persistant demandé, alerte au-delà de 3 jours | Jalons 0 et 3 |
| Données saisies dans Safari avant l'installation | Données invisibles dans l'app installée | Écran d'installation avant toute saisie | Jalon 6, règle posée dès le jalon 0 |
| L'export de fichier se comporte mal dans une app installée | Export manuel indisponible | Essai réel des deux méthodes (partage, téléchargement) | Jalon 0 |
| Périmètre large pour une seule version | Première utilisation tardive | Jalons installables ; usage réel dès le jalon 3 | Continu |
| Vraies sous-tâches : calculs de durée, chrono et bascule plus complexes | Erreurs d'historique | Règles 6.5 strictes, tests dédiés | Jalon 4 |
| Mot de passe de sauvegarde oublié et téléphone perdu | Données irrécupérables | Avertissement explicite, export manuel en complément | Jalon 3 |
| Mise à jour de l'app modifiant la structure des données | Données abîmées | Schéma versionné, sauvegarde avant migration, tests | Continu |

---

## 15. Points à confirmer

Ces règles ont été posées par défaut. Chacune peut être changée sans remettre en cause le reste.

| # | Sujet | Proposition | Règle |
|---|---|---|---|
| 1 | Chrono en cours à minuit | L'élément reste sur sa journée jusqu'à l'arrêt du chrono | RG-04 |
| 2 | Seuil d'absence | La question est posée à partir de 2 journées entières sans ouverture | RG-07 |
| 3 | Rouvrir une tâche faite | Le jour même : retour dans la liste ; plus tard : en réserve | RG-15 |
| 4 | Tri de la réserve | À replanifier, puis échéance, puis ancienneté ; pas d'ordre manuel | RG-24 |
| 5 | Déplacement d'une occurrence | Vers un jour libre uniquement, jamais vers la réserve | RG-35 |
| 6 | Sous-tâches et tâche parente | La dernière sous-tâche cochée termine la tâche, et inversement | RG-54 |
| 7 | Chrono oublié | Question à la réouverture au-delà de 3 heures | RG-67 |
| 8 | Seuils de calibrage | 5 réalisations au moins, écart de plus de 20 % | RG-68 |
| 9 | Corrections du passé | Permises à la main (élément oublié, sessions) | RG-83 |
| 10 | Date du téléphone qui recule | Les jours clos ne sont pas rouverts | RG-112 |
| 11 | Semaine | Du lundi au dimanche | E9 |
| 12 | Création d'une routine | Possible depuis l'ajout rapide, par « Répéter » | E2 |
| 13 | Pause générale | Un bouton « Tout mettre en pause » pour toutes les routines | RG-37 |
| 14 | Version d'iOS | iOS 17 ou plus récent | 10.4 |
| 15 | Nom et icône de l'app | À choisir | |

---

## 16. Ce dont j'ai besoin de ta part

Avant le jalon 0 :

1. **Valider ce document**, en particulier la [section 15](#15-points-à-confirmer).
2. **Le nom de domaine** dédié à l'app, rattaché à ton hébergement Starter, avec le certificat SSL gratuit activé dans l'espace client OVH.
3. **Les identifiants SFTP de l'hébergement**, à enregistrer toi-même comme secrets du dépôt GitHub. La marche à suivre te sera fournie ; ne les colle jamais dans une conversation.
4. **Le modèle de ton iPhone et sa version d'iOS.**
5. **Le nom de l'app** tel qu'il apparaîtra sous l'icône.
