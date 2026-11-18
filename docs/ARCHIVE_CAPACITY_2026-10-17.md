# Historique local complet : décision de faisabilité

Le contrôle préalable ne permet pas de lancer ni de qualifier un index historique complet sur les nœuds actuels. La refonte peut utiliser les données historiques existantes et le flux local vérifié ; elle ne doit pas revendiquer une indépendance historique complète.

## Mesures

- Machine partagée : 12 processeurs logiques, 47 096 MiB de RAM.
- Échantillon de dix secondes pendant les contrôles navigateur : au moins 27 127 MiB disponibles, environ 18 566 MiB de swap occupés. La présence de swap utilisé ne prouve pas à elle seule une pression actuelle.
- NVMe : 2 773 GiB disponibles. Ce nombre n'est pas une estimation de la taille finale de deux archives et de leurs bases d'indexation.
- Mainnet et Sepolia : corps de blocs historiques disponibles ; reçus absents et états élagués aux hauteurs 1, 1 000 000 et 30 000 000. La méthode de trace n'est pas exposée sur les RPC contrôlés.
- Les abonnements locaux et les reçus récents servent correctement le flux actuel. Ce résultat n'établit pas la disponibilité de l'historique.

Preuves : `reports/redesign/archive-preflight.json` et `reports/redesign/archive/capacity.json`.

## Conséquence

Un import depuis ces RPC laisserait des trous dans les reçus, les transferts, les appels internes et les états historiques. Changer une option d'élagage ne restaure pas les données déjà supprimées. Le pilote de synchronisation d'archives est donc arrêté au contrôle préalable : aucun téléchargement massif, aucune base d'indexation et aucune modification des nœuds de production n'ont été lancés.

Ce n'est pas une preuve que le matériel ne pourra jamais héberger un index Ink. Sa capacité pour deux archives supplémentaires, PostgreSQL et l'indexation, tout en préservant les autres applications, reste à mesurer. La recommandation générale Blockscout de 128 Go ne constitue pas une mesure spécifique à Ink.

Pour franchir ce contrôle, il faut d'abord une source d'archive complète ou une resynchronisation séparée et plafonnée. Un futur pilote devra mesurer le débit de rattrapage, le stockage par bloc et transaction, les E/S, la mémoire et la latence des services existants. Les critères de passage doivent inclure l'absence de trous, la réconciliation des reçus/frais et une marge de ressources mesurée ; une estimation de fin doit suivre les mesures, jamais les précéder.

## Fonctionnalités restant liées à ce contrôle

L'offre native totale vérifiée sur Ink, les historiques NFT et de créations de jetons non publiés par la source actuelle, la taille cumulée exacte de la chaîne et les agrégats historiques supplémentaires ne sont pas fabriqués. Les 18 compteurs et 30 courbes disponibles restent servis par l'index historique existant. Les contrats vérifiés et leurs noms nécessitent également une source de vérification, au-delà des seuls octets de la chaîne.

## Sources techniques

- [Blockscout — ressources matérielles](https://docs.blockscout.com/setup/requirements/resource-requirements) : dimensionnement indicatif, dépendant de la chaîne.
- [Blockscout — méthodes RPC et traces](https://docs.blockscout.com/setup/requirements/node-tracing-json-rpc-requirements) : exigences pour les états et appels internes.
- [Reth — modes et élagage](https://reth.rs/run/storage/pruning/) : données conservées selon le mode.
