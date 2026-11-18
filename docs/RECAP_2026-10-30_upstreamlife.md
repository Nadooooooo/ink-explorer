# État des travaux — 30 octobre 2026

**Correctifs locaux, non publiés.** Source actuelle : `ink-explorer-upstream-lifecycle-20261030`, 721 fichiers figés. Le site public reste f802 sur serveur et Cloudflare Tunnel. La dernière campagne complète est réussie ; les incidents amont des campagnes précédentes restent consignés et ne sont pas considérés définitivement résolus.

Dossier détaillé : Connexions, délais et cache (archive opérateur `ink-explorer-upstream-lifecycle-20261030/docs/UPSTREAM_LIFECYCLE_2026-10-30.md`). Bilan précédent : [Identités et pont](RECAP_2026-10-30_bridgearrival.md).

## Réalisé

| Travail | Résultat vérifié |
| --- | --- |
| Réponses HTTP en erreur | Fermeture des corps inutilisés, y compris dernier 500/429, 404 et retour d'un secours. |
| Délais entre tentatives | Annulation avec la requête ; les six cas contrôlés passent d'environ 14,5 à 12 s. Date du secours conservée ; secours expirant en cours de requête refusé. |
| Cache disque/mémoire | Observation mémoire revérifiée après l'attente disque ; pas d'appel supplémentaire ni de remplacement par un ancien état disque dans les deux tests déterministes. |
| Reproduction | Huit réponses d'erreur ouvertes et six dépassements sur le parent, aucun sur le candidat ; deux tests de course échouent sur le parent et passent après correction. |
| Tests et HTTP | 126 tests ciblés, 36 nouvelles observations HTTP et 236 régressions HTTP réussies. Les totaux de protocoles différents ne sont pas additionnés comme une preuve unique. |
| Blocs en cours d'indexation | 69 contrôles réussis, dont les chemins 404/202/200 ; ancien lanceur exécuté avec le résolveur existant. Son lancement direct reste à moderniser. |
| Vraies données | **21 groupes, 444 observations réelles et 1 108 contrôles de livraison réussis.** Deux réseaux, plusieurs moteurs et formats, filtres/curseurs réels, fiches, soldes canoniques et contrôles tablette. |
| Interface contrôlée | 144 parcours antérieurs conservés sur bundle identique ; aucune retouche visuelle ni nouveau test physique revendiqués dans cette passe. |
| Paquet et secours | 13 tests de procédure et 44 vérifications des vrais paquets/secours réussis ; préparation uniquement, aucun lanceur installé. |
| Public | Huit PID et fichiers d'entrée inchangés, accueil indexable/robots/sitemap 200 ; tous les essais privés fermés. |

Les corrections précédentes des identités des listes, de fraîcheur des filtres, des sélecteurs/focus et de marge d'attente du pont sont conservées. La dernière campagne verte ne transforme pas les cinq échecs de la campagne précédente en réussites rétroactives et ne garantit pas l'index externe.

## Reste à réaliser

| Priorité | Tâche | Critère de fin |
| --- | --- | --- |
| P1 | Disponibilité durable et diagnostic des index | Erreurs/délais par endpoint, saturation et récupération mesurés sur la durée ; déterminer un secours vraiment frais ou l'indexation locale utile. Les 500/502/503 historiques restent des incidents ouverts à suivre. |
| P1 | Autres lecteurs courts | Distinguer données récentes et historique immuable ; tester arrivée, dates, expiration et reprise sans rechargement. |
| P1 | Autres contextes de métadonnées | Vues indexées d'adresses, utilisateurs directs de normalizeTransfers, recherches et relations contractuelles avec les mêmes contrôles de scope/identité. |
| P1 | Détails mobiles | Compacter les métadonnées de compilateur très longues sans perdre leur consultation ; espacement libellés/unités et pagination. |
| P1 | Revue des composants/parcours | Recherche, menus imbriqués, filtres, dialogues, tableaux, courbes, états vides/erreur/chargement, focus et zoom. |
| P1 | Publication explicitement demandée | Refaire plan/santé/rétention, activer seulement après demande, contrôler domaine et secours ; aucune activation autorisée à ce jour. |
| P1 | Appareils et accessibilité réels | Android/iOS, Safari mobile, claviers logiciels, lecteurs d'écran, orientation et zoom. |
| P2 | Dix langues | Éditorial, textes longs, chaînes manquantes et RTL sur toutes les pages. |
| P2 | Premiers HTML utiles | Détails NFT et filtres pertinents ; contenu et URL indexables cohérents. |
| P2 | Performance visiteurs | Navigation froide/chaude, longues sessions, réseau lent et Core Web Vitals réels. |
| P2 | SEO et visibilité | Search Console, indexation, sitemaps, contenu utile et maillage ; la première page Google n'est pas garantie. |
| P2 | Statistiques et historique | Couverture, définition/provenance des agrégats, unités et métriques disponibles, sans valeurs inventées. |
| P2 | Anciens tests | Moderniser les lanceurs TypeScript directs et scénarios adresses/transferts/pools sans affaiblir les assertions. |
| P2 | Exploitation | Restauration/sauvegarde, reboot réel, rotation et livraisons suivantes ; pas de résurrection PM2 globale. |

Livraison préparée : candidat `337b09d0-6702-4495-9f6a-8cbff64df2ec`, secours `f3a03aa4-21ce-4cf8-b5cb-db48dfd4c9fc`, outils `ink-explorer-release-ops-upstreamlife-20261030`. Rien n'est installé ou publié.
