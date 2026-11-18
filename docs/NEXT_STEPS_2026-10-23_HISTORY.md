# Ink Explorer — amélioration du 23 octobre 2026

Version de la correction des statistiques : `5e7dd47d-ae1c-444d-96e4-165068c311de`.

## Livré et vérifié

- Le total des blocs de la page Statistiques utilise désormais le flux du nœud local : hauteur canonique + 1, bloc initial inclus. Il affiche le nombre exact et suit chaque bloc, y compris une baisse de hauteur après réorganisation.
- Un nœud indisponible, non synchronisé, sur le mauvais réseau ou renvoyant un bloc trop ancien produit `N/A`. Le compteur ne reprend jamais le total ancien de l’indexeur. Une panne de l’indexeur n’efface pas une observation valide du nœud.
- Seul le composant du compteur consomme ces mises à jour. Les graphiques ne sont ni rechargés ni rendus à chaque bloc.
- Sur téléphone, les marges des cartes des totaux ont été ajustées. À 320 px en français, les 14 cartes prennent 723 px au lieu de 980 px, sans réduire les textes ou les cibles tactiles. Le retour sur une colonne reste possible lorsque le texte est agrandi.
- L’aide est traduite dans les dix langues. La documentation et OpenAPI distinguent le total issu du nœud des compteurs agrégés de `/stats/counters`, qui ne fournissent pas d’heure de calcul.
- Le moniteur conserve maintenant les valeurs observées et le retard dans ses rapports d’échec.

## Preuves

Les rapports de cette intervention sont dans `reports/chain-stats/` :

- 37 tests de données et d’activité, vérification TypeScript et compilation ; 16 tests de SEO/Worker et 2 contrôles des protections anti-spam.
- 12 combinaisons navigateur/réseau/largeur avec données contrôlées : nouveaux blocs, réorganisation, données anciennes, indisponibilité et reprise, indépendance de l’indexeur, absence de nouvelle requête de graphique, traductions et accessibilité.
- Vérification du nombre exact à 320 px dans les dix langues.
- 9 contrôles de mise en page des statistiques avec Chromium, WebKit et Firefox à police minimale de 24 px, sur 320, 390 et 1440 px.
- 88 contrôles de pages et d’interactions mobile sur Chromium/WebKit, portant notamment sur les statistiques et l’API.
- Comparaison avec les sources réelles sur Mainnet/Sepolia à 390 et 1440 px : 17 compteurs de l’indexeur, le total canonique et les trois estimations de gas.
- Le manifeste indique la version publiée et les vérifications réalisées après publication.

## Ce qui reste à traiter

1. **Fraîcheur des autres agrégats.** Le total ancien des blocs reste inchangé dans l’API de l’indexeur pour préserver son contrat. Le site utilise la chaîne pour ce chiffre, mais il ne faut pas extrapoler son retard aux 17 autres compteurs : leurs dates de calcul ne sont pas publiées. Le moniteur continue de signaler le retard amont. À 05:31 UTC, il était d’environ 91 minutes sur les deux réseaux. Il reste à établir les cadences métrique par métrique ou à produire les métriques localement avec une couverture vérifiable.
2. **Données de marché.** Vérifier les prix et capitalisations des tokens et les liquidités de pools peu actifs à partir des réserves et échanges, avec leurs dates et limites.
3. **Appareils réels.** Les tests navigateur ne remplacent pas un iPhone/Android physique avec clavier, zoom, VoiceOver et TalkBack.
4. **SEO de terrain.** Mesurer l’indexation et les Core Web Vitals réels ; les tests automatiques ne prouvent pas le classement dans les moteurs.
5. **Retours d’usage.** Continuer les corrections à partir des parcours difficiles observés : recherche d’un hash, suivi d’un bridge, lecture d’un contrat et comparaison de tokens.

Cette liste prolonge `NEXT_STEPS_2026-10-22.md`. Les validations sont limitées aux scénarios indiqués, pas une certification de perfection absolue.

## Suivi des données de marché

Version publiée : `3346de9b-60dd-4575-ac69-1d1baef628a0`.

La fiche token et la liste utilisent maintenant le même périmètre de valorisation sur Ink. La capitalisation de la source reste dans l’aide ; le volume et le tri précisent leur périmètre de marché. Un échantillon de 20 contrats et une pool V3 ont été rapprochés du nœud local. Les résultats et limites figurent dans `MARKET_SCOPE_2026-10-23.md`. La fraîcheur des prix et la couverture générale des pools restent ouvertes.

## Suivi arrivée et SEO

Version publiée : `f858b910-3395-4652-841b-23ffb9538b9d`.

L’accueil dispose désormais d’un HTML complet pour sa structure, sans valeurs de chaîne enregistrées à la compilation. Les anciens onglets WebKit peuvent reprendre après un échec de dépendance. La disposition des onglets mobile est identique avant et après démarrage. Le flux public de blocs, de transactions et de charge réseau a été rapproché du RPC sur les deux réseaux et trois navigateurs. Voir `ARRIVAL_SEO_2026-10-23.md` et son manifeste pour les preuves et les échecs initiaux conservés.

