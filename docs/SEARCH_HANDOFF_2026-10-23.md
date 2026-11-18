# Recherche pendant le démarrage et publication compatible

Version publique vérifiée : `77cd7cc8-42c3-434c-b4bb-1a5d17235274`.
Source : `ink-explorer-search-handoff-20261023`.
Version intermédiaire : `fea1cbb5-5144-4df9-800a-c82d0e990f29`.
Version remplacée : `1adc6887-3cb9-4210-8cd8-7524dafe9836`.

## Saisie conservée

Le champ natif de l’accueil permettait de commencer à écrire avant le chargement de JavaScript. Le montage de React remplaçait ensuite ce champ et réinitialisait la valeur et le focus. Ce défaut avait été reproduit sur la version publique précédente.

Juste avant le montage, l’application capture maintenant la valeur, la sélection et le contrôle actif (champ ou bouton de recherche). Le composant reprend cet état et restaure le focus avant le rendu visuel. L’état temporaire est consommé une seule fois, sans stockage persistant. Une navigation ultérieure ne le réutilise pas.

Le changement de requête via l’URL continue à mettre le champ à jour. L’effet de synchronisation ne remet plus la requête initiale vide lors du premier montage. Une recherche commencée avant le montage peut être validée après celui-ci avec Entrée ou le bouton.

## Publication compatible

La publication précédente avait montré que des contrôles à 0 % de trafic ne suffisent pas à empêcher les 404 lors de la bascule. La nouvelle procédure ajoute une version intermédiaire :

1. Conserver exactement l’ancien HTML, ses instantanés, les fichiers mutables et le code du Worker.
2. Y ajouter les nouveaux fichiers immuables, sans remplacer les anciens.
3. Vérifier cette version à 0 %, l’activer, puis vérifier les fichiers sur le domaine public.
4. Charger et vérifier la nouvelle interface, puis l’activer seulement après les contrôles.

Pendant la dernière bascule, les deux versions possèdent ainsi les fichiers nécessaires aux deux interfaces. Une réponse HTML encore ancienne reste accompagnée de fichiers compatibles. Les fichiers conservés gardent leurs échéances ; les ressources mutables de l’ancienne interface ne sont pas remplacées pendant la première étape.

Les deux versions sont contrôlées avant et après activation. La procédure garde les variables, les secrets, le DNS, les services serveur et les routes existantes. Les prévisualisations restent désactivées ; les requêtes de contrôle ciblent les versions à 0 % par l’en-tête Cloudflare prévu à cet effet.

## Résultats

Les preuves sont regroupées dans `reports/search-handoff/manifest.json`.

- Vérification TypeScript, compilation et 37 tests de données/activité réussis.
- 27 tests de pré-rendu, Worker, métadonnées, rétention, graphe d’imports et compatibilité réussis. Le test de compatibilité vérifie que l’HTML, le Worker et le logo mutable anciens restent identiques, tandis que les deux bundles immuables sont disponibles.
- 18 scénarios de saisie en local, 18 sur le candidat avant activation et 18 sur le domaine public après activation. Chromium, Firefox et WebKit ; Mainnet à 1440 px en français et Sepolia à 390 px en arabe ; champ actif, bouton actif ou champ ayant perdu le focus. Valeur, sélection, focus, soumission et absence de réutilisation après navigation sont vérifiés.
- 22 scénarios d’arrivée sur la version intermédiaire et 22 sur le candidat avant activation.
- 412 contrôles par passage sur les fichiers et les vingt accueils traduits ; deux passages complets consécutifs sont requis à chaque étape.
- Les réponses transitoires qui ne portaient pas encore la version attendue ont été conservées dans les rapports. Aucun échec de fichier statique n’a été observé dans ces passages ; les échecs portaient sur le numéro de version des documents.
- Un contrôle HTTP continu a réalisé 346 arrivées entre 07:12:25 et 07:19:45 UTC, couvrant les trois versions. Aucun échec des documents, polices, feuilles de style ou imports JavaScript statiques initiaux n’a été observé. Ce contrôle ne lance pas de navigateur et ne vérifie pas tous les imports différés à chaque cycle.
- Les contrôles publics ordinaires et six parcours réels de données Mainnet/Sepolia ont réussi. Les blocs progressent, les transactions proviennent du WebSocket et le gas des 30 blocs correspond au RPC local.

## Portée

Ces résultats décrivent cette publication depuis l’emplacement du client de test. Ils ne garantissent pas toutes les régions ou toutes les futures propagations Cloudflare. La stratégie devra être conservée et suivie lors des prochaines publications.

Les tests de focus sont exécutés dans des moteurs de navigateur avec largeurs mobile et ordinateur. Ils ne constituent pas un test du clavier virtuel sur iPhone/Android physique, ni d’une composition IME réelle pendant le montage.

Google Search Console, l’indexation effective, les Core Web Vitals réels et la fraîcheur de tous les agrégats externes restent à établir. La conservation de la saisie et le fonctionnement du flux de blocs ne prouvent pas ces éléments.
