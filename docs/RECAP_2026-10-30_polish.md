# Bilan courant — 30 octobre 2026

**La migration hors Worker est en production. Les nouveaux correctifs sont validés localement et ne sont pas encore publiés.** Public : f802, serveur et Cloudflare Tunnel. Candidat courant : `ink-explorer-catalogue-polish-20261030`, 683 sources figées. Aucun nouveau DNS, lanceur ou redémarrage public dans cette passe ; aucun code GitHub publié.

## Réalisé

| Sujet | Travail réalisé | État et preuve |
| --- | --- | --- |
| Hébergement | Le domaine est servi par le serveur via Cloudflare Tunnel, sans route Worker. | Déjà public ; huit services et f802 conservés. |
| Comptes | Les vrais comptes, noms disponibles, soldes exacts et liens sont dans le premier HTML. Le pourcentage reste inconnu si son dénominateur n'est pas prouvé. | Validé localement sur les deux réseaux. |
| Transactions internes | Les appels sont présents sans JS ; les appels distincts d'une même transaction gardent leurs identités. | Validé localement, types/valeurs/liens comparés aux sources. |
| Dépôts et retraits | Opérations et résumés disponibles dès le HTML, liens L1/L2 corrects, nonce complet préservé. | Validé localement, compteurs indépendants des opérations. |
| Reprise dans l'interface | Les lignes initiales restent visibles pendant l'activation ; erreurs et expiration reprennent sans rechargement. Le focus est conservé ou déplacé proprement. | 120 parcours catalogue et douze relais transferts dans le candidat courant ; écart maximal mesuré 0 px. |
| Intégrité | Mauvais réseau, doublons, curseurs et champs dangereux rejetés ; valeurs absentes ou non sûres affichées N/A. | 25 tests de documents réexécutés ; preuves d’intégrité et de délai froid des parents conservées, code API inchangé. |
| Cache | Rafraîchissement partagé des catalogues, horodatage de source conservé et limite stricte ; pages dynamiques no-store. | 108 lectures HTTP avec le vrai runtime API et une source déterministe locale ; code API inchangé dans le dernier enfant. |
| Réponse lente des transferts | Réponse externe correcte de 6,1 s identifiée ; délai document porté à huit secondes, fraîcheur contrôlée avant/après rendu. | Cas de 6,2 s reproduit puis corrigé ; expiration et blocage restent refusés. L'index externe n'est pas accéléré. |
| Canari réel complet | Nouveau site et nouvelles API privés raccordés et contrôlés ensemble. | 32 visites de transferts, 128 de catalogues HTML, 16 de catalogues avec JS et 983 contrôles de livraison réussis. |
| Paquet et retour arrière | Livraison coordonnée préparée, secours conservant les nouvelles ressources. Le démarrage attend correctement un snapshot initialement 503. | 13 tests de procédure et 32 contrôles des vrais paquets/secours réussis. Aucun lanceur installé. |
| Cartes mobiles | Règle CSS qui séparait libellés et parties corrigée ; espacements resserrés, copies et liens de 44 px conservés. | Même jeu contrôlé : 344 → 266 px sur téléphone, 333 → 264 px sur tablette tactile ; ordinateur 80 → 80 px. |
| Traduction de Amount | Libellé corrigé dans huit langues supplémentaires, serveur et navigateur concordants. | Comparaison JSON : aucune autre valeur de traduction modifiée. Audit complet des langues encore ouvert. |
| Production | Huit PID, empreintes des entrées et version publique inchangés ; root/robots/sitemap répondent 200. | Contrôle final dans reports/final-invariants.json de la livraison. Ports temporaires arrêtés. |

Les suites HTML couvrent les dix langues, deux réseaux et trois moteurs pour les visites sans JavaScript. Les seize parcours réels avec JS utilisent Chromium mobile/ordinateur. Les moteurs automatisés ne sont pas des tests sur appareils physiques. Les preuves des parents conservées ne sont pas toutes présentées comme réexécutées dans le dernier enfant.

## Reste à réaliser

