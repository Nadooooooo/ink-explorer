# Bilan courant — 30 octobre 2026

**Correctifs prêts localement, non publiés.** Le domaine reste sur f802, serveur/Cloudflare Tunnel hors Worker. Candidat retenu : `ink-explorer-filtered-source-margin-20261030`, 716 fichiers de code figés. Aucun DNS, redémarrage public, lanceur installé ou dépôt GitHub publié pendant cette passe.

## Réalisé

| Sujet | Réalisé | Preuve et limite |
| --- | --- | --- |
| Hébergement | Serveur et Tunnel hors Worker conservés. | Déjà public ; huit processus, fichiers d'entrée et f802 inchangés, santé contrôlée et accueil/robots/sitemap 200. |
| Cartographie des lecteurs | Les lecteurs de listes à quinze secondes sont reliés à leurs routes et à leur politique de cache. | Comptes, appels internes, contrats, pont/compteurs, transferts et filtres avancés ; profils/tokens/statistiques et autres endpoints conservent leurs règles. |
| Filtres et curseurs | Marge de transfert/affichage étendue aux six familles restantes, politique regroupée dans un module testé. | Source réutilisée cinq secondes, limites client inchangées. Douze réponses presque expirées reproduites sur le parent, zéro après correction. |
| Pannes et reprises | Sources périmées refusées comme valeurs courantes, dates de secours préservées, nouvelle observation lors de la reprise. | Quatorze cas de panne et quatorze reprises dans les 108 observations spécifiques ; renouvellements concurrents regroupés. |
| Navigation réelle | Aller-retour entre pages vérifié avec de vrais filtres et curseurs. | 24 parcours Chromium, deux réseaux, mobile/français et ordinateur/arabe ; 24 allers-retours et 72 réponses API vérifiées. |
| Interface et fiches | Finitions des sélecteurs, focus, lecture, métadonnées et preuves de solde du candidat précédent conservées. | Interface et ressources compilées identiques ; 572 parcours d'interface antérieurs restent consultables et ne sont pas présentés comme réexécutés. |
| Tests du candidat | 18 tests de logique/documents et 236 observations HTTP réussis. | 108 observations spécifiques, 118 existantes et dix contrats ; reproduction du parent comptée séparément. |
| Canari et livraison | 21 groupes, 1 094 contrôles de livraison et 444 vérifications réelles ; 13 tests de procédure et 44 contrôles des vrais paquets/secours. | Aucun lanceur public installé. Navigateurs automatisés et données échantillonnées, sans prétendre couvrir tous les appareils ou historiques. |
| Intégrité | Sources, outils et ressources vérifiés ; ports temporaires fermés. | 716 fichiers de code, neuf outils, 775 ressources actives/404 retenues ; 706 fichiers comparés au canari, dix exclusions et cinq adaptateurs déclarés. |

## Reste à réaliser

| Priorité | Tâche | Critère de fin |
| --- | --- | --- |
| 1 | Examiner les autres lecteurs de premiers documents et détails à fenêtre courte. | Distinguer historique immuable et données récentes, conserver dates et limites du client ; les listes filtrées à quinze secondes sont maintenant cartographiées et corrigées. |
| 1 | Moderniser les anciens tests adresses/transferts/pools. | Fixtures conformes au HTML initial, aux preuves du nœud et aux classements adoptés explicitement ; ne pas masquer les échecs. |
| 1 | Poursuivre la revue des composants. | Recherche, menus, filtres, tableaux, graphiques, erreurs et fiches ; textes extrêmes, zoom, orientation, tailles tactiles et focus. |
| 1 | Étendre la disponibilité des sources. | Mesurer erreurs, files d'attente, quotas et latences ; reprises prouvées sans inventer des valeurs. |
| 1 | Compléter les autres premiers HTML utiles. | Étudier NFT, vues et filtres pertinents, conserver liens/canoniques/langues et états d'erreur, éviter pages vides ou redondantes. |
| 1 | Publier après demande explicite. | Refaire plan/santé/rétention puis vérifier domaine public, HTML/API/CDN/WebSockets et secours sur les deux réseaux. |
| 2 | Étendre métadonnées et cas extrêmes. | Autres contextes, noms longs, formats rares, identités et logos locaux documentés, sans fausse déduction. |
| 2 | Achever les dix langues. | Pluriels, unités, libellés, RTL et parité HTML/interface relus. |
| 2 | Tester appareils et aides réels. | iPhone, Android, tablette, clavier logiciel, orientation, verrouillage et lecteurs d'écran. Les moteurs automatisés ne les remplacent pas. |
| 2 | Mesurer les performances visiteurs. | Core Web Vitals, premier document, réseau lent, longues sessions et mémoire, avec comparaison avant/après. |
| 2 | Vérifier les historiques et opérations rares. | Reçus élagués, traces, journaux et variantes, au-delà d'une première page non vide. |
| 2 | Préciser la provenance des agrégats. | Fenêtres 24 h, unités, dénominateurs et dates de calcul ; heure HTTP distincte du calcul interne. |
| 2 | Vérifier Search Console et l'indexation. | Accès propriétaire, sitemap traité, inspections d'URL, exclusions et requêtes suivies ; aucune première page garantie. |
| 2 | Développer contenu et maillage utiles. | Informations distinctives et exactes, liens pertinents, sans texte artificiel ni duplication. |
| 2 | Exercer restauration et reboot complet. | Restauration isolée puis retour contrôlé des services/nœuds/Tunnel, sans résurrection PM2 globale. |
| 3 | Préparer les livraisons suivantes. | Rotation générique des versions/ressources et transitions interrompues au-delà de la première livraison coordonnée. |

## Références

Rapport : `ink-explorer-filtered-source-margin-20261030/docs/FILTERED_SOURCE_MARGIN_2026-10-30.md`. Synthèse : `reports/filtered-source-margin/summary.json`, cartographie `reader-map.json`. Canari final : `ink-explorer-filteredmargin-canary-20261030/reports/results.json`. Outils : `ink-explorer-release-ops-filtermargin-20261030`, plan `plan-final.json`.

Candidat `3e9177af-0941-4279-ac06-483576622ca0`, secours `d8799693-a0f0-41e5-afa3-d2b577c80e80`. Les sources et tests intermédiaires sont conservés. Les scripts anciens ne sont pas tous déclarés verts ; pas de perfection générale, disponibilité permanente ou classement Google garanti. Avant activation éventuelle : refaire plan/santé/rétention ; de brèves coupures restent possibles pendant les trois redémarrages fork, cinq autres services et données/clés partagées conservés. Bilan précédent : `RECAP_2026-10-30_contractmargin.md`.
