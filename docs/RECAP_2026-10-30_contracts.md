# Bilan courant — 30 octobre 2026

**La migration hors Worker est publique. Les nouveaux correctifs restent locaux et non publiés.** Version publique f802, serveur et Cloudflare Tunnel. Candidat courant : `ink-explorer-contract-directory-arrival-20261030`, 698 fichiers de code figés. Aucun DNS, lanceur public, redémarrage public ou code GitHub publié pendant cette passe.

## Réalisé

| Sujet | Travail réalisé | Vérification et portée |
| --- | --- | --- |
| Hébergement | Serveur via Cloudflare Tunnel, sans route Worker. | Déjà public ; les huit processus, les fichiers d'entrée et f802 sont inchangés. Accueil, robots.txt et sitemap publics : 200. |
| Contrats dès l'arrivée | Cinquante premières fiches réelles, noms, liens, langage et compilateur dans le premier HTML. | Deux réseaux, dix langues ; vingt documents, douze visites sans JS et douze parcours JS/pagination, avec les nouvelles API réunies au nouveau site en privé. |
| Identités | Vérification explicite exigée, proxy et implémentations identifiés, champs privés exclus. | Mauvais réseau, doublons, identités, alias et curseurs non sûrs rejetés ; métadonnées facultatives malformées inconnues. Treize unités spécifiques aux contrats. |
| Reprise des contrats | Le texte, les icônes, le focus et la géométrie survivent à l'activation. Les observations initiales expirées sont retirées ; reprise sans rechargement. | Douze parcours contrôlés, trois moteurs, français 320 px et arabe 1440 px, thèmes clair/sombre. Déplacement maximal mesuré : 0 px. Curseurs et Retry-After contrôlés. |
| Finitions visuelles | Survol sombre corrigé, langage préservé face aux compilateurs longs, alignement RTL cohérent. | Défaut de contraste détecté puis corrigé ; axe, débordements et texte vérifiés dans les douze parcours. |
| Cache API | Les premières listes de contrats rejoignent le cache de cinq secondes et sa grâce limitée à dix secondes. L'horodatage original est conservé. | 118 observations avec les vrais serveurs API isolés : 48 anciennes routes et 70 catalogues ; partage des actualisations et frontière dure contrôlés. |
| Statistiques et gas | Test historique du dépôt remis à jour selon les sources actuelles. | Douze parcours réexécutés : averageBlockTime détenu par l'index et oracle gas. Erreurs, âge, reprise, Retry-After, champs manquants et zéro réel. Les compteurs des nœuds ne sont pas simulés comme des compteurs d'index. |
| Autres premières pages | Tokens, transferts, comptes, appels internes, dépôts et retraits conservés et revalidés. | Canari : 32 tokens HTML/sans JS et douze avec JS/filtres ; 32 transferts ; 128 catalogues HTML/sans JS et seize avec JS. |
| Régressions | Arrivées tokens/transferts, détenteurs, inventaires, opérations utilisateur, marché, statistiques et quatre catalogues mobiles revérifiés. | 258 parcours contrôlés réexécutés ; les 36 inventaires utilisent l’adaptation externe du média. La série originale d'inventaire a un échec de vignette paresseuse, conservé et audité séparément. Pas de déclaration globale de réussite des anciens scripts. |
| Compilation | Build complet ; 480 documents et 80 cadres de fiches sans observation de chaîne figée. | 52 tests de logique/documents passent ; 776 ressources actives et 329 retenues. Les ressources servies par l'aperçu ont été comparées aux octets compilés. |
| Livraison et secours | Nouveau site et nouvelles API raccordés en privé ; paquets candidat et secours préparés. | Seize groupes du canari, 1 020 contrôles de livraison, treize tests de procédure et 36 contrôles des vrais paquets/secours réussis. Aucun lanceur public installé. |

Le plafond de quinze secondes des observations initiales de chaîne est distinct de la politique de marché/statistiques de 90 secondes. Ces dates décrivent la réponse source, sans prétendre dater un trade ni le calcul interne d'un agrégat. Les nouvelles pages filtrées ou paginées ne réutilisent pas l'observation de la première page.

## Reste à réaliser

