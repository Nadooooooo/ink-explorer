# Suivi des transactions ouvertes — livraison vérifiée

Version : `ff42c8a1-83be-4a9d-8b9f-89e3108bca00`. Source : `ink-explorer-inclusion-recovery-20261023`.
Publication terminée avec le code 0 le 23 octobre 2026 à 14:00 UTC. Les deux étapes sont vérifiées dans `reports/transaction-follow/deployment/state.json` ; le manifeste et les empreintes sont dans `reports/transaction-follow/manifest.json`.

## Comportement livré

Une fiche indexée était chargée une fois : statut et confirmations restaient ceux de cette réponse. Le mémo des pages excluait également les transactions des destinataires du flux. Les fiches suivent maintenant les blocs canoniques et les reçus disponibles. Les confirmations utilisent une observation récente, du bon réseau et d’un nœud synchronisé. Une observation expirée ou interrompue donne N/A. L’inclusion seule n’est pas une preuve de succès.

Les événements du flux s’appliquent dès réception. Les détails de l’indexeur sont repris séparément toutes les cinq secondes si nécessaire, avec annulation et respect de Retry-After. Les fiches complètes finalisées ne nécessitent plus ces lectures tant que le réseau reste utilisable. Une erreur d’enrichissement ne vide pas la fiche.

Un remplacement observé retire l’ancien bloc, son résultat et ses frais. Si le flux ne peut pas prouver une réinclusion après une absence, le RPC existant vérifie le reçu en lecture seule. Une inclusion indexée contradictoire masque temporairement le compteur pendant cette vérification. Un reçu qui confirme l’ancien bloc borne cette vérification à quinze secondes. Aucune somme n’est convertie en flottant.

Les onglets restent ouverts. Les détails secondaires sont annulés et relus lorsque l’inclusion ou le résultat change, sans recharger le document ni réinitialiser leur pagination à chaque confirmation. Les champs inconnus de la fiche partielle ne deviennent pas une méthode « transfer », un input « 0x » ou une adresse inventée.

## Preuves

| Contrôle | Résultat |
| --- | --- |
| Modèles, requêtes, indexation, arrivée et SEO | 52 tests passés |
| TypeScript et compilation complète | Passés |
| Langues et polices | Dix langues, 320 px, RTL et glyphes personnalisés vérifiés |
| Suivi contrôlé | 18 scénarios, Chromium/Firefox/WebKit, Mainnet/Sepolia, 320/1440 px, avant et après activation |
| Suivi réel | Six parcours sans interception avant et après activation : progression rapprochée des RPC, un document, zéro lecture supplémentaire du détail historique |
| Arrivée des fiches | 40 documents localisés, 60 scénarios contrôlés, 16 parcours réels avant et après activation |
| Pages, listes et réseau | Suites héritées de publication passées ; détails dans le manifeste |
| Observation de publication | 2 381 arrivées, zéro échec de ressource observé, deux séquences avec environ deux secondes de chevauchement |

Le moniteur ne contrôle que le graphe initial depuis un emplacement client. Les essais navigateur utilisent des écrans simulés ; ils ne prouvent pas un téléphone physique ou les Core Web Vitals des visiteurs.

## Échecs conservés et corrections

- Le premier candidat `08431e1b-d393-49f9-a481-82992a556aa6` a été retiré à 0 % avant activation : une ancienne inclusion pouvait masquer une nouvelle hauteur indexée après une absence. La correction et son scénario sont inclus dans la version livrée. Retrait : `ink-explorer-transaction-follow-20261023/reports/transaction-follow/deployment/withdrawal.json`.
- Deux des six premiers contrôles réels exigeaient immédiatement deux messages WebSocket, alors que le premier état peut venir de l’instantané HTTP. Les six compteurs avaient progressé. La collecte conserve désormais les deux transports et exige des observations réelles ; les critères d’identité, de progression, de document unique et de rapprochement RPC restent exigés. Rapport initial : `deployment/retained-attempt-1/`.
- Un contrôle Chromium sans JavaScript a dépassé l’attente des styles/polices, avec un document HTTP 200 et sans erreur HTTP de ressource relevée. La cause reste inconnue. Le défaut n’a pas été reproduit sur la même URL ni lors des deux passages suivants de 16 parcours. Les diagnostics ont été enrichis sans modifier le produit ni assouplir le critère. Rapport initial : `deployment/retained-public-attempt-1/`; diagnostic : `no-js-font-recheck.json`.

Les rapports de déploiement sont sous `reports/transaction-follow/`. Les contrôles finaux sont tous complets et réussis. Les anciens rapports d’arrivée HTML restent dans `ink-explorer-record-arrival-20261023/reports/detail-arrival`.

## Limites et suite

Les adresses, tokens/NFT, pools et recherches doivent encore recevoir leur contenu initial et leur suivi adapté. Les réorganisations historiques hors de la fenêtre observée et la cohérence par hash de bloc des logs/traces restent à renforcer. Les profils d’adresses et de tokens sont encore relus périodiquement.

Les frais locaux sur 24 heures ne sont pas complets : l’observation du 23 octobre à 13:56 UTC compte encore 264 414 reçus manquants sur Mainnet et 60 944 sur Sepolia. Les totaux de transactions sont disponibles, les frais complets restent N/A.

Robots.txt, sitemaps et pages principales répondent correctement. L’accès propriétaire à Search Console, l’indexation et le classement Google ne sont pas établis par ces tests. Le suivi complet reste dans `NEXT_STEPS_2026-10-23.md`.

Aucune API n’a été redémarrée, aucun nouveau service n’a été créé et aucun code n’a été publié sur GitHub. Les aperçus et moniteurs temporaires de cette livraison sont arrêtés.
