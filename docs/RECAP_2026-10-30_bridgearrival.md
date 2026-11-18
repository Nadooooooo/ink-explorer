# État des travaux — 30 octobre 2026

**Correctifs locaux, non publiés.** Source actuelle : `ink-explorer-bridge-arrival-20261030`, 718 fichiers figés. Le site public reste f802 sur serveur et Cloudflare Tunnel. La campagne prolongée conserve des problèmes de disponibilité, malgré le contrôle final séparé réussi.

Dossier détaillé : Identités et pont (archive opérateur `ink-explorer-bridge-arrival-20261030/docs/IDENTITIES_AND_BRIDGE_2026-10-30.md`). Bilan précédent : [Marge des listes](RECAP_2026-10-30_filteredmargin.md).

## Réalisé dans cette passe

| Travail | Résultat vérifié |
| --- | --- |
| Identités dans les listes et historiques de transferts | Scopes réseau imbriqués et alias d'adresse contrôlés ; projection commune des participants ; noms publics et quatre types de contrats conservés ; L1/L2 distingués. |
| Arrivée sur les pages du pont | Source lente de 8,7 s reproduite ; attente bornée à 10 s sur les premiers documents de dépôts/retraits, annulation et refus des sources périmées vérifiés. Les autres catalogues gardent leur délai. |
| Tests ciblés | 115 réussis, dont 41 nouveaux ; preuves de reproduction sur les parents conservées. |
| Mobile, tablette et bureau | 144 parcours contrôlés réussis dans trois moteurs et deux réseaux, en français/arabe ; bundle identique au candidat final. Pas de nouveaux essais physiques. |
| Données réelles | Première campagne : 444 observations réussies avant quatre échecs de livraison. Seconde : 404/409, cinq échecs ; deux suites arrêtées, 35 observations non exécutées. Les échecs restent visibles. |
| Contrôle de livraison séparé | 1 108 vérifications réussies sur les sources finales exactes et de nouveaux services locaux. Ce résultat ne rend pas la campagne prolongée entièrement verte. |
| Paquet et retour arrière | 13 tests de procédure et 44 vérifications du vrai produit/secours ; préparation uniquement, aucun lanceur installé. |
| Intégrité et public | Sources/outils/ressources vérifiés, huit services et fichiers d'entrée inchangés ; accueil, robots et sitemap 200 ; essais temporaires fermés. |

## Reste à réaliser

| Priorité | Tâche | Critère de fin |
| --- | --- | --- |
| P0 | Fiabiliser l'index et les arrivées à froid | Diagnostiquer les HTTP 500/502/503, les retraits périmés et le premier catalogue tokens ; erreurs par endpoint, délais, récupération et charge mesurés ; campagne prolongée sans les échecs constatés. |
| P1 | Examiner les autres lecteurs courts | Distinguer données récentes et historique immuable ; préserver les dates et vérifier HTML, API, navigation, reprise et expiration. |
| P1 | Finir les métadonnées des autres contextes | Revoir notamment les vues indexées d'adresses, tous les utilisateurs directs de normalizeTransfers, recherches et relations contractuelles ; mêmes garanties de réseau et d'identité. |
| P1 | Compacter les contenus extrêmes sur mobile | Limiter la place des métadonnées de compilateur très longues sans perdre leur consultation ; corriger les libellés/unités et la pagination serrés. |
| P1 | Revoir chaque composant et parcours | Navigation imbriquée, recherche, filtres, menus, dialogues, tableaux, courbes, focus, zoom, états vide/erreur/chargement et arrivée profonde. |
| P1 | Publication explicitement demandée | Résoudre les échecs ouverts, refaire le plan et les contrôles santé/rétention ; activer seulement après demande, contrôler le domaine et le secours. |
| P1 | Appareils et accessibilité réels | Android/iOS, Safari mobile, claviers logiciels, lecteurs d'écran, orientation et zoom ; tests physiques supplémentaires. |
| P2 | Dix langues | Vérification éditoriale, textes longs, traductions manquantes et direction RTL sur toutes les pages. |
| P2 | Premiers HTML utiles | Étendre notamment aux détails NFT et aux filtres pertinents, avec URL et contenu indexable cohérents. |
| P2 | Performance visiteurs | Mesurer navigation froide/chaude, longues sessions, réseau lent, ressources et Core Web Vitals réels. |
| P2 | SEO et visibilité | Vérifier Search Console, indexation, sitemaps, contenu utile et maillage. La première page Google n'est pas garantie par une modification technique. |
| P2 | Statistiques et historique | Couverture historique, définition/provenance des agrégats, unités et métriques réellement disponibles ; aucune donnée manquante inventée. |
| P2 | Moderniser les anciens tests | Mettre à jour les anciens scénarios adresses/transferts/pools pour les preuves et parcours actuels, sans affaiblir les assertions. |
| P2 | Exploitation | Exercer sauvegarde/restauration, redémarrage réel, rotation et livraisons suivantes ; pas de résurrection PM2 globale. |

La migration serveur/Tunnel et les corrections antérieures de fraîcheur, contrôles de sélection et focus sont conservées. Les comptes de tests de passes différentes ne sont pas additionnés comme une preuve unique.

Livraison préparée : candidat `7fbb0e33-e8e9-49be-af02-82fa3757cff5`, secours `1e46cff6-c2a5-45bc-b565-89a3dddf7470`, outils `ink-explorer-release-ops-bridgearrival-20261030`. Rien n'est installé ou publié.
