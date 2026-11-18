# Bilan courant — 30 octobre 2026

**Public : serveur via Cloudflare Tunnel, hors Worker, version f802 inchangée. Les nouveaux correctifs restent locaux et non publiés.** Candidat courant : `ink-explorer-pool-directory-arrival-20261030`, 705 fichiers de code figés. Aucun DNS, lanceur ou redémarrage public, ni publication GitHub pendant cette passe.

## Réalisé

| Sujet | Travail réalisé | Preuve et portée |
| --- | --- | --- |
| Hébergement | Serveur et Cloudflare Tunnel, sans route Worker. | Déjà public ; huit processus, fichiers d'entrée et f802 conservés. Accueil/robots/sitemap publics : 200. |
| Pools dès l'arrivée | Pagination amont entièrement parcourue ; première page réellement classée dans le HTML, avec liens natifs. Catalogue collecté disponible pour les filtres et la pagination locale. | Échantillon mainnet : 141 pools/deux pages ; Sepolia : zéro/une page. Vingt documents dans dix langues, douze visites sans JS et douze parcours JS réels dans le canari couplé. Les 25 premières lignes sont visibles nativement. |
| Intégrité des pools | Pas de catalogue partiel présenté comme complet ; fin explicite, réseaux, curseurs, doublons et valeurs inconnues contrôlés. | Seize unités spécifiques et trois d'identité des pools. Limites de lecture, pages et tailles ; heure de réponse la plus ancienne conservée. |
| Classement et reprise | Classement stable pendant la lecture, nouvelles valeurs proposées par un bouton, échéances monotones, Retry-After et reprise sans rechargement. | Douze parcours contrôlés sur trois moteurs, deux réseaux, 320 px/français et 1440 px/arabe. Texte, focus et géométrie identiques à l'activation ; déplacement maximal mesuré : 0 px. |
| Hors ligne et résultats vides | Montants et total deviennent N/A sans source valide. Une liste vide périmée ne continue pas à affirmer qu'il n'existe aucun pool. | Scénarios d'expiration et de mode hors ligne dans les douze parcours. Retour aux valeurs vérifiées et adoption des nouvelles données testés. |
| Identités et logos | Symboles/DEX/adresses/URLs facultatifs normalisés ; logos connus locaux, proxy média et repli visuel en cas d'échec. Singleton bytes32 distinct d'un contrat et de ses totaux. | Détails inclus dans les scénarios : aucun emprunt de l'activité du gestionnaire, pas de /token/undefined, nom multi-facettes non arbitraire, type de proxy inconnu N/A. |
| Navigation et langues | Filtres restaurés lors des changements d'historique ; descriptif pools exact dans dix langues, sans promesse de valeurs instantanées. | Filtres/tri/pagination et RTL vérifiés avec les vraies données et dans les scénarios contrôlés. |
| Noms longs | Vérification supplémentaire d'un symbole de 240 caractères et d'un nom de contrat de 204 caractères. | Chromium/mainnet/320 px : pas de débordement h1/h2/dd. Contrôle limité, sans prétendre couvrir tous les appareils. |
| Inventaires NFT | Stabilisation du test de média paresseux intégrée au dépôt. | Les 36 parcours passent avec le script du candidat, sans adaptation extérieure ; ancien échec conservé dans le parent. |
| Autres pages | Premiers HTML des contrats, tokens, comptes, appels internes, dépôts/retraits et transferts conservés. | Canari : 32 contrats HTML/sans JS et douze JS ; 32 tokens HTML/sans JS et douze JS/filtres ; 32 transferts ; 128 catalogues HTML/sans JS et seize JS. |
| Statistiques, détenteurs et opérations | Tests selon les propriétaires actuels des données conservés et réexécutés. | 270 parcours contrôlés au total sur ce client, tous réussis ; détail des dix séries dans le rapport. |
| Construction et cache | Build complet, 480 documents et 80 cadres sans observation de chaîne figée ; 775 ressources actives et 360 retenues. | 71 tests de logique/documents et 118 observations HTTP du cache passent. Ressources de l'aperçu comparées aux fichiers construits. |
| Livraison et secours | Nouveau site et nouvelles API raccordés en privé ; paquets et secours préparés. | Dix-huit groupes du canari, 1 050 contrôles de livraison, treize tests de procédure et 38 contrôles des vrais paquets/secours réussis. Aucun lanceur public installé ; ports temporaires fermés. |

La collecte parcourt la fin de pagination du fournisseur dans une fenêtre bornée ; elle ne prouve ni un instantané atomique, ni un total permanent de tous les marchés. L'âge de 90 secondes concerne les réponses de marché, sans dater le dernier échange ou le calcul interne. Les observations de chaîne de quinze secondes restent distinctes. Les arrivées filtrées ne prennent pas l'observation par défaut ; les filtres et pages de l'interface travaillent ensuite localement sur le catalogue collecté et validé.

