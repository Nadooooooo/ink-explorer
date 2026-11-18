# Bilan courant — 30 octobre 2026

**Les corrections ci-dessous sont prêtes localement et ne sont pas publiées.** Le domaine public reste sur la version f802, hébergée sur le serveur via Cloudflare Tunnel, hors Worker. Candidat retenu : `ink-explorer-profile-balance-proof-20261030`, 710 fichiers de code figés. Aucun changement DNS, redémarrage public, lanceur installé ou publication GitHub pendant cette passe.

## Réalisé

| Sujet | Travail réalisé | Vérification et limite |
| --- | --- | --- |
| Hébergement | Serveur et Tunnel, sans quota Worker pour le site public. | Déjà public ; huit processus et fichiers d'entrée inchangés, accueil/robots/sitemap 200 et santé locale recontrôlée. |
| Fiches tokens et NFT | Métadonnées typées et bornées, noms et images facultatifs sûrs, grands entiers et zéro exacts. Les objets malformés ne cassent plus les fiches. | Douze observations de défauts reproduites sur le parent ; 144 cas contrôlés de métadonnées, 36 NFT et 18 fiches tokens passent sur le candidat retenu. |
| Réseaux et propriétaires | Alias de réseau contrôlés sur les fiches, tokens, propriétaires, créateurs et implémentations. Les identifiants NFT contradictoires sont refusés. | Mauvais réseau refusé ; récupération d'une réponse valide sans rechargement testée. Aucun nom emprunté à une cible d'un autre réseau. |
| Icônes et badges | Booléens stricts et quatre catégories distinctes de contrats/proxies selon les métadonnées explicites. Une chaîne « false » n'est pas interprétée comme vraie. | Contrat, contrat vérifié, proxy et proxy vérifié contrôlés. Un badge de source vérifiée ne garantit pas la sécurité du contrat. |
| Adresses et confidentialité | Projection des libellés publics et faits de création ; champs privés et notes non utilisés exclus du JSON initial. | Objets comme noms, drapeaux contradictoires et métadonnées associées vérifiés. |
| Solde ETH initial | Preuve de nœud conservée dans le HTML et à l'activation de l'interface. Le solde indexé seul reste insuffisant. | Régression intermédiaire détectée par un test existant, corrigée dans un nouveau candidat. 48 parcours de premiers documents/cycle de vie ; vingt soldes de documents comparés aux nœuds avec hash canonique. |
| Logos et sonde pools | Validation commune des URL, repli local et réapparition d'une image valide. Sonde pools conforme à sa réponse de deux symboles. | Pas de `startsWith` sur un objet, ni d'objet React, ni de « undefined ». Les logos connus restent locaux ; les autres médias utilisent le proxy existant. |
| Listes et mises à jour | Premiers HTML des pools, contrats, tokens, comptes, appels internes, pont et transferts conservés, avec tris, filtres et reprise. | 270 régressions contrôlées dans ces vues et les inventaires/détenteurs/opérations/marché/statistiques. Les matrices varient selon les vues ; marché sur Chromium/WebKit. |
| Vérification globale | Build complet et preuves du candidat figé. | **116 tests de logique/documents, 516 parcours contrôlés et 118 observations HTTP réussis.** Canari : 19 groupes, 1 079 contrôles de livraison et 408 vérifications réelles de documents/parcours. Ces comptes ne sont pas additionnés comme des tests uniques. |
| Livraison et secours | Paquets et retour arrière préparés et vérifiés en privé. | 13 tests de procédure et 42 contrôles des vrais paquets/secours passent. 775 ressources actives/389 retenues ; 710 fichiers de code et neuf outils recontrôlés, ports temporaires fermés. |
| Revue visuelle | Captures mobiles/tablettes/ordinateur, français/arabe, images manquantes et états de données contrôlés. | Un détail concret reste relevé : le sélecteur NFT a une apparence trop native sur tablette. Aucun test physique revendiqué. |

## Reste à réaliser

