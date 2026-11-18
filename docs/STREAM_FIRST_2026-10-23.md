# Listes disponibles avant la réponse de l’historique

Source : `ink-explorer-stream-first-20261023`.
Version Cloudflare publiée et vérifiée : `228e0c19-e8b6-462e-9e4b-4f503080f7c7`. Les deux étapes de publication sont `verified` et le processus a terminé avec le code 0. Rapport : `reports/stream-first/manifest.json`.

## Défaut reproduit

Avec la version `ec326f59-d322-41c4-9df0-4bf760fd4c3f`, quatre parcours contrôlés (blocs/transactions sur Mainnet/Sepolia) reçoivent une tête courante du flux mais n’affichent aucune ligne tant que la première réponse de l’indexeur attend. Une erreur 503 remplace ensuite la liste par une erreur générale. Preuve : `reports/stream-first/before/results.json`. Ce sont des données simulées, pas des pannes constatées du serveur public.

## Correction

Les listes récentes utilisent les blocs et transactions du flux validé dès réception. L’historique apporte ensuite les noms, méthodes et curseurs. Une indisponibilité de cette source conserve les lignes du flux et présente un avis compact avec reprise locale. Aucun curseur n’est créé avant la réponse de l’historique.

La fusion conserve toutes les lignes de la page indexée en plus de la fenêtre récente : limiter simplement l’ensemble à cinquante aurait supprimé sa fin avant le curseur suivant. Pendant la lecture, seuls les détails des mêmes identifiants sont enrichis ; les nouvelles lignes attendent l’acceptation ou la fin de la lecture. Les pages historiques, les filtres et les blocs remplacés conservent leur périmètre.

La reprise respecte le délai imposé par l’API. Son attente est annulable lors d’une navigation ou suspension. Le bouton indique l’attente ; il ne recharge pas le document et ne contourne pas la protection contre les appels répétés. Le retour explicite aux éléments les plus récents quitte l’état de lecture de la page historique.

## Validation à conserver

- Les essais unitaires couvrent fusion, remplacement canonique, identité des contrats, curseurs, ordre, annulation et temporisation API.
- Les scénarios contrôlés couvrent les trois moteurs, les deux réseaux, 320 px en français et 1440 px en arabe : indexeur lent, erreur/reprise, contrôle des lignes pendant la lecture, changement de périmètre, pagination, suspension et dimensions des boutons. Ils incluent un contrôle axe des erreurs sérieuses/critiques.
- Le scénario avec flux réel bloque uniquement les requêtes de liste à l’indexeur ; les autres API et le WebSocket restent réels. Chaque première ligne est rapprochée du RPC local. Il ne constitue pas un test sans interception.
- Les premiers rapports d’échec restent conservés : temporisation 503 non prise en compte par le bouton, contrôle de reprise coupé à 320 px, retour aux dernières transactions encore retenu par le focus, cible d’aide trop basse sur ordinateur. Des tests de pré-rendu lancés avant la fin de leur génération ont également échoué ; ils sont relancés une fois le build achevé.

## Écart découvert sur le candidat Cloudflare

Le premier passage du test contrôlé public a été arrêté avant activation : quatre cas WebKit attendaient exactement une requête initiale, alors que le document du Worker précharge déjà `/api/explorer/blocks`. Le navigateur envoyait un préchargement puis la requête applicative. Le scénario ne retenait que la première réponse et ne représentait donc plus une indisponibilité complète de l’historique. Les rapports d’échec restent dans `reports/stream-first/staged-initial-failure`.

Le scénario corrigé retient toutes les requêtes initiales et exige zéro réponse d’historique lorsque les premières lignes sont visibles. Les six cas WebKit ont ensuite réussi sur le même candidat, sans modification de ses fichiers publiables. Les types et URL de requêtes sont enregistrés dans `reports/stream-first/staged-webkit-preload/results.json`. La reprise repasse ensuite les contrôles requis ; aucune validation antérieure n’est présentée comme suffisante à elle seule.

## Résultat final

La compilation et les 58 tests unitaires sont réussis. Les 18 scénarios contrôlés passent localement, sur le candidat, puis après activation. Les 12 parcours avec indexeur coupé passent avant et après activation ; 12 parcours publics supplémentaires sans interception passent aussi. Les premières lignes réelles correspondent au RPC local.

Les autres contrôles requis passent : arrivée 22, recherche 18, composition 28, délai de reprise 12, accès aux rubriques 78, ancienne régression listes 18, Réseau 6 contrôlés et 12 réels, compteurs 36 contrôlés sur le candidat et 18 réels après activation. Les quantités sont détaillées par rapport dans le manifeste ; elles ne sont pas toutes des tests indépendants.

Chaque passage HTTP comprend 1 003 contrôles de fichiers et documents, avec deux passages réussis consécutifs avant et après chaque activation. Le moniteur d’arrivée a observé 1096 chargements initiaux, dont 0 en échec, depuis un seul emplacement entre 2026-10-23T10:54:30.268Z et 2026-10-23T11:17:20.719Z. Il ne mesure pas l’exécution du navigateur ni toutes les régions. Le moniteur temporaire et l’aperçu local ont été arrêtés après validation.

Le double accès observé dans le scénario WebKit utilise une interception réseau. Il ne prouve pas que le navigateur normal télécharge deux fois la ressource ; cette mesure reste distincte de la correction fonctionnelle.

## Limites

Ces essais ne prouvent pas le fonctionnement sur téléphones physiques, l’indexation Google ni le classement d’une requête. Les frais et autres agrégats restent soumis à leur propre couverture et fraîcheur. Le contrôle HTTP `reports/stream-first/seo-before.json` confirme l’accessibilité de l’accueil, des rubriques, robots et sitemap, pas leur présence dans Google.

La validation de Search Console, la soumission du sitemap et l’inspection des URL nécessitent l’accès du propriétaire. Références Google consultées le 23 octobre :
- https://developers.google.com/search/docs/monitor-debug/search-console-start
- https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl
