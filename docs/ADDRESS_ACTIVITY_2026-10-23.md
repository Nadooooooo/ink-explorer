# Transactions d’une adresse : actualisation et stabilité

Source : `ink-explorer-activity-stability-20261023`.
Version publiée et vérifiée : `f80294c4-2c7f-42d9-bda4-264d0d08d447`, le 23 octobre à 18:35 UTC. Les phases globale et candidat de `reports/activity-stability/deployment/state.json` sont `verified`, et le processus final a terminé avec le code 0.

## Comportement

La liste des transactions d’une adresse reçoit les inclusions canoniques du flux du réseau sans recharger le document. Elle filtre l’expéditeur, le destinataire et le contrat créé. Un flux périmé, hors réseau ou incohérent ne fournit aucune nouvelle inclusion. Les résultats de l’indexeur enrichissent les lignes et apportent la pagination ; ils ne remplacent pas un statut attesté par une observation plus récente du nœud.

Les positions des lignes sont réutilisées pendant l’arrivée automatique. Quand une personne lit, utilise le clavier ou consulte l’historique, la liste garde son ordre et propose les nouvelles lignes par un bouton. Une inclusion invalidée dans la fenêtre de blocs observée laisse une place indisponible de même hauteur pendant cette lecture. Un lien focalisé ne devient donc pas silencieusement celui d’une autre transaction. Accepter les mises à jour supprime ces places et revient aux dernières transactions.

La pagination conserve la fin de la page indexée et son vrai curseur. Les réponses d’une autre adresse et les requêtes d’historique annulées lors d’une suspension sont rejetées. Une panne de l’indexeur conserve les lignes connues et permet une reprise sans recharger le document. Les inclusions observées sont bornées ; ce mécanisme ne constitue pas un index historique indépendant.

## Corrections trouvées pendant la validation

Le candidat précédent `b46c5714-63fd-46dd-b73a-b657e110e7a6` n’a jamais été activé pour les visiteurs. Son insertion de lignes provoquait des déplacements importants. Il a été retiré explicitement ; ne pas reprendre sa publication. Le rapport `DO_NOT_RESUME.json` est dans la source précédente. La nouvelle vérification de stabilité rejette aussi cette ancienne implémentation à 390 et 1440 px.

WebKit omettait des mots arabes dans les titres de colonnes sur la capture complète, malgré huit éléments visibles dans le DOM. La règle CSS `::first-letter` a été retirée. La suppression avant le premier affichage restaure les huit labels ; une simple surcharge de `text-transform` ne corrige pas le défaut. Le contrôle lit maintenant les pixels des huit zones de texte de la capture complète avant toute capture recadrée. La capture de référence défectueuse produit sept zones sans pixels de texte, ce qui fait échouer ce contrôle.

Le premier test de maintien du focus mesurait un lien situé hors de la fenêtre après une suite d’interactions avec horloge contrôlée. Le scénario place maintenant explicitement le lien au centre et vérifie sa visibilité avant de comparer sa position. Il conserve les assertions d’identité et de déplacement maximal de 1 px. Les rapports d’échec initiaux sont conservés.

## Preuves locales

Les rapports sont sous `reports/activity-stability/` :

- `models.log` : 35 tests de filtrage, fusion, invalidation et identité des positions.
- `artifacts-final.log` : 11 tests des documents et fichiers de la dernière compilation.
- `browser-final/results.json` : six scénarios Chromium, Firefox et WebKit, Mainnet à 320 px et Sepolia à 1440 px ; douze contrôles par scénario, dont panne, reprise, suspension, pagination, focus et accessibilité automatisée.
- `real-final/results.json` : six parcours avec API réelles ; trois nouvelles transactions par parcours rapprochées des reçus et blocs des RPC locaux. Un seul chargement de document par parcours. Les huit labels sont réellement peints dans les trois captures de bureau.
- `runtime-final/results.json` : deux observations de douze secondes, Chromium CPU ×4. Somme des déplacements : 0 à 390 px, 0,000675 à 1440 px. Les transactions continuent d’arriver. Ces échantillons ne sont pas des Core Web Vitals de visiteurs réels.

Les contrôles des transactions réelles, de peinture des labels et de stabilité sont également exigés sur le candidat Cloudflare avant activation, puis sur le domaine public. Les résultats publics restent distincts des résultats locaux.

## SEO et travail restant

`seo-public.json` contrôle les réponses HTTP, canoniques, directives d’indexation et sitemaps. Une requête avec un User-Agent Googlebot n’est pas un passage de Googlebot vérifié. L’URL de la liste des transactions est `/txs` ; `/transactions`, initialement essayé dans le diagnostic, n’est pas une route publiée. Une requête Python sans User-Agent de navigateur a reçu 403, tandis que les deux contrôles navigateur/Googlebot sur `/txs` ont reçu 200. Les autorisations du jeton Cloudflare n’ont pas permis de lire les règles WAF et Bot Management ; aucune protection n’a été modifiée.

La propriété Search Console, la soumission effective des sitemaps, l’inspection des URL et les impressions pour « ink explorer » restent à vérifier avec l’accès du propriétaire. Les contrôles techniques ne prouvent ni indexation ni première page. Références : https://developers.google.com/search/docs/monitor-debug/search-console-start et https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl .

Les autres onglets d’activité d’une adresse, les agrégats et données de marché ont leur propre cadence. Cette livraison concerne la liste des transactions, en complément du solde ETH déjà relié au flux. Les réorganisations historiques hors de la fenêtre observée, les téléphones physiques et les lecteurs d’écran réels restent à tester séparément.


## Résultat public et incident conservé

Les 72 contrôles de comportement et les six parcours de transactions réelles ont été validés avant et après activation. Chaque parcours réel vérifie trois nouvelles transactions via WebSocket et les rapproche des RPC locaux, avec un seul chargement de document. Le contrôle des huit labels passe dans les trois navigateurs de bureau. Les deux observations publiques de douze secondes comptent chacune douze nouvelles transactions ; les sommes de déplacements sont 0,001584 à 390 px et 0,001396 à 1440 px. Chacune compte aussi douze tâches longues sous CPU ×4 : leur réduction reste un axe de travail, distinct de la stabilité.

Le premier contrôle des fichiers à 0 % a trouvé cinq HTTP 404 pendant leur propagation. Les deux passages suivants ont validé 1145/1145 contrôles avant activation. Les moniteurs des fichiers servis aux visiteurs totalisent 1444 observations sans échec, depuis un seul emplacement, pendant environ trente minutes. Ils ne mesurent pas toutes les régions ni les API.

Après activation, le premier contrôle des documents a trouvé deux HTTP 503 sur la même transaction Sepolia, en anglais et en français, au délai de 2,5 s. Les huit langues suivantes de cette fiche ont répondu 200 dans cette même série. Les deux URL en échec ont ensuite répondu 200, et la transaction a été rapprochée du reçu RPC. La première réponse de suivi a pris 2163 ms, la seconde 57 ms. Ces observations sont compatibles avec une lecture initiale lente, sans trace d’origine permettant d’attribuer exactement le délai à un service particulier.

Le processus a été arrêté avec code 1 et les résultats conservés dans `publication-attempt-1/`. La reprise sur la même version immuable a validé les 80 documents puis toutes les suites publiques, sans assouplir les assertions. Ce succès ne supprime pas l’incident ; réduire ces indisponibilités initiales reste inscrit dans `NEXT_STEPS_2026-10-23.md`. Les deux moniteurs temporaires et la prévisualisation sont arrêtés ; les services de production n’ont pas été redémarrés.
