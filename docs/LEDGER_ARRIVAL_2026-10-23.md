# Première réponse des listes — 23 octobre 2026

Source : `ink-explorer-ledger-arrival-20261023`.

Le contrôle de concurrence `scripts/ledger-arrival-race-audit.mjs` a reproduit le même défaut sur Blocs et Transactions, sur Mainnet et Sepolia : le flux avait déjà livré une observation récente, mais la première réponse de l’indexeur était affichée seule. Le message suivant du flux corrigeait alors la liste. Les preuves avant correction sont dans `ink-explorer-network-arrival-20261023/reports/network-arrival/ledger-race-audit/results.json`.

La première réponse fusionne désormais les observations déjà validées du flux. La fusion conserve les règles existantes de branche canonique et d’enrichissement des identités. Le rafraîchissement de l’indexeur inclut aussi le flux courant, même si une première réponse est encore en attente. Un transport indisponible ne fournit pas de nouvelle preuve canonique.

Cette fusion concerne seulement la première page non filtrée. La pagination historique et les blocs remplacés restent isolés. Une liste peut encore attendre la réponse initiale de l’indexeur avant d’afficher ses lignes ; cette correction ne crée pas un second mode de pagination à partir du nœud.

Les dix-huit scénarios de navigateur couvrent Chromium, Firefox et WebKit, les deux réseaux et les vues Blocs, Transactions et Blocs remplacés. Ils vérifient la première réponse sans nouveau message, l’exclusion d’une transaction contredite par le bloc canonique, la pagination historique et le retour aux dernières lignes. Les API de ces scénarios sont simulées ; ils établissent le comportement de concurrence, pas la réalité des blocs de fixture.

La procédure exige ces scénarios sur le candidat et après activation, en plus des contrôles existants de données publiques, de page Réseau, d’arrivée, de composition et de fichiers. Les résultats finaux et la version se trouvent dans `reports/ledger-arrival/deployment/state.json` et le manifeste après achèvement de la publication.

## Publication achevée

Version `ec326f59-d322-41c4-9df0-4bf760fd4c3f` publiée et vérifiée le 23 octobre 2026. Compilation et 36 tests unitaires réussis ; 18 scénarios de listes ont réussi en local, sur le candidat et sur le domaine public. Les 78 arrivées de rubriques, 28 compositions natives, 12 délais de reprise, 18 recherches, six scénarios Réseau, douze parcours Réseau réels, six accueils réels et 18 rapprochements des compteurs sur 24 heures ont également réussi après activation.

Douze parcours publics supplémentaires, sans API simulée, ont comparé les premières lignes Blocs/Transactions aux messages reçus et aux hashes des nœuds, sur les deux réseaux et les trois moteurs. Chaque document correspondait à la version activée. Les captures mobiles Blocs et Transactions ont été inspectées.

Deux passages de 978 contrôles HTTP ont réussi avant activation et deux immédiatement après. La propagation de la version intermédiaire avait produit dix réponses 404 sur des requêtes de fichiers nouveaux, absents de l’interface précédente ; les détails et anciens numéros de version observés sont conservés dans `reports/ledger-arrival/propagation.json`. Aucun de ces fichiers n’était nécessaire à l’interface conservée pendant cette étape.

Le moniteur a enregistré 757 arrivées sans échec de ressource initiale entre 10:09:42 et 10:25:37 UTC. Cette observation concerne un seul emplacement et le graphe initial de l’accueil. Les preuves complètes et les limites sont dans `reports/ledger-arrival/manifest.json`.