| Priorité | Tâche | Critère de fin |
| --- | --- | --- |
| 1 | Harmoniser le sélecteur NFT et poursuivre la revue des composants. | Même apparence et focus que les autres sélecteurs, espaces et libellés cohérents ; recherche, menus, filtres, tableaux, graphiques, erreurs et fiches vérifiés avec textes longs et zoom. |
| 1 | Moderniser les anciens scénarios adresses, transferts et pools. | Fixtures conformes au HTML initial, à la preuve du nœud, aux propriétaires actuels des données et au classement adopté explicitement ; conserver les assertions utiles sans masquer les échecs. |
| 1 | Étendre la disponibilité des sources. | Mesurer erreurs, files d'attente, quotas et latences, reproduire les indisponibilités intermittentes et tester la reprise ; aucune donnée inventée pour masquer une panne. |
| 1 | Compléter les autres premiers HTML utiles. | Étudier NFT, autres vues et filtres pertinents, préserver canoniques/langues/liens et états d'erreur ; éviter les pages vides ou redondantes pour Google. |
| 1 | Publier après demande explicite. | Refaire plan/santé/rétention ; contrôler ensuite domaine public, HTML/API/CDN/WebSockets et secours sur les deux réseaux. Aucun accord présumé. |
| 2 | Étendre les métadonnées et cas extrêmes valides. | Vérifier les autres contextes et longues valeurs, sans fausse identité, crash ou coupure ; documenter les sources et limites. |
| 2 | Achever les dix langues. | Pluriels, unités, libellés, RTL et parité HTML/interface relus. |
| 2 | Tester sur appareils et aides réels. | iPhone, Android, tablette, clavier logiciel, orientation, verrouillage et lecteurs d'écran ; les moteurs automatisés ne les remplacent pas. |
| 2 | Mesurer les performances visiteurs. | Core Web Vitals, premier document, réseau lent, longues sessions et mémoire, avec comparaison avant/après. |
| 2 | Vérifier les historiques et opérations rares. | Reçus élagués, traces, journaux et variantes ; couverture prouvée au-delà d'une première page non vide. |
| 2 | Préciser la provenance des agrégats. | Fenêtres 24 h, unités, dénominateurs et dates de calcul ; ne pas confondre date HTTP et calcul interne. |
| 2 | Compléter identités et logos locaux. | Sources d'identité et licences conservées ; aucune identité déduite d'un symbole. |
| 2 | Vérifier Search Console et l'indexation. | Accès propriétaire, sitemap traité, inspections d'URL, exclusions et requêtes suivies. Aucune première page Google garantie. |
| 2 | Développer contenu et maillage utiles. | Informations distinctives et exactes, liens pertinents, sans textes artificiels ni duplication. |
| 2 | Exercer restauration et reboot complet. | Restauration isolée documentée puis retour contrôlé des services/nœuds/Tunnel, sans résurrection PM2 globale. |
| 3 | Préparer les livraisons suivantes. | Rotation générique des versions/ressources et transitions interrompues, au-delà de la première livraison coordonnée. |

## Preuves et incidents

Rapport : `ink-explorer-profile-balance-proof-20261030/docs/PROFILE_METADATA_2026-10-30.md`. Synthèse : `reports/profile-balance-proof/summary.json`, matrice retenue `browser-summary-reviewed.json`. Canari : `ink-explorer-profileproof-canary-20261030/reports/results.json`. Outils : `ink-explorer-release-ops-profileproof-20261030`, plan `plan-final.json`.

Candidat `58c534d0-2ddc-4e3b-afd1-9a960e50d884`, secours `932a90ae-9973-44af-a98c-a1638a20ff3c`. Le candidat intermédiaire métadonnées n'est pas retenu, car il avait perdu la preuve de solde ; son échec est conservé. La pagination réelle des contrats a rencontré un état indisponible intermédiaire dont la cause n'est pas établie ; les douze parcours du nouveau canari passent, avec des horodatages de diagnostic supplémentaires.

Le premier lanceur avait sélectionné un ancien test de transferts avec une fixture API incompatible avec le HTML initial réel et attendu des champs de synthèse absents du rapport marché. Échecs et captures conservés ; le bon scénario de transferts et la matrice complète du marché ont été vérifiés explicitement. Les anciens tests ne sont pas tous déclarés verts. Les nouveaux contrôles réels échantillonnent notamment une adresse système/token par réseau et un NFT découvert par réseau ; ils ne prouvent pas toutes les fiches possibles.

Les dix fichiers racine/configuration non copiés dans le canari sont déclarés ; 700 fichiers comparés et cinq adaptateurs isolés, sans autre écart. Avant activation éventuelle, revoir le plan et la rétention : de brèves coupures sont possibles pendant les trois redémarrages fork ; les cinq autres services et données/clés partagées sont conservés. Pas de perfection générale, de disponibilité permanente ou de classement Google garanti. Bilan précédent : `RECAP_2026-10-30_pools.md`.
