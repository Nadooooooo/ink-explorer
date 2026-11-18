# Migration d’Ink Explorer vers le serveur

État au 29 octobre : **migration effectuée et validée publiquement**. Root et www passent par Cloudflare Tunnel vers `ink-explorer-server-20261027`, loopback `127.0.0.1:4197` (PM2 `inkexplorer-site`). La version visuelle f802 reste identique ; le Worker est conservé pour retour arrière. Les API 4194/4196 et la passerelle 4195 sont conservées. Le rapport courant est `MIGRATION_LIVE_2026-10-29.md` ; les sections historiques ci-dessous gardent les observations antérieures.

## Droit Tunnel résolu le 29 octobre

La permission **Cloudflare Tunnel — Modifier** est maintenant prise en compte. Le Tunnel est sain et les deux domaines publics sont basculés, sans rattachement ni route Worker pour cette zone. Les anciens refus 403 restent consignés dans les sections datées. Le jeton existant demeure dans son fichier privé.

Documentation : https://developers.cloudflare.com/api/resources/zero_trust/subresources/tunnels/subresources/cloudflared/methods/create/ .

## Conservation du contenu et du SEO

Le dossier `dist` est une copie exacte de la version publiée, vérifiée avec son manifeste SHA-256. Le service Node appelle le même rendu que le Worker : accueil et rubriques avec HTML initial, fiches remplies à la requête, titres, langues, canoniques, données structurées, robots, sitemaps et redirections. Le domaine et les chemins restent inchangés. Le HTML des aperçus porte un en-tête noindex ; le domaine principal conserve sa politique d’indexation.

Google recommande de préparer et tester le nouvel hébergement avant de changer le DNS, puis de surveiller son accès et Search Console : https://developers.google.com/search/docs/crawling-indexing/site-move-no-url-changes . Le changement d’hébergement ne constitue pas une preuve d’indexation ou de classement.

## Cache et données

- Fichiers nommés par empreinte : un an et immutable, disponibles pour le CDN et le navigateur ; autres fichiers statiques : une heure.
- Documents stables sans filtre : cache serveur de 60 secondes, clé par réseau, chemin et langue ; aucun contenu de chaîne observé n’est incorporé à ces structures compilées. Le navigateur revalide les documents ; ETag et HEAD sont pris en charge.
- Fiches et API de données : no-store. Les flux WebSocket traversent directement le service et la passerelle locale.
- Les médias conservent la politique propre aux images. Les filtres ne réutilisent pas le document d’une vue par défaut.

Le cache HTML au CDN demanderait une règle de cache supplémentaire ; le jeton n’a actuellement pas accès aux règles. Le cache des pages est assuré sur le serveur et celui des fichiers statiques par les en-têtes et le comportement CDN standard.

## Preuves préparatoires

Sous `reports/server-migration/` :

- `local-boundary/results.json` : 692 contrôles réussis, dont 500 documents (10 langues, Mainnet/Sepolia), 180 fichiers exacts, sitemaps, redirections, cache, API et WebSockets maintenus plus de douze secondes.
- `local-home/` : 22 scénarios d’arrivée réussis sur trois navigateurs.
- `local-activity-real/results.json` : six parcours réels, trois navigateurs, transactions rapprochées des RPC.
- `local-reconnect/results.json` : quatre redémarrages réels du nouveau service, PID changé, nouvelle WebSocket et nouveaux blocs, un seul chargement de document ; reprises observées entre 1,4 et 1,9 seconde. Les services publics historiques n’ont pas été redémarrés.
- `local-record-html.json` : huit documents de fiches remplis, accessibles sans exécution JavaScript, identités et réseaux comparés au RPC.
- `rollback-tests.log` : sept simulations, dont panne DNS après retrait d’un rattachement Worker, Tunnel indisponible et protection des modifications concurrentes.
- `bootstrap-tests.log` : six tests du démarrage sélectif, dont préservation des services en ligne et rejet des mauvais ports ou sources avant/après lancement.
- `local-hosting-monitor/summary.json` : moniteur HTTP testé sur le service local ; documents, fichiers exacts et snapshots des deux réseaux, cinq observations sans échec.
- `bootstrap-check.json`, `bootstrap-unit-check.log` : configurations des services existants contrôlées et unité dédiée vérifiée ; son installation/activation reste à effectuer avant la bascule.
- `cloudflare-before.json`, `cloudflare-current.json`, `dns-permission-check.json` : états de routage et droits vérifiés.

