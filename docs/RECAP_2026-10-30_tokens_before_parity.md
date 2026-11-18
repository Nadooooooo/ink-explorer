# Bilan courant — 30 octobre 2026

**La migration hors Worker est publique. Les nouveaux correctifs restent locaux et non publiés.** Version publique f802, serveur et Cloudflare Tunnel. Candidat courant : `ink-explorer-token-directory-arrival-20261030`, 690 sources figées. Aucun nouveau DNS, lanceur public, redémarrage public ou code GitHub publié dans cette passe.

## Réalisé

| Sujet | Travail réalisé | Preuve et portée |
| --- | --- | --- |
| Hébergement | Domaine servi par le serveur via Cloudflare Tunnel, sans route Worker. | Déjà public ; huit services et f802 préservés. |
| Tokens au chargement | Vraies lignes, noms, types, prix, détenteurs, capitalisation sur Ink et liens dans le premier HTML. | Deux réseaux/dix langues ; 32 vérifications HTML/sans JS et douze parcours réels avec filtres dans le canari couplé. |
| Reprise du classement | Même page et focus pendant l'activation ; nouvelles pages adoptées explicitement, valeurs expirées N/A. | Douze parcours contrôlés sur trois moteurs ; écart de géométrie maximal mesuré 0 px, y compris erreurs et changements d'heure. |
| Intégrité des tokens | Mauvais réseau, doublons, curseurs dangereux rejetés ; champs optionnels invalides inconnus, entiers précis et projection sans tags privés. | Quatre défauts du parent reproduits, puis normalisation/HTML validés. |
| Reprise après 503 | La nouvelle tentative attend le délai partagé de façon annulable ; 503 sans délai explicite : trois secondes, 429 : soixante secondes. | Défaut reproduit dans le parent ; tests de délais explicites, annulation et changements d'heure. |
| Fraîcheur | Échéances monotones des classements et retrait des candidats expirés ; arrondi HTTP Date corrigé pour les statistiques. | Tests de frontière et d'horloge ; plafond de marché de 90 secondes depuis la réponse, sans prétendre dater le dernier échange ou le calcul interne. |
| Autres listes | Premiers HTML des comptes, appels internes, dépôts/retraits et transferts conservés et revalidés. | Canari courant : 32 transferts, 128 catalogues HTML et seize catalogues avec JS. |
| Cartes et langues | Compacité et traductions du parent conservées. | Preuve parentale : 344 → 266 px sur téléphone, 333 → 264 px sur tablette, actions de 44 px ; Amount traduit dans huit langues supplémentaires. Ces mesures ne sont pas toutes réexécutées ici. |
| Régressions contrôlées | 18 parcours détenteurs, 36 inventaires, 24 opérations utilisateur, douze calculs de marché et douze statistiques/gas passent. | Avec douze arrivées tokens, total courant de 114 parcours contrôlés ; portées distinctes des visites réelles. |
| Compilation et logique | Build TypeScript/Vite complet et 40 tests réussis. | 480 documents et 80 cadres de fiches sans observation de chaîne figée ; 775 ressources actives, 309 retenues. |
| Livraison et secours | Nouveau site et nouvelles API raccordés en privé ; paquet et retour arrière préparés. | 999 contrôles de livraison, treize tests de procédure et 34 contrôles des vrais paquets/secours réussis. Aucun lanceur installé. |
| Production | Huit PID, empreintes et f802 inchangés ; root/robots/sitemap 200. | Ports temporaires arrêtés. |

La durée de 90 secondes est la politique existante des réponses de marché/statistiques. Elle ne décrit pas le temps de bloc, l'heure du dernier trade ou la date de calcul de l'index. Les filtres et curseurs gardent une lecture indépendante, sans réutiliser le classement du premier document.

## Reste à réaliser