| Priorité | Tâche | Critère de fin |
| --- | --- | --- |
| 1 | Compléter les premiers HTML des listes de tokens, contrats et pools. | Vraies données/liens avant JS, réseau/fraîcheur validés, relais sans flash et bonne réponse indisponible. |
| 1 | Surveiller et réduire la dépendance aux lenteurs de l'index externe. | Latences de queue et erreurs observées sur une durée utile ; stratégie autonome éventuelle vérifiée sans transferts inventés. Le délai de huit secondes ne prouve pas une disponibilité générale. |
| 1 | Publier après demande explicite. | Plan, rétention et santé revus ; contrôles publics HTML/API/CDN/WebSockets sur les deux réseaux et retour arrière prêt. |
| 2 | Revoir chaque composant mobile/ordinateur. | Recherche, navigation, filtres, tableaux, fiches, graphiques et erreurs ; noms très longs et états rares, densité, espacements, alignements, zoom et focus cohérents. |
| 2 | Finir les traductions. | Dix langues ; autres libellés résiduels, pluriels, unités, RTL et espaces vérifiés dans HTML et interface. Amount est corrigé dans cette passe. |
| 2 | Tester appareils et aides réels. | iPhone, Android, tablette, clavier logiciel, orientations, verrouillage, VoiceOver/TalkBack/NVDA. |
| 2 | Mesurer les performances des visiteurs. | Core Web Vitals réels, réseau lent, longues sessions, mémoire et latence du premier document ; comparaison avant/après. |
| 2 | Vérifier historiques, reçus et types rares. | Couverture des reçus élagués, appels internes, logs et types rares ; lacunes explicites et vérification au-delà de la première page. |
| 2 | Établir la provenance des autres statistiques. | Date de calcul propre à chaque agrégat, fenêtre 24 h, unités et dénominateurs ; l'heure HTTP n'est pas présentée comme heure de calcul. |
| 2 | Compléter identités et logos sur preuves. | Nom, proxy et vérification prouvés, logos locaux/licences conservés ; aucune identité inventée depuis un symbole. |
| 2 | Vérifier Search Console. | Accès propriétaire, sitemap traité, inspections d'URL, exclusions et suivi des recherches Ink Explorer. Aucune première place garantie. |
| 2 | Renforcer le contenu et le maillage utiles. | Contenus exacts et distinctifs, liens pertinents, conservation du domaine, des URL, canoniques et langues. |
| 2 | Éprouver sauvegarde et restauration. | Restauration isolée documentée, données et clés préservées, surveillance et alertes exercées. |
| 2 | Planifier le redémarrage complet. | Retour contrôlé des services, nœuds et Tunnel sans restauration PM2 globale. L'unité activée ne remplace pas ce test. |
| 3 | Préparer les livraisons suivantes. | Rotation générique des versions/ressources et transitions interrompues au-delà de la première livraison coordonnée. |

## Preuves et incidents

Rapport produit : `ink-explorer-catalogue-polish-20261030/docs/MOBILE_CATALOGUES_2026-10-30.md`. Synthèse : `reports/catalogue-polish/summary.json`. Manifeste : `reports/catalogue-polish/source-manifest.json`.

Canari final : `ink-explorer-catalogue-polish-canary-20261030/reports/results.json`. Livraison : `ink-explorer-release-ops-catalogue-polish-20261030/docs/LIVRAISON_2026-10-30.md`, candidat `5ac35d7c-6966-4a1a-8a88-c2679f313799`, secours `859993ed-da39-41d9-a58a-a8d318534c10`.

Les échecs restent conservés : anciens 503 inexpliqués, canari catalogue 30/32 lié pour sa nouvelle paire à une réponse externe de 6,1 s, retour arrière arrêté sur un snapshot de démarrage 503, puis erreur d'agrégation du premier canari cold-budget. Les deux dernières erreurs de procédure sont corrigées et les essais complets suivants réussissent. La confirmation ne prouve pas une disponibilité générale ou l'exhaustivité de l'index.

Bilan précédent archivé dans `RECAP_2026-10-30_catalogues.md`, et antérieur dans `RECAP_2026-10-30_recovery.md`. Sources et outils figés à ne pas modifier.
