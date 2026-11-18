# Bilan courant — 30 octobre 2026

**Public : f802, serveur et Cloudflare Tunnel. Candidat local : transfer-recovery, 667 sources figées, non publié.** Aucun nouveau DNS, lanceur, redémarrage public ou code GitHub publié dans cette passe. L’accord déjà demandé attend toujours sa réponse. La migration qui évite le quota Worker est active ; les correctifs applicatifs récents ne sont pas encore sur le domaine.

## Réalisé

| Sujet | Travail réalisé | Preuve et portée |
| --- | --- | --- |
| Reprise après erreur initiale | La première lecture de transferts échouée réessaie automatiquement ; les reprises cessent après une page valide. | Défaut reproduit (une seule requête), puis 24 parcours contrôlés réussis. |
| Limitation de débit | Retry-After respecté, y compris en cliquant manuellement ; aucun contournement du délai partagé. | Cas 503/429, délais de 3/20 secondes, tentative manuelle avant le délai. |
| Retry manuel concurrent | La nouvelle tentative remplace la précédente ; sa réponse tardive ne peut plus écraser le résultat accepté. | Ancienne réponse réellement livrée après la nouvelle, transport de test ignorant AbortSignal. |
| Clavier | Le contrôle reste présent pendant les reprises. Un lien survivant garde le focus ; sinon le tableau, ou la section vide, le reçoit. | Perte du lien natif reproduite puis corrigée ; essais sur les trois moteurs. |
| HTML initial et fraîcheur | Une observation fraîche reste visible pendant un échec ; elle expire si l’attente se prolonge, puis une vraie réponse fraîche restaure la page sans reload. | 12 parcours de reprise avec seed, et 12 de relais HTML/interface ; écart maximal de géométrie : 0 px. |
| Candidats de mise à jour | Expiration, contrôle au clic, horloge monotone, N/A, reprise sur même tête de chaîne conservés depuis le parent. | Preuves du parent update-expiry, plus 36 tests pertinents réexécutés dans cette passe. |
| Régression des listes | Pagination, historique, filtres, erreur, suspension et mauvaise chaîne vérifiés. | 24 parcours de transferts réexécutés. Les 60 des cinq annuaires appartiennent au parent ; les quatre autres annuaires ne sont pas annoncés comme tous retestés ici. |
| Données réelles dans le navigateur | ERC-20/721/1155 comparés aux réponses API sur les deux réseaux, mobile et ordinateur. | 12 visites Chromium, nouveau frontend et API publiques inchangées. |
| Compilation | TypeScript et build complet réussis. | 667 sources figées, deux fichiers produit modifiés et un script ajouté depuis update-expiry. |
| Lecture réelle des index | Petite passe à froid/chaud réussie, puis renouvellements suivis sur les deux réseaux. | 8 documents, puis 28 documents/deux lectures API sur 140,449 secondes ; aucun échec dans ces fenêtres. Ce n’est pas une disponibilité générale démontrée. |
| Livraison couplée | Nouveau site relié aux nouvelles API vérifié. | 32/32 visites HTML (dont 12 sans JS) et 937 contrôles de livraison réussis ; 771 actifs/251 ressources immuables conservées. |
| Paquet et secours | Première livraison coordonnée et retour arrière préparés dans un magasin privé. | 12 tests de procédure et 24 contrôles des vrais paquets réussis, dont la continuité des nouveaux fichiers après retour arrière. |
| Production | f802 et huit PID/empreintes publics conservés, root/robots/sitemap 200. | Pas de lanceur installé, pas de publication ; ports temporaires arrêtés après les essais. |

La passe courante totalise 72 parcours contrôlés et 12 visites avec données réelles, selon les portées ci-dessus. Les échecs précédents sont conservés : deux dépassements de délai de 2,5 secondes sur Sepolia dans le canari update-expiry, et deux 503 encore plus anciens sans cause établie. Le nouveau canari réussi ne les efface pas. La correction de reprise dans le navigateur ne supprime pas un 503 du premier document quand l’index ne répond pas assez vite.

## Reste à faire

