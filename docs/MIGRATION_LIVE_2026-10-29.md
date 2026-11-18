> Ce document décrit la migration du 29 octobre. La livraison suivante est consignée dans le [rapport du 9 novembre](DELIVERY_2026-11-09.md).

# Migration publique — 29 octobre 2026

Ink Explorer est désormais servi par le serveur local au travers de Cloudflare Tunnel. Les domaines `inkexplorer.xyz` et `www.inkexplorer.xyz` sont des CNAME proxifiés vers le Tunnel du site. Le compte Cloudflare ne comporte plus de rattachement de ces domaines au Worker ni de route Worker pour cette zone. Le trafic public de ce site contourne ainsi les exécutions du Worker.

La version visuelle publique reste `f80294c4-2c7f-42d9-bda4-264d0d08d447`, avec le même build, les mêmes URL et le même rendu. Aucun candidat de refonte ni code GitHub n'a été publié. La source active est `ink-explorer-server-20261027`, service `inkexplorer-site` sur `127.0.0.1:4197`. Les API et la passerelle conservent leurs sources et ports existants.

## Validation publique

- 690 contrôles réussis : 500 documents Mainnet/Sepolia dans dix langues, 180 fichiers rapprochés des empreintes, sitemaps, API, connexions WebSocket soutenues, cache et protection des fichiers privés.
- 22 parcours d'arrivée réussis dans Chromium, Firefox et WebKit : 320/768/1440 px, langue arabe, saisie et recherche natives sans JavaScript, polices agrandies.
- Six parcours réels d'activité, trois moteurs et deux réseaux : transactions apparues sans rechargement et rapprochées des reçus/blocs des nœuds. Un seul document par parcours.
- Huit documents de blocs, transactions, adresses et tokens contiennent leurs données et liens dans le HTML sans exécuter JavaScript ; réponses 200 et no-store, identité/réseau/canonique contrôlés.
- Surveillance de trois minutes : 35 observations, zéro erreur d'hébergement et zéro erreur des snapshots, {'57073': 35, '763373': 35} têtes distinctes. Durée maximale des deux documents sondés : 111 ms. Mesure depuis ce serveur seulement, sans preuve de Core Web Vitals terrain ni de classement Google.

Les preuves sont sous `reports/server-migration/` : `public-boundary/`, `public-home-final/`, `public-activity-real/`, `public-record-html-20261029.json`, `public-hosting-monitor/`, `cloudflare-current.json` et `tunnel-health-20261029.json`. Le dernier état a été confirmé à 2026-10-29T15:48:51.317736+00:00.

## Cache et démarrage

Les fichiers portant une empreinte restent cacheables un an et immuables ; les logos et autres ressources mutables gardent une heure. Les pages stables utilisent le cache serveur de60 secondes avec séparation hôte/langue/réseau ; les fiches et API restent no-store. Les réponses publiques sont compressées par Cloudflare. Le réglage de cache navigateur est passé de quatre heures forcées à « respecter les en-têtes ». Les réécritures automatiques de liens HTTPS et l'obfuscation des emails ont été désactivées pour préserver le rendu et les ETags ; la redirection HTTP→HTTPS reste active et vérifiée. Les réglages avant/après sont archivés dans `cache-settings-*-20261029.json`.

Le serveur reconnaît maintenant les ETags faibles produits par la compression Cloudflare et les listes If-None-Match ; la revalidation publique renvoie 304. Deux tests ciblés de ce parseur passent. Les contrôles des domaines, du cache par hôte et des cibles HTTP restent actifs. Le build `dist` a été revérifié et conserve ses empreintes.

Le démarrage ciblé est activé comme unité systemd utilisateur `inkexplorer-public-bootstrap.service`, avec `Linger=yes` déjà présent sur ce serveur. Le premier lancement a préservé les huit processus Ink existants, sans restaurer le dump PM2 global. Huit tests refusent un démarrage désactivé, incomplet, incorrect ou sans persistance. `scripts/public_boot_proof.py` vérifie le contenu exact de l'unité installée et son état actif/terminé. Un redémarrage physique complet du serveur n'a pas été effectué.

## Incidents conservés

Le premier contrôle provisoire a détecté la politique Cloudflare de quatre heures et la disparition des ETags ; la correction du réglage et du parseur a été suivie d'un contrôle provisoire intégral690/690.

La première bascule a été annulée automatiquement : l'API Cloudflare a renvoyé une réponse vide après le détachement de www, alors que le script attendait du JSON. Les deux rattachements ont été restaurés et vérifiés. Le client accepte désormais une réponse 2xx vide uniquement pour DELETE, vérifie ensuite que le domaine est réellement détaché, et garde les erreurs pour les lectures/écritures nécessitant un résultat. Quatre tests de réponses API et sept simulations de bascule/retour arrière passent. L'état du premier essai est archivé dans `cutover-empty-delete-response-20261029.json`.

La seconde bascule a commencé à `2026-10-29T15:42:57.875287+00:00`. Une réponse 522 a été observée pendant le changement du rattachement principal, avant création du CNAME ; les contrôles après fin de bascule sont ensuite passés. Ne pas présenter cette opération comme sans interruption.

Le premier contrôle d'arrivée public a expiré sur WebKit après huit parcours réussis. Un diagnostic distinct a reçu 200 avec le HTML attendu et sans erreur JavaScript ; sa capture a expiré parce que le module était volontairement retenu et que l'outil attendait les polices. La seconde matrice complète passe 22/22. Les échecs sont conservés, pas supprimés.

## Retour arrière et suite

Le Worker et sa version sont conservés. Pour restaurer le routage, utiliser `python3 scripts/migrate-public-hosting.py rollback`, puis vérifier les URL publiques. Le script préserve les modifications concurrentes de DNS et archive le résultat. La politique de cache améliorée reste en place ; ses anciennes valeurs sont sauvegardées séparément.

Le moniteur PM2 existant poursuit les contrôles. Search Console et les positions Google ne sont pas attestés : propriété, soumission des sitemaps et inspection des URL restent à réaliser avec l'accès du propriétaire. Les essais sur appareils et lecteurs d'écran physiques restent ouverts.

Les améliorations frontend locales restent distinctes. Le candidat figé `ink-explorer-integration-20261028` était validé localement ; `ink-explorer-directory-arrival-20261028` contient des changements plus récents dont le build et les tests finaux restent à terminer. Toute future livraison devra cibler le serveur actif avec une procédure de release/retour arrière adaptée, sans réintroduire les rattachements Worker.
