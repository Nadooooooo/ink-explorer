# État des travaux — 30 octobre 2026

**Correctifs locaux, non publiés.** Source actuelle `ink-explorer-mobile-contracts-20261030`, 724 fichiers figés. L'interface est vérifiée dans les périmètres ci-dessous ; le contrôle global conserve quatre erreurs de délai sur les retraits Mainnet. Public f802 inchangé.

Dossier : Cartes mobiles et reprise (archive opérateur `ink-explorer-mobile-contracts-20261030/docs/MOBILE_CONTRACTS_AND_RECOVERY_2026-10-30.md`). Bilan précédent : [Cycle de vie amont](RECAP_2026-10-30_upstreamlife.md).

## Réalisé

| Travail | Résultat vérifié |
| --- | --- |
| Cartes de contrats | Noms longs sur trois lignes, compilateurs sur deux, texte complet accessible/titres et fiche liée. Carte de fixture à 320 px : 343 → environ 260 px. |
| Grandes polices | Pied de carte réparti sur plusieurs rangées si nécessaire ; « solidity » reste sur une ligne avec police minimale Firefox de 32 px, sans débordement horizontal. |
| Petits libellés/pagination | Espaces « Solde ETH »/« Page 1 » élargis de 2 px à environ 3,09/3,45 px ; texte et traductions inchangés. |
| Démarrage retardé sur HTML consultable | Panneau fixe masquant le document reproduit puis remplacé par une notice dans le flux après le pied de page ; dix langues. Le démarrage tardif active l'interface sans rechargement. |
| Secours sans contenu | Action de reprise plein écran conservée si aucun HTML utile n'est disponible. Un véritable échec de ressource peut encore demander une reprise explicite. |
| Vérifications d'interface | **208 parcours réussis**, dont 52 de reprise embarquée et 12 du secours plein écran ; trois moteurs, deux réseaux et formats/langues selon les matrices. Quatre sondes natives distinctes, dont grande police. |
| Logique/construction | 130 tests réussis ; 480 documents et 80 coquilles reconstruits. API inchangée : 272 observations HTTP et 69 contrôles d'indexation du parent conservés, non réexécutés. |
| Données réelles | **444 observations réussies**. Canari complet : **20/21 groupes**, contrôle global **1 119/1 123**, quatre erreurs ci-dessous. |
| Livraison/secours | 13 tests de procédure et 44 contrôles des vrais paquets/secours réussis ; aucune installation. |
| Public/intégrité | Sources/outils/ressources vérifiés, huit PID/fichiers d'entrée inchangés ; accueil indexable, robots, sitemap 200 ; essais privés fermés. |

## Reste à réaliser

| Priorité | Tâche | Critère de fin |
| --- | --- | --- |
| P0 | Aligner les budgets document/API du pont | Les retraits Mainnet ont produit quatre 503 : document annulé à 10 s, source fraîche reçue en 11,809 s dans le budget API de 12 s. Partager/aligner les limites avec marge locale bornée ; tester succès tardif, annulation et fraîcheur ; refaire le contrôle final. Ne pas répéter des tests jusqu'à obtenir artificiellement du vert. |
| P1 | Autres premiers documents et lecteurs courts | Examiner les budgets imbriqués, historique immuable/données récentes, dates, expiration et reprise sans rechargement. |
| P1 | Disponibilité durable des index | Erreurs et délais par endpoint, charge et récupération sur la durée ; secours réellement frais ou indexation locale utile. Les incidents 500/502/503 antérieurs restent documentés. |
| P1 | Métadonnées restantes | Vues indexées d'adresses, utilisateurs directs de normalizeTransfers, recherches et relations contractuelles avec les mêmes contrôles de scope. |
| P1 | Revue des autres composants | Recherche, menus imbriqués, filtres, tableaux, graphiques, dialogues, états vide/erreur/chargement, focus/zoom et autres contenus longs. |
| P1 | Appareils/accessibilité réels | Android/iOS, Safari mobile, claviers logiciels, lecteurs d'écran, orientation et zoom. Les moteurs simulés ne remplacent pas ces essais. |
| P1 | Publication explicitement demandée | Résoudre les échecs ouverts, refaire plan/santé/rétention, activer seulement après demande puis contrôler domaine/secours. |
| P2 | Langues | Finir la revue éditoriale et les textes longs sur toutes les pages ; la nouvelle notice est testée dans les dix langues, pas l'intégralité du site. |
| P2 | Premiers HTML utiles | Détails NFT et filtres pertinents ; URL et contenu indexables cohérents. |
| P2 | Performance/SEO | Mesures visiteurs et longues sessions, Search Console, indexation, contenu et maillage ; aucune garantie de première page Google. |
| P2 | Statistiques/historique | Couverture et provenance/définition des agrégats, unités et métriques disponibles sans valeur inventée. |
| P2 | Tests/exploitation | Moderniser anciens lanceurs/scénarios ; exercer restauration/reboot réel, rotations et livraisons suivantes. |

Livraison préparée : candidat `d507b18d-67fc-4296-9561-fcdb37a66196`, secours `69666b85-ef7a-4f89-8344-17e4adac67d0`, outils `ink-explorer-release-ops-mobilecontracts-20261030`. Aucun lanceur installé, aucune publication.