| Priorité | Tâche | Critère de fin |
| --- | --- | --- |
| 1 | Premier HTML du catalogue complet des pools. | Parcourir toutes les pages de manière bornée, partager les règles de tri/filtres du navigateur et conserver une fraîcheur cohérente. Mainnet dépasse les cent premiers résultats ; ne pas afficher une tranche comme l'ensemble. |
| 1 | Intégrer la stabilisation du test de vignette NFT. | Attendre le résultat du média paresseux avant de comparer tout le texte de la carte ; garder toutes les assertions de données et conserver l'échec original. |
| 1 | Revoir les métadonnées hors annuaire des contrats. | Textes, icônes, logos et noms de DEX malformés ne provoquent ni crash ni identité inventée ; distinction pool/contrat/bytes32 conservée. |
| 1 | Étendre la mesure de disponibilité externe. | Latences de queue, erreurs, quotas, reprise et durée utile observées ; stratégie plus autonome si nécessaire. Un canari réussi ne prouve pas une disponibilité permanente. |
| 1 | Publier après demande explicite. | Revoir plan, santé, sources et rétention ; vérifier domaine public, HTML/API/CDN/WebSockets et retour arrière sur les deux réseaux. Aucun accord présumé. |
| 2 | Finir la revue des composants. | Recherche, navigation, filtres, tableaux, fiches, graphiques, erreurs et états vides ; noms très longs, zoom, densité, touchers et focus sur mobile, tablette et ordinateur. |
| 2 | Achever les dix langues. | Pluriels, libellés résiduels, unités, espaces, RTL et parité du texte entre HTML et interface. |
| 2 | Tester les appareils et aides réels. | iPhone, Android, tablette, clavier logiciel, orientation, verrouillage et VoiceOver/TalkBack/NVDA. Les moteurs automatisés ne remplacent pas ces contrôles. |
| 2 | Mesurer les performances des visiteurs. | Core Web Vitals, réseau lent, longues sessions, mémoire, premier document et comparaison avant/après. |
| 2 | Vérifier historiques et opérations rares. | Reçus élagués, traces, journaux, variantes d'opérations et couverture au-delà des premières pages. |
| 2 | Établir la provenance des agrégats. | Dates de calcul, fenêtres 24 h, unités et dénominateurs ; distinguer heure HTTP et date du calcul. |
| 2 | Compléter les identités et logos. | Noms et vérification fondés sur des preuves, ressources locales et licences ; aucune identité déduite du seul symbole. |
| 2 | Vérifier Search Console. | Accès propriétaire, sitemap traité, inspections, exclusions et requêtes suivies. Le classement Google n'est pas garanti. |
| 2 | Renforcer contenu et maillage utiles. | Informations exactes et distinctives, liens pertinents ; domaine, URL, canoniques et langues conservés. |
| 2 | Exercer sauvegarde et restauration. | Restauration isolée documentée, données et clés préservées, surveillance et alertes éprouvées. |
| 2 | Planifier le reboot complet. | Retour contrôlé des services, nœuds et Tunnel sans restauration PM2 globale. |
| 3 | Préparer les livraisons suivantes. | Rotation générique des versions et ressources, transitions interrompues, au-delà de la première livraison coordonnée. |

## Preuves et livraison

Rapport : `ink-explorer-contract-directory-arrival-20261030/docs/CONTRACT_DIRECTORY_2026-10-30.md`. Synthèse : `reports/contract-directory/summary.json`. Canari : `ink-explorer-contracts-canary-20261030/reports/results.json`. Outils : `ink-explorer-release-ops-contracts-20261030`, plan `plan-final.json`.

Candidat `7348b44b-575d-401b-93f1-7626d9729c5f` ; secours `88375acc-4235-4dbb-b5b0-b9e94078cbdb`. Neuf outils et 698 fichiers de produit figés, empreintes recontrôlées et ports temporaires fermés. Le canari compare 688 fichiers, avec dix fichiers racine/configuration non copiés et cinq adaptateurs déclarés, sans autre écart. Avant publication éventuelle : refaire le plan et la vérification de rétention ; des coupures brèves restent possibles pendant les trois redémarrages fork. Les cinq autres services et données partagées restent préservés.

Les échecs de diagnostic sont conservés, notamment contraste sombre, calcul de lignes sur line-height normal et vignette NFT en chargement ; le rapport distingue corrections et adaptation des tests. Les preuves antérieures sont archivées dans `RECAP_2026-10-30_tokens_parity.md` et les bilans plus anciens. Aucune perfection générale, totalité des appareils ou première page Google n'est revendiquée.
