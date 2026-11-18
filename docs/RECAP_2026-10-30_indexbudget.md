# État des travaux — 30 octobre 2026

**Correctifs locaux, non publiés.** Source actuelle `ink-explorer-index-document-budget-20261030`, 727 fichiers figés. Le défaut de budget des premiers documents indexés est reproduit et corrigé ; la nouvelle campagne complète est réussie. Public f802 inchangé.

Dossier : Budgets des documents indexés (archive opérateur `ink-explorer-index-document-budget-20261030/docs/INDEX_DOCUMENT_BUDGET_2026-10-30.md`). Bilan précédent : [Cartes mobiles et reprise](RECAP_2026-10-30_mobilecontracts.md).

## Réalisé

| Travail | Résultat vérifié |
| --- | --- |
| Délai des premiers documents indexés | Limites partagées : API JSON 12 s inchangée, documents 13 s avec marge locale d'une seconde. Neuf types de pages concernés, dont comptes/appels/pont, contrats, tokens/transferts, pools et fiche token. |
| Données toujours contrôlées | Fraîcheur 15/90 s, dates originales, validation, annulation et refus des catalogues incomplets conservés ; pas de prolongation artificielle des sources. |
| Reproduction avant/après | 18 réponses valides à 11,8 s abandonnées sur le parent et acceptées après correction ; trajet réel API → HTML : huit 503 à froid sur le parent, zéro après correction, seize documents validés. |
| Vérifications ciblées | 178 tests, 164 observations temporelles avec sources contrôlées et 272 observations API réexécutées. Les seize documents HTTP sont comptés séparément. |
| Campagne réelle | **21 groupes, 444 observations et 1 123 contrôles de livraison réussis.** Les quatre retraits précédemment en échec font partie du contrôle ; les anciens rapports restent conservés. |
| Interface précédente | Cartes compactes, grandes polices, libellés et notice non obstructive conservés. Bundle identique au parent ; ses 208 parcours contrôlés ne sont pas présentés comme réexécutés ici. |
| Livraison/secours | 13 tests de procédure et 44 contrôles des vrais paquets/secours réussis ; aucune installation. |
| Public/intégrité | Sources/outils/ressources vérifiés, huit PID/fichiers d'entrée inchangés ; accueil indexable, robots et sitemap 200 ; essais privés fermés. |

Une arrivée à froid peut attendre davantage pour recevoir le contenu utile. Cette correction ne réduit pas la durée de calcul de l'index ni ne garantit sa disponibilité permanente.

## Reste à réaliser

| Priorité | Tâche | Critère de fin |
| --- | --- | --- |
| P1 | Profils d'adresse et lecteurs mixtes | Analyser index, preuve de solde et nœud local ensemble ; budget documentaire encore à 4 s sur l'adresse, stratégie propre à cette chaîne. |
| P1 | Filtres avancés | Vérifier la chaîne complète : API autorisée 65 s, proxy public actuellement 55 s, budget client à inspecter. Partager une politique cohérente puis tester délai/annulation/reprise, sans augmenter tous les délais. |
| P1 | Disponibilité durable des index | Erreurs/délais par endpoint, charge et récupération sur la durée ; secours réellement frais ou indexation locale utile. Les anciens incidents 500/502/503 restent documentés. |
| P1 | Métadonnées restantes | Vues indexées d'adresses, pools et autres utilisateurs directs des normaliseurs ; scopes/alias/types et relations contractuelles cohérents. |
| P1 | Autres composants | Recherche, menus imbriqués, filtres, tableaux, courbes, dialogues, états vide/erreur/chargement, focus/zoom et contenus longs. |
| P1 | Appareils/accessibilité réels | Android/iOS, Safari mobile, claviers logiciels, lecteurs d'écran, orientation et zoom ; les moteurs simulés ne les remplacent pas. |
| P1 | Publication explicitement demandée | Refaire plan/santé/rétention, activer seulement après demande puis contrôler domaine/secours. |
| P2 | Langues et premiers HTML utiles | Revue éditoriale globale et textes longs ; détails NFT/filtres pertinents, URL et contenu indexables cohérents. |
| P2 | Performance et SEO | Mesures visiteurs/longues sessions, Search Console, indexation, contenu et maillage ; aucune garantie de première page Google. |
| P2 | Statistiques/historique | Couverture et provenance/définition des agrégats, unités, métriques disponibles sans valeur inventée. |
| P2 | Tests/exploitation | Anciens lanceurs/scénarios, restauration/reboot réel, rotations et livraisons suivantes. |

Livraison préparée : candidat `c802ee4d-cafe-44ae-8291-839a37819edf`, secours `3ddbca7d-7665-4d7f-9424-98172d4ddb5e`, outils `ink-explorer-release-ops-indexbudget-20261030`. Aucun lanceur installé, aucune publication.
