# Publication d’Ink Explorer sur Cloudflare

La version vérifiée au 23 octobre à 18:35 UTC est `f80294c4-2c7f-42d9-bda4-264d0d08d447`, issue de `ink-explorer-activity-stability-20261023`. Les preuves sont dans `reports/activity-stability/deployment/` et `reports/activity-stability/manifest.json`. Les contrôles publics sont terminés et la reprise du processus de publication a quitté avec le code 0. La première tentative publique, arrêtée après deux documents Sepolia temporairement indisponibles, est conservée dans `reports/activity-stability/publication-attempt-1/`. Aucune publication GitHub.

## Hébergement

Cloudflare Workers sert l’interface, les métadonnées et les sitemaps. Les fichiers statiques passent directement par le service Static Assets. Les API et WebSockets utilisent le domaine public et rejoignent la passerelle authentifiée existante. Le serveur reste nécessaire pour les nœuds, caches persistants et données locales.

| Service | Adresse locale | PM2 |
| --- | --- | --- |
| API Mainnet | 127.0.0.1:4194 | inkexplorer-api |
| API Sepolia | 127.0.0.1:4196 | inkexplorer-sepolia |
| Passerelle | 127.0.0.1:4195 | inkexplorer-origin |

Une modification du frontend ne nécessite pas de redémarrer ces services, de réécrire le secret ou de modifier le DNS. La procédure de publication conserve leurs réglages.

## Préparer et publier

Depuis une copie de travail correspondant à la version courante, compiler et vérifier les modifications. Le build produit les vingt accueils, 480 pages de rubriques et quatre-vingts structures de fiches blocs, transactions, adresses et tokens, sans observations de chaîne enregistrées.

```bash
npm test
npm run test:rolling
node --test scripts/release-gate-test.mjs scripts/home-prerender-test.mjs scripts/cloudflare-worker-test.mjs scripts/theme-bootstrap-test.mjs scripts/spam-guard-test.mjs
```

Inspecter la version distante puis fournir explicitement son identifiant et le répertoire source contenant son `dist`. Choisir un répertoire de rapport neuf et fournir le chemin absolu des données du collecteur dans `INK_ROLLING_DATA_DIR` :

```bash
INK_ROLLING_DATA_DIR=/chemin/collecteur/data/rolling-metrics \
python3 scripts/deploy-cloudflare.py \
  --expected-version ID_DE_LA_VERSION_ACTIVE \
  --previous-source /chemin/source-active \
  --report reports/publication-NOUVEAU_IDENTIFIANT
```

Le token local existant est lu sans être affiché. Le script inventorie les octets et conserve les anciens fichiers immuables. Il prépare d’abord une interface inchangée qui contient déjà les fichiers de la nouvelle interface, la vérifie à 0 %, l’active et la vérifie sur le domaine public. Il effectue ensuite les mêmes étapes pour la nouvelle interface et vérifie la conservation de la saisie de recherche, la composition native du clavier ainsi que les données réelles. Les variables et secrets restent conservés. Il ne crée ni achat, ni abonnement, ni domaine, ni nouveau service serveur.

La migration initiale des anciens fichiers a déjà été effectuée. La liste des fichiers et leurs échéances sont dans `dist/release-artifacts.json`. Ne pas modifier un build préparé ou relancer sa compilation pendant la publication.

## Interruption et échec

Lire `state.json` et les journaux. Si le processus est encore actif, suivre ce processus. Une fois son arrêt établi, reprendre le même rapport :

```bash
python3 scripts/deploy-cloudflare.py --resume reports/publication-NOUVEAU_IDENTIFIANT
```

La reprise vérifie les empreintes locales et l’état distant. Une version concurrente arrête l’opération. Si le chargement initial a été interrompu sans identifiant confirmé, examiner d’abord les versions Cloudflare ; ne pas envoyer aveuglément un second candidat. Les erreurs initiales restent dans des rapports numérotés distincts.

Le rapport contient deux étapes, `compatibility` et `candidate`, chacune avec sa phase et son identifiant. Dans une étape, `staged` laisse les visiteurs sur la version précédente. Une phase `promoted` signifie que le candidat est activé mais que ses vérifications finales restent incomplètes. Seule `verified` indique que les contrôles définis ont abouti.

## Limites et suivi

La procédure précédente avait produit des 404 transitoires après activation, malgré les contrôles réussis à 0 %. Une publication intermédiaire compatible avec les deux jeux de fichiers est maintenant utilisée. Aucun échec de fichier n’a été observé sur sa première publication ; des numéros de version anciens ont encore été observés brièvement. Voir `SEARCH_HANDOFF_2026-10-23.md` pour les mesures et leurs limites. Le résultat ne garantit pas toutes les régions ou toutes les publications futures.

Les tests couvrent les fichiers, documents, langues, réseaux et données détaillés dans les rapports. Ils ne prouvent pas un classement Google, des Core Web Vitals réels ou le fonctionnement sur un téléphone physique. Google Search Console reste nécessaire pour établir l’indexation et les requêtes visibles.

Le moniteur existant reste actif ; ses diagnostics de fraîcheur des agrégats sont indépendants de la validation du frontend. Aucun message externe d’alerte n’est configuré par cette procédure.

Pour redémarrer une API après une modification du backend, utiliser la configuration explicite de production et `--only`, comme indiqué dans `ROLLING_INTEGRATION_2026-10-23.md`. Un simple `pm2 restart --update-env` depuis la console peut reprendre son `PORT` et déplacer involontairement l’écoute. Une publication frontend ne redémarre toujours pas les API.

Les scénarios IME de `scripts/search-ime-browser-test.mjs` sont obligatoires sur le candidat à 0 % et sur le domaine public. Voir `SEARCH_IME_2026-10-23.md` pour leur couverture et les limites des essais CDP. Les collecteurs persistants restent dans `ink-explorer-rolling-metrics-20261023` même si la source frontend change.