| Priorité | Tâche | Critère de fin |
| --- | --- | --- |
| 1 | Fiabiliser le premier document pendant les lenteurs/pannes de l’index. | Mesures des latences de queue, limitations et démarrages ; stratégie bornée justifiée, tests de panne et surveillance prolongée. Garder la fraîcheur et l’indisponibilité honnêtes. |
| 1 | Publier une fois prêt et explicitement autorisé. | Plan et rétention revus, empreintes valides, contrôle public HTML/API/cache CDN/WebSockets sur les deux réseaux, secours disponible. |
| 1 | Remplir les premiers HTML des autres annuaires. | Comptes, appels internes, dépôts/retraits, tokens, contrats et pools : données/liens SEO, reprise sans flash, fraîcheur et réseau vérifiés selon les sources disponibles. |
| 1 | Éprouver les arrivées extrêmes. | Connexion limitée, modules/API retardés, longue veille, offline/online, changement de réseau et navigation ; aucune ancienne réponse appliquée ni rechargement manuel nécessaire. |
| 2 | Revue ergonomique de chaque composant. | Recherche, menus, filtres, listes, fiches et erreurs ; espacement, densité, focus, zoom, contrastes et écrans étroits cohérents. Les captures de tests ne remplacent pas cette revue complète. |
| 2 | Achever les traductions. | Dix langues, notamment Amount encore anglais dans l’arabe ; pluriels, RTL, unités et parité HTML/interface. |
| 2 | Appareils et aides réels. | Safari iPhone, Android, tablette, portrait/paysage, zoom, VoiceOver/TalkBack/NVDA. Les moteurs automatisés ne prouvent pas ces appareils. |
| 2 | Performances des visiteurs. | Mesurer Core Web Vitals réels, mémoire, longues sessions et connexions lentes ; comparer avant/après optimisation. |
| 2 | Historiques et traces. | Reçus élagués, appels internes et types rares contrôlés ; lacunes explicites, sans déduire la complétude d’une première page non vide. |
| 2 | Provenance des autres agrégats. | Dates de calcul distinctes de l’heure HTTP, fenêtres 24 h et unités exactes. La cadence de totalBlocks a déjà son audit spécifique. |
| 2 | Identités et logos. | Nom, proxy, vérification et logos locaux établis sur preuves, licences conservées ; aucune identité inventée depuis un symbole. |
| 2 | Search Console. | Accès propriétaire, sitemap traité, inspections d’URL, exclusions corrigées et suivi des requêtes Ink Explorer. Aucune première place garantie. |
| 2 | Référencement utile. | Contenus exacts et distinctifs, maillage et liens pertinents ; conserver domaine, URL, titres, canoniques et langues. |
| 2 | Sauvegardes/restauration. | Restauration isolée documentée, données et clés conservées, surveillance et alertes éprouvées. |
| 2 | Redémarrage complet planifié. | Retour contrôlé des huit services, nœuds et Tunnel, sans restauration PM2 globale. L’unité activée ne prouve pas encore le test physique. |
| 3 | Livraisons suivantes. | Rotation des versions/ressources et reprise de transitions interrompues éprouvées au-delà de la première livraison coordonnée. |

## Références

- Produit courant : `ink-explorer-transfer-recovery-20261030/docs/TRANSFER_RECOVERY_2026-10-30.md`, synthèse `reports/recovery/summary.json`, 667 sources figées.
- Outils : `ink-explorer-release-ops-transfer-recovery-20261030/docs/LIVRAISON_2026-10-30.md`, neuf modules figés.
- Candidat : `a56e5fc5-b227-48c8-83d0-24c555047f79` ; secours : `6ec83b57-8971-4726-9903-dd6421fa5d29`.
- Canari couplé : `ink-explorer-transfer-recovery-canary-20261030/reports`, 657 sources présentes comparées, quatre adaptateurs déclarés et dix fichiers racine/configuration non copiés. Le manifeste du paquet contient les 667 sources.
- Diagnostics réels : `ink-explorer-transfer-cold-audit-20261030/REPORT.md` et `ink-explorer-transfer-latency-audit-20261030/REPORT.md`.
- Bilan précédent conservé : `RECAP_2026-10-30_expiry.md`. Les preuves des parents ne sont pas toutes présentées comme réexécutées ici.