## Reste à réaliser

| Priorité | Tâche | Critère de fin |
| --- | --- | --- |
| 1 | Métadonnées des autres fiches, dont tokens/NFT/adresses. | Noms, symboles, URLs, objets malformés, cibles et réseaux ne provoquent ni crash ni identité inventée ; valeurs inconnues explicites. |
| 1 | Remettre à jour les anciens scripts pools. | Couvrir le classement adopté explicitement et le refus des doublons ; ne plus attendre une déduplication silencieuse ou un remplacement automatique. Les anciens scripts ne sont pas tous déclarés verts. |
| 1 | Vérifier les autres contenus HTML utiles à l'indexation. | Identifier les vues et filtres encore dépendants de JS, compléter les pages pertinentes et vérifier robots/canoniques/langues/états d'erreur. |
| 1 | Étendre la disponibilité et les latences externes. | Mesurer queues, erreurs, quotas, reprise et durée utile ; stratégie plus autonome si nécessaire, sans inventer de données ni garantir une disponibilité permanente. |
| 1 | Publier après demande explicite. | Revoir plan, santé, sources et rétention ; contrôler domaine public, HTML/API/CDN/WebSockets et secours sur les deux réseaux. Aucun accord présumé. |
| 2 | Achever la revue des composants. | Recherche, menus, filtres, tableaux, fiches, graphiques et erreurs ; densité, tailles tactiles, zoom, orientation et focus sur mobile/tablette/ordinateur. |
| 2 | Achever les dix langues. | Pluriels, unités, libellés résiduels, RTL, espaces et parité HTML/interface. |
| 2 | Tester les appareils et aides réels. | iPhone, Android, tablette, clavier logiciel, orientation, verrouillage, VoiceOver/TalkBack/NVDA. Les moteurs automatisés ne les remplacent pas. |
| 2 | Mesurer les performances des visiteurs. | Core Web Vitals, réseau lent, longues sessions, mémoire et latence du premier document, avec comparaison avant/après. |
| 2 | Vérifier les historiques et opérations rares. | Reçus élagués, traces, journaux et variantes ; couverture prouvée au-delà d'une première page non vide. |
| 2 | Établir la provenance des agrégats. | Dates de calcul, fenêtres 24 h, unités et dénominateurs ; distinguer heure HTTP et calcul. |
| 2 | Compléter identités et logos locaux. | Sources d'identité, vérification et licences conservées ; aucune identité déduite d'un symbole. |
| 2 | Vérifier Search Console. | Accès propriétaire, sitemap traité, inspections d'URL, exclusions et requêtes suivies. Aucun classement garanti. |
| 2 | Renforcer contenu et maillage utiles. | Informations exactes et distinctives, liens pertinents ; domaine, URL, canoniques et langues conservés. |
| 2 | Exercer sauvegarde et restauration. | Restauration isolée documentée, données et clés préservées, surveillance et alertes éprouvées. |
| 2 | Planifier le reboot complet. | Retour contrôlé des services, nœuds et Tunnel, sans restauration PM2 globale. |
| 3 | Préparer les livraisons suivantes. | Rotation générique des versions et ressources, transitions interrompues, au-delà de la première livraison coordonnée. |

## Références et limites

Rapport : `ink-explorer-pool-directory-arrival-20261030/docs/POOL_DIRECTORY_2026-10-30.md`. Synthèse : `reports/pool-directory/summary.json`. Canari : `ink-explorer-pools-canary-20261030/reports/results.json`. Outils : `ink-explorer-release-ops-pools-20261030`, plan `plan-final.json`.

Candidat `ff880f38-33c5-46bb-9d59-c22de4894f06`, secours `2142b684-c55d-4986-863f-b0d9ace4d57f`. 705 fichiers de produit et neuf outils figés et recontrôlés. Canari : 695 fichiers comparés, dix fichiers racine/configuration non copiés, cinq adaptateurs déclarés, sans autre écart. Avant activation éventuelle : refaire le plan et la vérification de rétention. Des coupures brèves sont possibles lors des trois redémarrages fork ; les cinq autres services et données/clés partagées sont conservés.

Les échecs intermédiaires et les audits ciblés sont conservés. Les anciens tests pools doivent être modernisés pour les comportements actuels ; aucun succès de tous les scripts ou de tous les appareils n'est revendiqué. Pas de perfection générale, d'exhaustivité permanente ni de première page Google garantie. Bilan précédent : `RECAP_2026-10-30_contracts.md`.