| Priorité | Tâche | Critère de fin |
| --- | --- | --- |
| 1 | Premier HTML des contrats. | Vrais noms, identités, liens et métadonnées validés avant JS ; distinction contrat/proxy/vérification sur preuves, reprise et fraîcheur cohérentes. |
| 1 | Premier HTML du catalogue complet des pools. | Pagination complète et bornée, tri et filtres globaux corrects ; aucune première tranche présentée comme l'ensemble. |
| 1 | Moderniser le test historique de statistiques. | Le script du dépôt respecte l'appartenance actuelle des compteurs aux nœuds ou à l'index et remplace les hypothèses anciennes. L'audit ciblé courant est déjà réussi, mais l'ancien script n'est pas déclaré vert. |
| 1 | Étendre les mesures de disponibilité externe. | Latences de queue, erreurs et durée utile observées ; stratégie plus autonome éventuelle sans inventer de transferts. Le délai HTML borné ne prouve pas une disponibilité générale. |
| 1 | Publier après demande explicite. | Plan, santé, sources et rétention revus ; contrôles du domaine public HTML/API/CDN/WebSockets sur les deux réseaux et secours prêt. |
| 2 | Revoir les autres composants. | Recherche, navigation, filtres, listes, fiches, graphiques et erreurs ; noms très longs, métadonnées/icônes malformées hors annuaire, alignements, densité, zoom et focus. |
| 2 | Finir les traductions. | Dix langues, pluriels, libellés résiduels, unités, RTL et espaces dans HTML et interface. |
| 2 | Tester appareils et aides réels. | iPhone, Android, tablette, clavier logiciel, orientation, verrouillage, VoiceOver/TalkBack/NVDA. |
| 2 | Mesurer les performances réelles. | Core Web Vitals, réseau lent, longues sessions, mémoire et latence du premier document ; comparaison avant/après. |
| 2 | Vérifier les historiques et types rares. | Reçus élagués, traces, journaux et variantes d'opérations ; couverture prouvée au-delà d'une première page non vide. |
| 2 | Établir la provenance des agrégats. | Dates de calcul, fenêtres 24 h, unités et dénominateurs ; l'heure HTTP reste distincte du calcul. |
| 2 | Compléter identités et logos sur preuves. | Noms, proxy, vérification et logos locaux/licences ; aucune identité inventée depuis un symbole. |
| 2 | Vérifier Search Console. | Accès propriétaire, sitemap traité, inspections d'URL, exclusions et requêtes suivies. Aucune première place Google garantie. |
| 2 | Renforcer contenu et maillage utiles. | Contenus exacts/distinctifs et liens pertinents ; domaine, URL, canoniques et langues conservés. |
| 2 | Exercer sauvegarde et restauration. | Restauration isolée documentée, données/clés préservées, surveillance et alertes éprouvées. |
| 2 | Planifier le reboot complet. | Retour contrôlé des services, nœuds et Tunnel sans restauration PM2 globale. |
| 3 | Préparer les livraisons suivantes. | Rotation générique des versions/ressources et transitions interrompues au-delà de la première livraison coordonnée. |

## Références et limites

Produit : `ink-explorer-token-directory-arrival-20261030/docs/TOKEN_DIRECTORY_2026-10-30.md`, synthèse `reports/token-directory-arrival/summary.json`, manifeste `reports/token-directory-arrival/source-manifest.json`.

Canari : `ink-explorer-token-directory-canary-20261030/reports/results.json`. Livraison : `ink-explorer-release-ops-token-directory-20261030/docs/LIVRAISON_2026-10-30.md`, candidat `203e5180-e764-4f3e-b6c4-26b617d8b87b`, secours `9090b061-0b35-4e6b-8e37-aa0bf3c3c028`.

Les échecs restent conservés : reprise 503 cassée dans le parent ; essais intermédiaires qui chargeaient encore le cache de l'ancien aperçu ; fausse réponse de transferts non datée dans le test détenteurs ; différence de marque directionnelle Firefox/Node ; ancien test de statistiques supposant un autre propriétaire pour les compteurs. Le rapport détaille les corrections, les suites réussies et ce qui reste à moderniser. Aucun succès de tous les anciens scripts ou de tous les appareils n'est revendiqué.

Bilan précédent : `RECAP_2026-10-30_polish.md`. Sources et outils figés à ne pas modifier.