Les premiers échecs de test sont conservés. Le client HTTP de test ignorait Host et atteignait donc la politique noindex de l’aperçu ; il a été remplacé par le client HTTP natif pour les simulations de domaine. Le premier test PM2 ciblait un nom de fichier ambigu. Le test cible désormais le seul service du site avec `pm2 restart inkexplorer-site`.

## Exécution après ajout du droit Tunnel

Depuis la racine du projet, fournir les identifiants du compte et de la zone dans `CLOUDFLARE_ACCOUNT_ID` et `CLOUDFLARE_ZONE_ID`. Définir `INK_MIGRATION_PREVIEW_HOST` avec le nom de domaine provisoire.

```bash
python3 scripts/migrate-public-hosting.py prepare
pm2 start ./ecosystem.site.config.cjs --only inkexplorer-tunnel --silent
```

`prepare` crée ou retrouve uniquement le Tunnel nommé `inkexplorer-public-server`, configure trois hôtes vers 4197 et ajoute le domaine provisoire de validation. Le jeton du connecteur est écrit en mode 600 dans `runtime/`, exclu de Git. Attendre que le Tunnel soit healthy avant la suite. Le service général pm2-ubuntu est désactivé : ne pas l’activer globalement. Le service dédié ci-dessous démarre uniquement les processus nécessaires à Ink, avec leurs configurations de production exactes, en préservant ceux déjà en ligne. Son activation est exigée avant de changer le DNS. L’unité utilisateur est employée sur ce serveur, avec Linger=yes déjà activé ; le contrôleur vérifie son contenu exact et son exécution réussie. Le mode système reste accepté si son unité correspond à la configuration prévue.

```bash
BASE_URL="https://$INK_MIGRATION_PREVIEW_HOST" MIGRATION_TEST_OUTPUT=reports/server-migration/stage-boundary node scripts/public-site-migration-test.mjs
BASE_URL="https://$INK_MIGRATION_PREVIEW_HOST" ARRIVAL_OUTPUT=reports/server-migration/stage-home node scripts/home-arrival-browser-test.mjs
BASE_URL="https://$INK_MIGRATION_PREVIEW_HOST" ADDRESS_ACTIVITY_REAL_OUTPUT=reports/server-migration/stage-activity-real node scripts/address-activity-real-test.mjs
install -m 644 ops/inkexplorer-public-bootstrap.user.service ~/.config/systemd/user/inkexplorer-public-bootstrap.service
systemctl --user daemon-reload
systemctl --user enable --now inkexplorer-public-bootstrap.service
python3 scripts/public_boot_proof.py
python3 scripts/migrate-public-hosting.py activate
```

La bascule refuse un Tunnel non sain, une validation locale ou provisoire incomplète, un changement de Worker depuis la copie, un démarrage automatique non activé et un rattachement concurrent. Elle traite www puis le domaine principal. En cas d’échec pendant cette opération, elle essaie de restaurer les rattachements initiaux et enregistre les éventuels conflits sans les écraser.

Après la bascule, vérifier la propagation, les en-têtes `x-ink-hosting: server`, le HTTPS et www, puis :

```bash
BASE_URL=https://inkexplorer.xyz MIGRATION_PUBLIC=1 MIGRATION_TEST_OUTPUT=reports/server-migration/public-boundary node scripts/public-site-migration-test.mjs
BASE_URL=https://inkexplorer.xyz ARRIVAL_OUTPUT=reports/server-migration/public-home node scripts/home-arrival-browser-test.mjs
BASE_URL=https://inkexplorer.xyz ADDRESS_ACTIVITY_REAL_OUTPUT=reports/server-migration/public-activity-real node scripts/address-activity-real-test.mjs
python3 scripts/migrate-public-hosting.py status
```