La publication vérifie avant tout envoi que les deux bases de rapprochement existent. `INK_ROLLING_DATA_DIR` désigne le répertoire persistant des collecteurs ; son chemin est enregistré dans `state.json` et réutilisé à la reprise. Le contrôle ouvre ces bases en lecture seule, sans copier les fichiers actifs.


Pour repartir d’une version intermédiaire dont le répertoire ne contient que les fichiers publiables, fournir `--previous-source` vers ce répertoire préparé et `--previous-browser-source` vers sa source complète correspondante. Le script vérifie avant publication la présence des tests et l’identité de `dist/index.html`, puis enregistre ces deux chemins pour les reprises. Les tests de compatibilité utilisent ainsi la bonne interface antérieure ; les fichiers déjà publiés restent inchangés.

La publication des pages initiales ajoute un contrôle de chacun des 480 documents à chaque passage de validation du candidat, ainsi que les scénarios de délai de reprise et d’arrivée sur les pages avant et après activation.

Les scénarios `scripts/ledger-arrival-browser-test.mjs` sont exigés sur le candidat et après activation. Une validation supplémentaire des premières lignes réelles peut être exécutée avec `BASE_URL=https://inkexplorer.xyz EXPECTED_VERSION=VERSION_ACTIVE node scripts/ledger-arrival-live-test.mjs`. Elle compare les hashes au RPC et enregistre la version réellement reçue.

Les scénarios `scripts/stream-first-browser-test.mjs` et `scripts/stream-first-live-test.mjs` sont maintenant obligatoires avant et après activation. Le premier retient toutes les requêtes initiales, y compris les préchargements ; le second coupe uniquement les listes de l’indexeur et compare les premières lignes du vrai flux au RPC. Voir `STREAM_FIRST_2026-10-23.md`.

La procédure exige aussi les tests du moteur workerd avant publication et les séries `record-locales-live-test.mjs`, `record-arrival-browser-test.mjs` et `record-arrival-live-test.mjs` avant et après activation. Les références réelles sont découvertes directement sur les RPC locaux, sans rapport antérieur requis. Les états initiaux indisponibles et leur reprise sont comptés séparément des premiers documents disponibles. Voir `DETAIL_ARRIVAL_2026-10-23.md` pour les échecs détectés avant activation et les limites de mesure.

Les suites `transaction-follow-browser-test.mjs` (18 scénarios) et `transaction-follow-live-test.mjs` (six lectures rapprochées des RPC) sont obligatoires avant et après activation. La collecte distingue le premier instantané HTTP des messages WebSocket. Les tests d’arrivée enregistrent les styles, polices et transports en cas d’échec. Voir `TRANSACTION_FOLLOW_2026-10-23.md`.

La livraison des profils ajoute `profile-arrival-browser-test.mjs` (48 scénarios) et `profile-arrival-live-test.mjs` (16 parcours) avant et après activation. `record-locales-live-test.mjs` contrôle maintenant 80 documents. Les profils initiaux sont liés au réseau et à l’adresse, expireront avant une réutilisation tardive et ne contiennent aucune donnée de compilation. Les contrôles réels comparent le solde ETH au nœud au bloc indiqué ; pour les tokens, ils vérifient les décimales sur le contrat et ne prétendent pas établir le cours de marché par RPC. Un premier document temporairement indisponible doit être distingué d’un document complet et récupérer automatiquement dans le navigateur.

La livraison des soldes exige aussi `address-live-browser-test.mjs` et `address-live-real-test.mjs` avant et après activation : six scénarios contrôlés et six parcours réels par phase. Les contrôles publics exigent le transport WebSocket, la présence du hash du solde dans un message réellement reçu et le rapprochement du montant avec le RPC au même hash canonique. Les tests locaux réels utilisent le repli HTTP de la prévisualisation ; cette limite est conservée dans le manifeste.

L’API `GET /api/address-balance/{address}` et son équivalent Sepolia sont déjà déployés dans `ink-explorer-redesign-20261017`. Elle refuse les paramètres de requête, exige une tête de moins de 15 secondes, limite les lectures concurrentes à 16 par réseau et répond 503 avec Retry-After en cas d’indisponibilité. La documentation publique est générée dans `public/assets/openapi.json`. Les profils gardent la provenance de leur ancien solde indexé dans `balance_check` ; un solde non vérifiable ne remplace pas une observation du nœud par l’index.

Incidents de cette publication : le premier contrôle public de compatibilité a vu 11 nouveaux fichiers HTTP 404 et d’anciens numéros de version. Les deux passages suivants ont réussi avant l’activation du candidat, alors que l’interface précédente était conservée. Les deux contrôles publics du candidat et les tests d’acceptation passent. Les moniteurs du seul graphe initial comptent 1 332 échantillons sans échec ; ils ne couvrent pas tous les imports tardifs ni toutes les régions. Rapports initiaux conservés, deux moniteurs temporaires arrêtés. Voir `reports/address-live/manifest.json`.


Les suites `address-activity-browser-test.mjs`, `address-activity-real-test.mjs` et `address-activity-runtime-test.mjs` sont obligatoires avant et après activation. La suite réelle vérifie aussi les pixels des huit labels de colonnes dans la capture complète, avant un recadrage susceptible de provoquer un nouvel affichage dans WebKit. Le contrôle de stabilité exige simultanément de nouvelles transactions et une somme de déplacements inférieure à 0,05 dans deux observations Chromium CPU ×4 de douze secondes. Ce seuil de laboratoire ne constitue pas une mesure de Core Web Vitals des visiteurs. Voir `ADDRESS_ACTIVITY_2026-10-23.md`.
