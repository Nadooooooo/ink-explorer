# Reprise du chargement — 23 octobre 2026

Version publiée : `6bb6cd0d-59ec-4d56-8c91-595ade955f4b`.

## Problème observé et correction

Lors du contrôle public de la version précédente, une dépendance JavaScript a temporairement renvoyé HTTP 404. Le document restait alors vide. Le contrôle suivant a confirmé le rétablissement du fichier, mais ce comportement justifiait une protection dans le document lui-même.

Le document contient maintenant un écran de chargement autonome, dans les dix langues, avec les couleurs claires/sombres du site. Il reste lisible sans les scripts, styles ou polices de l’application. Une aide et une action de rechargement apparaissent si le chargement dure, immédiatement lorsque l’entrée signale un échec. JavaScript désactivé produit une explication spécifique. React remplace cet écran dès qu’il affiche l’application.

La relance est manuelle. Elle conserve le réseau, la langue, les filtres et le fragment de l’URL. Elle fonctionne aussi avant `DOMContentLoaded`, lorsqu’un téléchargement reste bloqué. Aucun compteur, chiffre de chaîne ou résultat de recherche factice n’est ajouté.

Les simulations ont également reproduit un échec persistant dans WebKit : après une dépendance préchargée manquante, recharger ne provoquait aucune nouvelle requête pour ce fichier. Le [problème WebKit 270357](https://bugs.webkit.org/show_bug.cgi?id=270357) documente ce mécanisme. Les préchargements de modules Vite sont désactivés ; les imports natifs et le cache des fichiers servis avec succès restent utilisés. Le même scénario passe ensuite sans changer de navigateur ni ouvrir un nouvel onglet.

Une seconde anomalie a été reproduite dans le sélecteur d’apparence : la première sélection pouvait arriver avant l’installation de son écouteur de synchronisation. Le contrôle applique maintenant sa propre sélection directement, puis la propage aux autres menus.

## Contrôles

- Compilation TypeScript et Vite, 37 tests de données/activité ; 20 tests de politique des scripts, Worker, SEO et protections contre les rafales de requêtes.
- 25 scénarios de récupération : Chromium, Firefox et WebKit ; entrée interrompue, dépendance HTTP 404, ressources interrompues, JavaScript désactivé, connexion bloquée avant `DOMContentLoaded`, reprise au clavier et conservation de l’URL. Dix langues vérifiées à 320 px avec une police minimale de 24 px.
- 60 scénarios d’apparence : préférences sauvegardées, thème système, stockage refusé, changements de thème sur mobile et ordinateur, Mainnet et Sepolia. Les scripts arbitraires restent bloqués par CSP.
- Six parcours avec modules chargés à la demande : accueil, analytics, API, token, pool et NFT.
- Le contrôle de publication parcourt aussi les imports statiques du JavaScript. L’absence de `modulepreload` ne doit pas masquer une dépendance manquante.

Les rapports sont sous `reports/startup-recovery/`. Le manifeste distingue les simulations, les contrôles publics et les premières tentatives en échec conservées pour l’audit. L’audit des données de marché de la version précédente reste dans `ink-explorer-market-scope-20261023/reports/market-scope/`.

## Coût et limites

Comparaison locale de quatre chargements à froid par version, Chromium 390 px, processeur ralenti quatre fois et délai de 80 ms par ressource : médiane observée de 617 ms avant et 672 ms après, soit environ 54 ms supplémentaires. Ce test synthétique ne mesure ni les Core Web Vitals des visiteurs ni les performances d’un téléphone physique.

Cette protection suppose que le navigateur ait reçu le document HTML. Elle ne rend pas le site utilisable hors ligne et ne garantit pas qu’une nouvelle tentative réussisse si l’incident réseau persiste. Les tests WebKit ne remplacent pas la vérification sur un iPhone physique.

Les autres sujets ouverts restent la fraîcheur réelle des données de marché, les dates de calcul des agrégats amont, les lecteurs d’écran et appareils physiques, et l’indexation mesurée dans les moteurs.
