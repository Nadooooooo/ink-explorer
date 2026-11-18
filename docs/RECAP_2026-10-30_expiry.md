# Bilan — 30 octobre 2026

Le site public reste sur **f802**, hébergé sur le serveur via Cloudflare Tunnel. La migration qui évite le quota Worker est déjà active. Les correctifs applicatifs ci-dessous sont dans un candidat local, **pas encore en ligne**. Aucun nouveau DNS, lanceur, redémarrage public ou code GitHub publié dans cette passe. L’accord de publication déjà demandé est toujours sans réponse ; ne pas reposer la question automatiquement.

## Travail réalisé

| Tâche | Résultat | Portée |
| --- | --- | --- |
| Expiration des mises à jour en attente | Un ancien candidat ne peut plus être appliqué après sa limite ; N/A remplace le contrôle et une réponse fraîche le réactive. | Validé localement. |
| Horloges et preuve de fraîcheur | Échéance monotone, métadonnées hors payload, contrôle au clic ; précision de Date HTTP bornée prudemment. | Recul de l’horloge testé ; rien n’est ajouté aux exports/signatures. |
| Accessibilité du contrôle expiré | Position clavier conservée avec aria-disabled, refus d’application, retour au tableau ; pagination stable. | Parcours contrôlés Chromium/Firefox/WebKit. |
| Premier HTML des transferts | Correctifs du parent conservés : vraies lignes, liens, focus et géométrie repris sans disparition, réponse fraîche tardive acceptée. | Douze parcours de relais réexécutés : écart maximal 0 px. |
| Régression des annuaires | 60 parcours communs et 12 avec filtre réussis : cinq annuaires, deux réseaux, trois moteurs, mobile et ordinateur. | Contrôles de pagination, erreurs, historique, réseau, suspension et réponse tardive. |
| Expiration dans les navigateurs | 24 parcours réussis, avec et sans filtre, y compris tête de chaîne identique et contrôle sélectionné. | 320 px français clair et 1 440 px arabe sombre. |
| Données réelles de transferts | 12 visites réussies ERC-20/721/1155 sur les deux réseaux à 390/1 440 px. | Chromium, première page comparée à l’API ; complétude non déduite. |
| Logique et compilation | 72 tests, TypeScript et build réussis. | Sources de cette passe. |
| Ressources et livraison | 771 actifs, 237 fichiers immuables conservés ; 923 contrôles de livraison réussis. | Nouveau site et nouvelles API isolés ; les visites HTML comportent le problème ci-dessous. |
| Retour arrière | 12 tests de procédure et 24 contrôles des vrais paquets/secours réussis. | Paquets privés, non installés ; ancien code conserve les nouveaux fichiers. |
| Protection de la production | Huit PID et empreintes des entrées conservés, f802 inchangée, racine/robots/sitemap 200. | Vérifications publiques et locales en lecture seule. |
| Diagnostic de disponibilité | Deux nouveaux 503 Sepolia attribués au dépassement du délai de document de 2 500 ms avant les en-têtes. | Canari conservé en échec : 30/32 visites HTML. Les deux 503 du parent restent inexpliqués. |

## Reste à faire, par priorité

| Priorité | Tâche | Critère de fin |
| --- | --- | --- |
| 1 | Fiabiliser le premier chargement des transferts, notamment le démarrage de l’index Sepolia. | Mesures des lectures à froid/chaud, stratégie bornée justifiée, tests de panne et observation prolongée ; pas de données périmées annoncées fraîches. |
| 1 | Installer et publier le candidat une fois prêt et explicitement autorisé. | Nouveau plan revu, rétention valide, contrôle public du HTML, API, cache CDN et WebSockets sur les deux réseaux, secours éprouvé. |
| 1 | Étendre le contenu réel du premier HTML aux autres annuaires. | Comptes, appels internes, dépôts/retraits, tokens, contrats et pools : liens/SEO, reprise sans flash, fraîcheur et réseau vérifiés. Choisir les routes selon leur utilité et leurs sources disponibles. |
| 1 | Éprouver les arrivées très lentes et les restaurations d’onglets. | Réseau limité, scripts ou API retardés, offline/online, changement de réseau, historique du navigateur ; ni rechargement manuel requis ni ancienne donnée réappliquée. |
| 2 | Poursuivre la revue ergonomique composant par composant. | Recherche, menus, tableaux/cartes, filtres, détails, listes vides/erreurs, zoom et clavier ; pas de débordement, informations prioritaires lisibles. |
| 2 | Achever les traductions visibles. | Réviser les dix langues, dont le libellé Amount encore anglais dans l’arabe, pluriels, RTL et unités ; parité HTML/interface. |
| 2 | Tester les appareils et aides réels. | Safari sur iPhone, Android et tablette, portrait/paysage, zoom, VoiceOver/TalkBack/NVDA. Les tests WebKit actuels ne remplacent pas ces appareils. |
| 2 | Mesurer les performances des visiteurs. | Core Web Vitals réels, mémoire, longues sessions et faibles connexions ; optimiser à partir de mesures, puis comparer avant/après. |
| 2 | Revoir les historiques et traces. | Reçus élagués, appels internes et types moins fréquents contrôlés ; lacunes explicites, pas de déduction de complétude depuis une première page non vide. |
| 2 | Établir la provenance et les dates de calcul des autres statistiques. | Distinguer heure HTTP, heure de source et calcul ; fenêtres 24 h exactes, unités et comparaisons justifiées. Le totalBlocks a déjà sa mesure spécifique. |
| 2 | Compléter les identités et logos sur preuve. | Nom, proxy et vérification exacts, assets locaux et licences ; éviter toute identité déduite d’un simple symbole. |
| 2 | Exploiter Search Console. | Accès propriétaire, sitemap soumis et traité, rapports d’indexation, inspections d’URL, corrections des exclusions et suivi des requêtes Ink Explorer. Aucune première place garantie. |
| 2 | Développer le référencement utile. | Contenus exacts et distinctifs, maillage interne, sources/liens pertinents et suivi de l’indexation ; domaine/URL/canoniques/langues conservés. |
| 2 | Tester sauvegardes et restauration. | Restauration isolée documentée, dépendances, données et clés conservées, surveillance et alertes effectives. |
| 2 | Programmer un redémarrage complet contrôlé. | Démarrage sélectif des huit services, nœuds et Tunnel vérifiés, sans restauration PM2 globale. L’unité activée ne prouve pas à elle seule ce test physique. |
| 3 | Étendre l’outillage aux livraisons suivantes. | Rotation/collecte des anciennes ressources et versions, migrations interrompues et retours arrière futurs éprouvés. La procédure actuelle cible la première livraison coordonnée. |

## Références courantes

- Produit : `ink-explorer-update-expiry-20261029`, **666 sources figées** ; rapport `docs/UPDATE_EXPIRY_2026-10-30.md`, synthèse `reports/update-expiry/summary.json`.
- Livraison : `ink-explorer-release-ops-update-expiry-20261030`, neuf modules figés, rapport `docs/LIVRAISON_2026-10-30.md`.
- Candidat : `1c84d8b6-0e9c-4cbf-8803-8a9770e1fa66` ; secours : `81fddb7a-407c-4fe7-be6b-c422e8f18295`.
- Canari couplé : `ink-explorer-update-expiry-canary-20261030/reports`. Résultat global en échec malgré le contrôle de livraison réussi ; ne pas le transformer en réussite.
- Les preuves des parents restent dans leurs propres répertoires et ne sont pas toutes réannoncées comme réexécutées sur ce bundle.