Confirmer que les deux domaines ont un CNAME vers le Tunnel et n’ont plus de rattachement au Worker. Conserver le Worker et ses fichiers pour le retour arrière. Ne déclarer la migration terminée qu’après les contrôles publics. Les observations depuis ce serveur ne couvrent pas toutes les régions.

## Retour arrière

```bash
python3 scripts/migrate-public-hosting.py rollback
```

Cette commande supprime uniquement les CNAME du Tunnel encore conformes au changement prévu et rétablit les rattachements Worker archivés. Les modifications d’un autre opérateur sont préservées et signalées. Contrôler ensuite les réponses publiques. Pour redémarrer le seul service du site, utiliser son nom PM2 explicite.

## Suivi et tâches suivantes

Le moniteur de production existant continue de vérifier les mêmes URL, les réseaux et les données. Après activation, ajouter les observations spécifiques d’hébergement, confirmer le cache CDN statique et surveiller les 4xx/5xx, délais et reconnexions. L’accès propriétaire Search Console est toujours nécessaire pour suivre l’exploration, les exclusions et les positions.

La liste `NEXT_STEPS_2026-10-23.md` reste ouverte : onglets secondaires d’adresse, tokens/NFT et opérations utilisateur, fraîcheur des agrégats et frais 24 h, coût des rendus et tests d’appareils/aides réels. La migration conserve la version publique actuelle ; ces changements produit doivent être livrés ensuite, séparément.


Le script `public-hosting-monitor.mjs` refuse de commencer ses sondes répétées si la cible ne présente pas le nouvel hébergement. Après validation publique, il permet une observation bornée sans dépenser à nouveau le quota du Worker par erreur :

```bash
BASE_URL=https://inkexplorer.xyz HOSTING_MONITOR_OUTPUT=reports/server-migration/public-hosting-monitor HOSTING_MONITOR_DURATION_MS=600000 node scripts/public-hosting-monitor.mjs
```

La préparation d’un Tunnel déjà présent conserve ses applications et réglages étrangers à cette migration ; une application existante pour nos hôtes vers un autre service provoque un arrêt. Chaque hôte transmet son Host exact au serveur.

## Mise à jour API séparée à 07:00 UTC

Le backend de production a reçu une correction compatible avec le frontend publié : deux fichiers dans sa source existante permettent de rendre les informations confirmées des transactions récentes avant les métadonnées lentes de l’indexeur. Le build frontend, cette copie de rendu et les URL restent inchangés. La source de cette livraison et son retour arrière sont dans `ink-explorer-transaction-core-verified-20261027/docs/TRANSACTION_CORE_2026-10-27.md`.

Après cette livraison, `local-boundary-after-api-update/results.json` repasse les 692 contrôles. `local-record-html.json` a été actualisé et contient huit documents vérifiés sans JavaScript après le changement. Les connexions WebSocket publiques et les deux fiches publiques de transaction passent également. Le quatrième essai de création du Tunnel reste refusé : aucune bascule DNS n’a eu lieu. Cette amélioration d’API ne résout pas le quota du Worker.

Le contrôle de production indépendant voit un cœur sain mais deux agrégats de blocs en retard d’environ 66 minutes. Ce point concerne les statistiques et reste ouvert ; les documents de migration ne doivent pas être lus comme une garantie que tous les index et agrégats sont actuels.


## Contrôle à 08:16 UTC

Le cinquième essai de création du Tunnel reste refusé (403), avant création de tout hôte provisoire. Le routage root/www demeure celui du Worker f802 et l’accueil public répond 200, indexable, avec la même version. Les sept processus Ink existants sont en ligne. Les améliorations locales de frais décrites dans `ink-explorer-rolling-fees-20261027/docs/ROLLING_FEES_2026-10-27.md` restent séparées de cette copie de migration. Aucun changement de DNS public ni nouvelle livraison de frontend n’a eu lieu.


## Transactions historiques : API activées le 27 octobre à 09:00 UTC

