# Fraîcheur de la page Réseau — 23 octobre 2026

Source : `ink-explorer-network-arrival-20261023`.

## Défauts reproduits

Sur la version publique `70a73f95-3e29-4a52-ab6c-bf8eaf2a1599`, deux transports écrivaient dans le même état de la page Réseau : le flux partagé et une requête `/api/network` toutes les quinze secondes. En retardant cette dernière, une hauteur 8 000 000 remplaçait la hauteur 9 000 000 déjà reçue du flux. Après coupure ou expiration, la page gardait également ses anciens compteurs et son statut positif. Les scénarios contrôlés sur Mainnet et Sepolia sont conservés dans `reports/network-arrival/before/results.json` ; les nombres de ce scénario sont des fixtures, pas des observations de chaîne.

## Correction

La page consomme le même transport validé que le reste de l’application. Il fournit une première observation HTTP puis les messages WebSocket ; le repli HTTP existant reste disponible en cas de coupure du socket. La page n’entretient plus un second sondage concurrent.

Une observation doit correspondre au réseau, comporter une date valide et dater de quinze secondes au plus. Une date située à plus de trente secondes dans le futur est refusée. Son échéance est surveillée même sans nouveau message. Si le transport est interrompu ou si l’observation est périmée, les compteurs, les pairs et les informations de connexion deviennent `N/A`, la jauge de disque ancienne disparaît et le statut n’annonce plus un fonctionnement normal. Une nouvelle observation remet automatiquement la page à jour, sans recharger le document.

Une observation fraîche indiquant que le nœud est en retard reste visible comme telle : l’état du nœud et la disponibilité de l’observation sont distincts. L’heure affichée correspond à l’observation ; le texte promettant un rafraîchissement toutes les cinq secondes a été retiré. Les numéros de version des clients étaient inscrits en dur sans mesure correspondante ; seuls les noms des clients sont désormais affichés.

Le délai utilise l’horloge du navigateur. Une horloge fortement décalée peut donc produire `N/A`. Aucun reçu ou compteur historique n’est recalculé par cette correction.

## Validation

- Deux tests unitaires couvrent dates limites, date absente/invalide/future, réseau incorrect, transport indisponible et observation valide d’un nœud en retard ou indisponible.
- Six parcours contrôlés (trois moteurs × deux réseaux) comportent chacun douze contrôles : réponse tardive, coupure, reprise, expiration malgré transport ouvert, date ancienne/absente/future, distinction du retard du nœud, silence des transports, accessibilité, absence de débordement et d’erreur JavaScript.
- Le premier essai local avait une assertion sensible à la casse du statut, affiché en capitales par CSS. Le contrôle compare maintenant le texte sans dépendre de cette transformation. L’échec et le résultat corrigé restent conservés.
- Les essais réels de publication comparent les compteurs affichés aux messages reçus et le hash du bloc au nœud local, sur les deux réseaux, les trois moteurs et avec WebSocket ou repli HTTP. Le mode HTTP ferme volontairement le WebSocket, sans simuler les réponses API.
- Les validations d’arrivée, de saisie, de délai, de fichiers et de compteurs 24 heures restent exigées par la procédure de publication. La version et les résultats finaux sont enregistrés dans `reports/network-arrival/deployment/state.json` et le manifeste.

## Suite

Le rendu initial des fiches détaillées et des résultats de recherche reste à étendre. La première réponse des listes Blocs/Transactions mérite un contrôle de concurrence avec le flux déjà reçu. Les agrégats de marché et les frais sur vingt-quatre heures conservent les limites documentées précédemment.

Pour Google, les 24 rubriques disposent du HTML initial depuis la publication précédente. L’accès à la propriété Search Console, la soumission effective du sitemap et les positions réelles restent à confirmer. Les changements techniques n’établissent pas une présence en première page. Google précise qu’une réexploration peut prendre plusieurs jours ou semaines et qu’une demande ne garantit pas l’indexation : https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl?hl=fr .

## Propagation des fichiers

Les premiers passages de validation de la version intermédiaire ont observé des anciens numéros de version et onze réponses 404 sur des requêtes de nouveaux fichiers. Tous ces fichiers étaient absents de la version précédente et n’étaient donc pas référencés par son interface conservée pendant cette étape. Leur classement est enregistré dans `reports/network-arrival/compatibility-404-classification.json`. Deux passages complets consécutifs ont ensuite réussi avant l’envoi de la nouvelle interface. Cela distingue une vérification anticipée des fichiers à venir d’une panne démontrée sur les ressources utilisées par les visiteurs.

## Résultat public

Version `2173da0f-b0f0-4880-a34b-f40514d295d8` publiée et vérifiée. Après activation : six scénarios Réseau contrôlés, douze parcours Réseau avec API réelles (WebSocket/repli HTTP), 78 arrivées de pages, 28 compositions natives, 12 délais de reprise, 18 transferts de saisie, six accueils sur chaîne réelle et 18 rapprochements des compteurs sur 24 heures. Deux passages complets de 963 contrôles HTTP ont réussi après propagation.

Le moniteur a observé 743 arrivées sans échec de ressource initiale entre 09:49:25 et 10:05:07 UTC, sur un seul emplacement. Cela ne couvre pas toutes les régions ni tous les imports tardifs. Le manifeste contient tous les résultats et tentatives.

L’audit séparé de concurrence des listes a confirmé le délai initial sur les quatre combinaisons Blocs/Transactions × Mainnet/Sepolia ; sa correction est préparée dans la source ledger-arrival du même jour, sans modification de ce build publié.
