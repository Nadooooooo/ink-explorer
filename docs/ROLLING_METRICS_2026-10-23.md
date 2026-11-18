# Compteurs locaux sur 24 heures — 23 octobre 2026

## État

L’interface publique reste la version `77cd7cc8-42c3-434c-b4bb-1a5d17235274`, source `ink-explorer-search-handoff-20261023`. Aucun fichier de cette interface ni API de production n’a été modifié dans cette intervention.

Le nouveau collecteur est dans `ink-explorer-rolling-metrics-20261023`. Deux processus PM2 l’exécutent : `inkexplorer-rolling-mainnet` et `inkexplorer-rolling-sepolia`. Ils interrogent exclusivement les RPC locaux 8545 et 8645, sans envoyer de transaction. Ils n’exposent pas de port et ne modifient pas les nœuds. La persistance est dans `data/rolling-metrics/{chainId}.sqlite` et le résultat atomique dans `{chainId}.json`.

Le total des transactions est prêt pour l’intégration. **Les frais sur 24 heures restent indisponibles et ne sont pas encore présentés dans l’interface.** Le raccordement au flux public et aux trois emplacements du compteur reste à réaliser.

## Définitions et contrôles

- Grain conservé : un bloc canonique, identifié par hauteur et hash. Comptage des transactions incluses dans le bloc, y compris les dépôts/système, réussies ou échouées ; ni transactions en attente ni appels internes supplémentaires.
- Fenêtre : `(timestamp du bloc de fin − 86 400 secondes, timestamp du bloc de fin]`. Le bloc précédent la fenêtre est conservé pour prouver la couverture. Les bornes, hashes, hauteurs et heure d’observation sont fournis.
- Chaque reçu doit appartenir au bon bloc, à la bonne position et au bon hash de transaction. Un doublon, un reçu partiel, un cumul de gas incohérent ou un ensemble incomplet déclenche une erreur.
- Les frais sont additionnés en entiers wei : exécution + données L1 + frais d’opérateur explicites. Une composante inconnue laisse le total à `null`. Un paramètre d’opérateur non nul sans montant explicite, ou un remboursement non nul non pris en charge, ne donne pas lieu à une estimation.
- Les chaînes sont rapprochées par les parents et par la tête canonique avant/après collection. Une réorganisation réécrit la branche concernée ; un retour à une hauteur inférieure est pris en charge. Un arrêt expose un état indisponible, sans anciens compteurs.
- Une seule écriture est autorisée par réseau via `flock`. Le service rattrape les nouveaux blocs sans relire tous les reçus. Une somme glissante en mémoire conserve la précision et réduit le travail par nouveau bloc. La base conserve environ 25 heures pour permettre la reprise et les réorganisations.
- La limite de 120 secondes dans le collecteur sert à rejeter une tête ancienne. **L’intégration publique devra appliquer une limite plus stricte (par exemple 5 secondes) et vérifier que le hash de fin appartient toujours à la fenêtre canonique du flux** ; le statut du collecteur seul ne prouve pas l’actualité de l’affichage.

## Constat sur les reçus historiques

Les fichiers `reth.toml` des nœuds Mainnet et Sepolia définissent `prune.segments.receipts.distance = 10064`. Des appels directs ont confirmé l’absence de reçus à 14 400 et 86 400 blocs derrière la tête, alors que les corps des blocs restent disponibles. Il ne s’agit pas d’une panne du site.

Le collecteur conserve maintenant les résumés nécessaires avant l’élagage du nœud. À 07:42 UTC, une fenêtre complète de frais ne pouvait pas être disponible avant le **24 octobre à 04:23:18 UTC sur Mainnet** et **04:09:03 UTC sur Sepolia**, sous réserve de collecte continue et de composants de frais reconnus. Ces dates sont des bornes conditionnelles, pas des garanties. Le fichier `current-state.json` conserve cette observation.

La spécification OP explique les composantes d’opérateur et leur présence dans les reçus : https://specs.optimism.io/protocol/isthmus/exec-engine.html. Le code refuse les cas dont la formule dépend d’une version non établie plutôt que d’inventer un montant.

## Preuves

Dans `reports/rolling-metrics/` :

- `unit.log` : neuf tests, avec reçus incomplets/dupliqués/étrangers, frais inconnus, calcul entier, bornes temporelles, fenêtres glissantes, reprise, réorganisation, baisse de tête, mauvaise chaîne, tête ancienne et annulation.
- `mainnet-audit.json` et `sepolia-audit.json` : contrôle indépendant via `eth_getBlockTransactionCountByNumber` sur **86 400 blocs par réseau**, concordance exacte du total et hash canonique identique avant/après. Contrôle de frais sur 64 blocs par réseau : 362 reçus Mainnet et 72 reçus Sepolia.
- `after-cache/*-audit.json` : même rapprochement intégral après optimisation des sommes glissantes ; les échantillons de frais encore lisibles par le nœud sont indiqués dans ces rapports. L’élagage pendant l’audit explique les reçus devenus indisponibles, sans les compter comme validés.
- `stopped-state.json` : arrêt du collecteur Mainnet effectivement testé ; aucun ancien compteur dans le résultat. Reprise PM2 vérifiée ensuite avec nouvelle tête et horodatage récent.
- `writer-lock-test.log` : un second collecteur ponctuel est refusé pendant que le service détient le verrou.
- `audit-after-cache.log` conserve l’échec de contrôle lancé pendant le redémarrage : état `unavailable`, correctement refusé. Le contrôle a été relancé une fois l’état `ready` réellement constaté, avec journal séparé.

Les audits utilisent le nœud local comme autorité de chaîne. Ils ne prouvent pas la finalité L1, ni l’intégralité des frais sur la fenêtre tant que des reçus manquent, ni la fraîcheur des autres agrégats externes, ni l’indexation Google.

## Suite concrète

1. Ajouter le résultat au flux public et au snapshot HTTP existants, en validant sa chaîne, sa fraîcheur et son hash contre la fenêtre canonique actuelle. Aucune nouvelle requête par visiteur et par bloc n’est nécessaire.
2. Utiliser le compteur local dans l’accueil, le résumé des transactions et les statistiques, indépendamment des pannes de l’indexeur. Conserver `N/A` lors d’une couverture incomplète, d’un arrêt ou d’une branche remplacée ; documenter la population et les bornes dans l’aide.
3. Préserver le contrat de `/api/stats/counters` tant qu’il représente l’indexeur ; documenter séparément les agrégats locaux et leur couverture.
4. Vérifier les transitions et les deux réseaux dans Chromium, Firefox et WebKit, puis publier via la procédure compatible existante.
5. Une fois `unknownFees === 0`, rapprocher intégralement les frais conservés, traiter les éventuels nouveaux formats de reçus, puis raccorder les deux compteurs de frais. Ne pas substituer une estimation à la couverture manquante.
6. Search Console, appareils réels, claviers IME et fraîcheur des autres agrégats restent à traiter.

## Exploitation

```bash
node --test scripts/rolling-metrics-test.mjs
pm2 start ecosystem.rolling.config.cjs
pm2 restart inkexplorer-rolling-mainnet inkexplorer-rolling-sepolia
node scripts/audit-rolling-metrics.mjs
```

Le collecteur ponctuel `node scripts/collect-rolling-metrics.mjs mainnet` partage le verrou du service : il refuse une seconde écriture simultanée. Les audits sont en lecture seule. Les changements de frontend ultérieurs doivent continuer à utiliser ces bases et services, sans créer un autre collecteur ni copier leur base active pendant les écritures.
