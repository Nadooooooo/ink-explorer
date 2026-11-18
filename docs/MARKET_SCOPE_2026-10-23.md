# Portée des données de marché — 23 octobre 2026

Version publiée : `3346de9b-60dd-4575-ac69-1d1baef628a0`. Les 25 contrôles de déploiement et les 12 scénarios Chromium/WebKit publics passent après propagation. Les premiers rapports, qui montrent un fichier temporairement indisponible et une page vide, restent conservés ; un écran de récupération est prévu pour ce cas.

## Correction de l’interface

La liste des tokens calcule déjà la valeur de l’offre indexée sur Ink (offre / 10^décimales × prix rapporté). La fiche affichait à sa place la capitalisation en circulation fournie par le marché. Ces deux chiffres ne représentent pas nécessairement les mêmes tokens ni les mêmes réseaux.

La fiche affiche désormais la même valorisation sur Ink que la liste. La capitalisation de la source reste accessible dans son aide, avec une indication de son périmètre potentiellement multiréseau. Le volume est nommé « Volume marché · 24h » et son aide précise qu’il ne mesure pas les transferts sur Ink. Le tri de la liste se nomme « Cap. circulante » : il continue d’utiliser le classement fourni par l’indexeur, sans annoncer un classement local qui n’existe pas dans son API.

Le calcul ne remplace jamais un prix, une offre ou une précision manquante par la capitalisation globale. Les données expirées restent `N/A`. Une offre réellement nulle reste zéro.

## Comparaison indépendante

Lecture des 20 premiers tokens ERC-20 avec prix dans la première page de l’indexeur, le 23 octobre 2026 à 05:39 UTC. Les appels au nœud sont fixés au bloc canonique 59 235 574, hash `0xd2f5f41124ce2908cdb3aedae8fbae99eb7a0eac185f6d31eb5d4326500f5e66`.

- Les décimales concordent pour les 20 contrats ; 19 offres sont strictement identiques.
- Pour WETH, la différence est de 0,00375 WETH. La réponse indexée ne donne pas le bloc de mise à jour de l’offre : cette comparaison ne permet pas d’attribuer l’écart à un défaut de calcul plutôt qu’à un retard d’indexation.
- Pour USDC, l’offre indexée et le contrat donnent 38 397 077,992473 tokens. Au prix rapporté de 0,999399 $, la valorisation sur Ink est de 38 374 001,34859952 $. La capitalisation de marché rapportée est de 72 057 042 914 $. C’est la différence de périmètre que l’interface doit rendre visible.
- L’échantillon est ciblé sur les tokens valorisés en tête de catalogue ; il ne prouve pas la qualité de tous les tokens ni l’authenticité de leurs métadonnées de prix.

Pour la pool OTO/WETH `0x3e90baa89245313f621ff7d57a686c0c30acf032`, l’ordre des tokens et le palier de frais de 1 % concordent avec les lectures du contrat. Dans cet échantillon, la liquidité et le volume de l’indexeur correspondent à la réponse directe de GeckoTerminal. Cette concordance entre fournisseurs n’est pas une validation indépendante en dollars : ils peuvent partager la même source.

Le rapport issu de `slot0` est environ 1,01 % supérieur au prix de paire rapporté par GeckoTerminal. Un prix marginal, un prix d’exécution et un prix de marché ne sont pas interchangeables ; cette observation seule ne prouve pas une donnée périmée. Aucun cours ni montant de liquidité n’a été remplacé automatiquement à partir de cette comparaison.

Preuves brutes et script reproductible : `reports/market-scope/reconciliation.json` et `reports/market-scope/reconcile.mjs`.

## Sources des définitions

- [CoinGecko — données de token par adresse](https://docs.coingecko.com/reference/token-data-contract-address) : la capitalisation peut inclure des tokens émis sur d’autres réseaux.
- [Uniswap V3 — interface de l’état de pool](https://github.com/Uniswap/v3-core/blob/main/contracts/interfaces/pool/IUniswapV3PoolState.sol) : `sqrtPriceX96` représente la racine du rapport token1/token0 en Q64.96 ; la liquidité active ne représente pas la somme de toutes les positions.

## Validation et limites

Les rapports sous `reports/market-scope/` couvrent la concordance liste/fiche, l’accès à la capitalisation de marché, les données absentes/périmées et leur reprise, les dix langues, le texte agrandi et les parcours réels sur Mainnet et Sepolia. Le manifeste distingue les contrôles locaux de ceux réalisés après publication.

Restent à établir : l’horodatage réel des prix, la qualité des correspondances contrat/actif de marché, la couverture des pools v4, les prix exécutables après frais et impact, et une valorisation indépendante complète de la liquidité. Les contrôles de cette intervention ne démontrent pas ces propriétés.
