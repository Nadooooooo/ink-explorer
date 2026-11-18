# Bilan courant — 30 octobre 2026

**Correctifs prêts localement, non publiés.** Le domaine public reste sur f802, serveur/Cloudflare Tunnel hors Worker. Candidat retenu : `ink-explorer-contract-cache-margin-20261030`, 712 fichiers de code figés. Aucun DNS, redémarrage public, lanceur installé ou dépôt GitHub publié pendant cette passe.

## Réalisé

| Sujet | Réalisé | Preuve et limite |
| --- | --- | --- |
| Hébergement | Serveur et Tunnel hors Worker conservés. | Déjà public ; huit processus et fichiers d'entrée inchangés, santé contrôlée et accueil/robots/sitemap 200. |
| Sélecteurs | Forme, violet, chevron local, tailles et couleurs forcées harmonisés ; toutes les sections accessibles sur tablette. | Six vues, trois moteurs et seuils 1 179/1 180 px ; deux boutons du bloc conservés. |
| Focus et lecture | Section choisie conservée lors du changement de présentation ; focus à l'écran en fenêtre basse, sans retour forcé au menu après défilement ni vol du focus d'un autre champ. | 312 parcours ciblés. Zoom/pincement contrôlé ; modèles de fenêtre visuelle sans clavier physique. |
| Petits écrans réels | Vérification sur de vraies fiches d'adresses/NFT. | 24 observations : six hors écran dans l'intermédiaire, zéro après correction. Douze visites NFT supplémentaires dans le canari final avec fenêtre de 360 px de haut. |
| Pagination des contrats | Toutes les pages avec curseur gardent une marge de fraîcheur côté API. | Défaut reproduit : deux réponses presque expirées, marquées fraîches puis refusées par le client. Après correction : zéro. La limite client de quinze secondes reste inchangée. |
| Métadonnées et solde | Corrections tokens/NFT/adresses, propriétaires, réseaux, badges, logos et preuve de solde du candidat précédent conservées. | Les vingt comparaisons de solde ETH canonique restent dans le canari ; autres preuves antérieures consultables. |
| Interface vérifiée | 572 parcours sur le client figé : 312 ciblés et 260 régressions des fiches, inventaires, premiers documents et formulaires. | Même code d'interface et mêmes ressources compilées dans le candidat API final ; pas de répétition artificielle de ces comptes après la modification du cache seul. |
| API et documents | Treize tests de cache/pré-rendu et 128 observations HTTP réussis sur le candidat final. | Dix observations spécifiques à la marge des curseurs et 118 observations existantes réexécutées. |
| Canari et livraison | Vingt groupes et 1 094 contrôles de livraison ; treize tests de procédure et 44 contrôles des vrais paquets/secours. | 420 vérifications réelles de documents/parcours, dont douze paginations de contrats et douze NFT tablette. Aucun lanceur public installé. |
| Intégrité | Sources, outils, construction et ressources contrôlés ; ports temporaires fermés. | 712 fichiers de code, neuf outils ; 775 ressources actives/404 retenues. 702 fichiers comparés au canari, dix exclusions racine/configuration, cinq adaptateurs déclarés. |

## Reste à réaliser

| Priorité | Tâche | Critère de fin |
| --- | --- | --- |
| 1 | Cartographier les autres fenêtres de fraîcheur et routes filtrées. | Pour chaque lecteur/curseur, vérifier l'âge producteur et la marge de transfert/affichage ; conserver les vraies dates et le refus des sources périmées. |
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

Rapport : `ink-explorer-contract-cache-margin-20261030/docs/SECTION_FOCUS_AND_CACHE_2026-10-30.md`. Synthèse : `reports/contract-cache-margin/summary.json`. Preuves du client : `ink-explorer-section-focus-20261030/reports/section-focus`. Canari final : `ink-explorer-contractmargin-canary-20261030/reports/results.json`. Outils : `ink-explorer-release-ops-contractmargin-20261030`, plan `plan-final.json`.

Candidat `aa127594-cae1-45bb-9f90-bc1ff3a90a0a`, secours `3b445408-d73a-4649-a2cb-dd064d85b7f2`. Les candidats intermédiaires, échecs, traces et correctifs d'attente des tests sont conservés. Le défaut intermittent des contrats précédemment non expliqué a maintenant une reproduction et un correctif de cache vérifiés. Les anciens scripts ne sont pas tous déclarés verts ; pas de perfection générale, disponibilité permanente ou classement Google garanti. Avant activation éventuelle, revoir le plan et la rétention ; de brèves coupures sont possibles pendant les trois redémarrages fork, les cinq autres services et données/clés partagées restent préservés. Bilan précédent : `RECAP_2026-10-30_profileproof.md`.