Priorités supplémentaires : finaliser la propriété Google Search Console et la soumission du sitemap, mesurer l’indexation réelle, et étudier un déploiement en étapes face aux 404 transitoires constatés durant la propagation Cloudflare. Le classement Google et la fraîcheur de tous les agrégats externes ne sont pas certifiés par ces tests.

## Suivi publication et arrivée — 06:57 UTC

Version vérifiée : `1adc6887-3cb9-4210-8cd8-7524dafe9836`. Les sélections de réseau, langue et période sont maintenant exactes dès le HTML. La nouvelle procédure exige des contrôles avant et après activation et conserve explicitement les anciens fichiers immuables. La durée de conservation ne repose plus sur `--old-asset-ttl`, qui ne concernait pas notre mécanisme Static Assets.

Deux problèmes restent étayés : la saisie et le focus de recherche peuvent être perdus pendant le montage initial de React ; la propagation peut encore produire des 404 après promotion d’un candidat vérifié à 0 %. Voir `RELEASE_GATE_2026-10-23.md` pour les corrections suivantes et les preuves. Search Console reste à finaliser.

## Suivi recherche et publication compatible — 07:20 UTC

Version vérifiée : `77cd7cc8-42c3-434c-b4bb-1a5d17235274`.

La perte de texte, sélection et focus pendant le montage initial est corrigée et vérifiée sur trois moteurs, avant et après publication. La publication passe maintenant par une interface inchangée contenant les deux jeux de fichiers. Le contrôle continu a enregistré 346 arrivées sans échec de ressource initiale pendant ces bascules. Les retards de numéro de version des documents restent observés et sont conservés dans les rapports ; aucun 404 de fichier n’a été observé lors de cette publication.

Voir `SEARCH_HANDOFF_2026-10-23.md`. Il reste notamment à vérifier les claviers et lecteurs d’écran physiques, la composition IME au démarrage, l’indexation Google et la fraîcheur détaillée des agrégats et marchés. Continuer à mesurer les prochaines publications pour confirmer le comportement de la stratégie compatible.

## Suivi agrégats locaux — 07:43 UTC

Deux collecteurs locaux conservent maintenant une fenêtre canonique de 24 heures, avec des contrôles de reçus et de réorganisation. Le total des transactions a été rapproché indépendamment sur 86 400 blocs par réseau. La configuration des nœuds supprime les reçus anciens ; les frais restent donc explicitement indisponibles jusqu’à constitution d’une fenêtre conservée complète. Voir `ROLLING_METRICS_2026-10-23.md` pour les preuves, les processus actifs et le raccordement à l’interface encore à réaliser. L’interface publiée reste `77cd7cc8-42c3-434c-b4bb-1a5d17235274`.

## Suivi affichage des transactions sur 24 h — 08:11 UTC

Version publiée et vérifiée : `34a02862-5594-488b-8b98-b64f172e8cda`. Le compteur local est raccordé à l’accueil, aux transactions et aux statistiques ; il expire sur silence, panne ou remplacement de branche. Les tests de sources réelles, mise en page et publication figurent dans `ROLLING_INTEGRATION_2026-10-23.md`. Le raccordement des frais attend toujours la couverture et le rapprochement complets. Les autres priorités restent ouvertes, dont Search Console et les appareils physiques.

## Suivi saisie au démarrage — 08:37 UTC

Version publiée et vérifiée : `5019ec70-093f-4bbf-adcf-f4d3d2e281e3`. Le doublement du texte pendant une composition native est corrigé. Voir `SEARCH_IME_2026-10-23.md` et son manifeste. Les claviers physiques iPhone/Android restent à tester ; la couverture CDP ne les remplace pas. La procédure de publication vérifie désormais le chemin des bases persistantes avant toute mutation distante. Les collecteurs restent dans la source rolling-metrics du 23 octobre. Search Console, les frais locaux complets et la fraîcheur des autres agrégats restent ouverts.

## Suivi accès directs aux rubriques — 09:36 UTC

Version vérifiée : `70a73f95-3e29-4a52-ab6c-bf8eaf2a1599`. Les 24 rubriques disposent maintenant de leur HTML initial dans les dix langues et sur les deux réseaux. La recherche mobile et la documentation API fonctionnent avant React ; aucune observation de chaîne n’est enregistrée à la compilation. Une aide de reprise prématurée sous WebKit a été reproduite et corrigée avant activation. Voir `PAGE_ARRIVAL_2026-10-23.md` et son manifeste pour les contrôles publics et leurs limites.

Priorités : expiration des valeurs de Réseau après perte de transport, fusion de la première réponse des listes avec les blocs déjà reçus, rendu initial des fiches détaillées et résultats de recherche, vérification Search Console. Les reçus de 24 heures et les essais sur appareils physiques restent ouverts.