La limite de 120 secondes du secours fondé sur les reçus est retirée. Les reçus conservés restent rapprochés de deux lectures canoniques et d’un nœud courant ; un reçu élagué reste indisponible. Un premier document Sepolia avait effectivement échoué à 2,5 s pendant l’audit. La correction est active sur les deux API, avec deux documents publics vérifiés à environ 390/368 ms, reprise sans rechargement et huit documents de la copie serveur revalidés sans JavaScript. Frontend f802 et routage Worker restent inchangés.

Source figée : `ink-explorer-historical-core-20261027`, détail `docs/HISTORICAL_CORE_2026-10-27.md`, état `reports/historical-core/deployment/state.json`. Elle incorpore les sources frontend du candidat secondaire toujours non publié. Le retour arrière API récent est conservé dans cette nouvelle source ; ne pas utiliser l’ancien script qui supprimerait tout le module sans vérifier cette nouvelle version. Les reçus historiques élagués restent une tâche distincte.


## Point de reprise à 10:00 UTC

Le sixième essai de création de Tunnel, vers 09:38 UTC, a encore reçu HTTP 403/code 10000. Aucun domaine provisoire ni routage web n’a été créé. Le jeton doit autoriser une des permissions de compte acceptées par l’API : `Cloudflare Tunnel Write`, `Cloudflare One Connectors Write` ou `Cloudflare One Connector: cloudflared Write` (intitulé « Modifier » dans l’interface).

Les API sont actives avec le secours historique ; la copie serveur reste celle du frontend public f802. Le dernier candidat visuel séparé est `ink-explorer-log-layout-20261027`, figé et non publié, avec 825 contrôles de livraison locale. Les prévisualisations 4326/4327 sont arrêtées. La liste des tâches a été consolidée dans `NEXT_STEPS_2026-10-23.md` pour distinguer préparation locale, livraison effective et validation encore requise.

À 09:51 UTC, le moniteur voit un cœur sain et des listes courantes, mais les agrégats bruts de blocs ont environ 112 minutes de retard sur les deux réseaux. Cette alerte reste ouverte.


## Vérification directe des agrégats à 10:03 UTC

Deux lectures par réseau espacées de 17 secondes ont comparé l’API locale et le service statistique officiel, avec le dernier bloc du nœud et le bloc correspondant à la valeur du compteur. Les 18 valeurs de chaque réponse locale sont identiques à celles de la réponse directe du fournisseur dans les quatre comparaisons ; les horodatages de récupération locaux progressent. La route locale utilise un cache de 15 secondes. Les réponses directes portent `cf-cache-status: DYNAMIC`, sans date de calcul dans leur corps.

Le fournisseur a actualisé les compteurs depuis le constat de 09:51 UTC : les écarts par rapport à la hauteur courante sont revenus à 173/180 blocs puis 190/197 blocs (environ trois minutes sur ces chaînes). Le moniteur à 10:02 UTC est de nouveau sain, avec zéro échec consécutif. Les heures de ces blocs sont des repères approximatifs du compteur, pas une date de calcul annoncée par la source ; un compteur de blocs et une hauteur peuvent différer d’un bloc selon l’inclusion de la genèse.

Ces observations soutiennent un calcul amont périodique ; elles ne déterminent pas son intervalle exact et ne prouvent pas la fraîcheur des autres métriques. Le retard précédemment observé n’est pas effacé des rapports. La provenance préparée reste utile, et aucune modification de cache ou de seuil d’alerte n’a été faite.

Preuves : `reports/server-migration/aggregate-source-audit/results.json`, `inspect.mjs`, `inspect.log` et `monitor-after.json`. Cette vérification utilise les API locales et les sources officielles, sans requêtes supplémentaires au Worker public.


## Protection du serveur activée le28 octobre

Le contrôle de cible HTTP avant cache et les clés séparées par hôte ont été activés uniquement sur le service préparatoire 4197. Build f802 et DNS inchangés ; 692 contrôles de frontière et24 de cache passent après redémarrage. Les38 cas malformés/preview ont été testés sur copie isolée. État/sauvegarde/retour arrière : `reports/server-migration/cache-guard-20261028/`. Le septième essai de Tunnel reçoit toujours403/code 10000. Le dernier candidat frontend est désormais `ink-explorer-integration-20261028`, non publié ; la liste actuelle est `NEXT_STEPS_2026-10-28.md`.
