# Contrôles de publication et sélections au démarrage

Version publique vérifiée : `1adc6887-3cb9-4210-8cd8-7524dafe9836`.
Source : `ink-explorer-release-gate-20261023`.
Version remplacée : `f858b910-3395-4652-841b-23ffb9538b9d`.

## Interface

Le HTML pré-rendu ne conservait pas les propriétés sélectionnées des champs natifs. Avant JavaScript, la langue pouvait afficher English, la période 7D au lieu de 30D, et Sepolia afficher Mainnet dans son sélecteur. Ces trois cas ont été reproduits sur le domaine public avec JavaScript désactivé (`reports/release-gate/prerender-controls-before.json`).

La génération du HTML sérialise maintenant les options sélectionnées et l’état des champs. Les 22 scénarios de démarrage vérifient les valeurs avant et après montage de React, en plus de la disposition, du clavier, de la recherche native et des langues. Ils passent en local puis sur la version Cloudflare à 0 % de trafic.

## Publication

Le script historique activait immédiatement une version et réécrivait ensuite le secret d’origine et les réglages de domaine. Le nouveau script conserve l’infrastructure existante et procède ainsi :

1. Vérifier que la version active correspond à celle attendue.
2. Inventorier les octets du build et conserver les fichiers immuables des anciennes versions.
3. Charger le candidat en gardant les variables et secrets existants.
4. Le configurer à 0 % de trafic, l’ancienne version restant à 100 %.
5. Vérifier ses fichiers et ses vingt accueils traduits avec un en-tête de sélection de version ; exiger deux passages complets consécutifs et les tests navigateur.
6. Recontrôler la version active puis activer le candidat.
7. Vérifier à nouveau les fichiers, les documents et les données publiques réelles.

Un en-tête `X-Ink-Version` sur les documents permet de prouver que le contrôle a atteint le candidat. Il n’affecte pas le passage direct des fichiers statiques par Cloudflare. Les URLs de prévisualisation restent désactivées. Les reprises contrôlent les empreintes du build et l’état Cloudflare ; un verrou de processus empêche deux exécutions locales simultanées.

L’option Wrangler `--old-asset-ttl` du script précédent s’applique au mécanisme historique Workers Sites, pas à notre binding Static Assets. La durée de 24 heures n’était donc pas établie par cette option. La conservation est maintenant explicite : 193 fichiers immuables de cinq sources antérieures ont été embarqués, avec une expiration enregistrée. Les prochaines compilations conservent au moins 24 heures les fichiers de la version remplacée, sans prolonger indéfiniment ceux qui étaient déjà retenus. Les fichiers mutables, notamment OpenAPI, ne sont pas repris d’une ancienne version.

## Preuves et limites

- 26 tests de pré-rendu, Worker, métadonnées, graphe d’imports, rétention et vérification de publication réussis. Les tests injectent un fichier manquant, des octets modifiés, une mauvaise version et une collision d’URL immuable ; ces cas empêchent la validation.
- 22 contrôles navigateur locaux puis 22 sur le candidat Cloudflare avant activation.
- 397 contrôles par passage : ressources courantes, fichiers retenus et vingt accueils. Deux passages complets ont précédé l’activation ; deux autres ont terminé la validation publique.
- 25 contrôles publics ordinaires et six parcours réels Mainnet/Sepolia sur Chromium, Firefox et WebKit réussis. Les blocs, transactions et sommes de gas ont été rapprochés du nœud.
- Les premiers passages ont réellement détecté des 404. Les rapports sont conservés sans écrasement. Les erreurs ont aussi réapparu après activation malgré les passages réussis à 0 % : ce mécanisme réduit les erreurs de build mais **ne supprime pas encore la fenêtre de propagation**.
- La première exécution s’est terminée après son sixième passage public, alors qu’un seul passage complet venait de réussir. Le processus était terminé ; la reprise a vérifié la version déjà activée, puis ajouté les passages 7 et 8 et les tests finaux, sans nouvel envoi ni nouvelle activation.

Le résultat ne constitue pas une preuve de disponibilité dans tous les points de présence du monde, ni un test sur téléphone physique.

## Prochaines corrections étayées

1. **Saisie pendant le démarrage.** Un utilisateur qui écrit dans le champ HTML avant le montage de React perd son texte et le focus au moment du montage. Reproduit sur le site public avec le module temporairement suspendu : `search-handoff-before.json`. Préserver valeur, focus et sélection, puis vérifier la recherche après reprise sur les trois moteurs.
2. **Compatibilité pendant les publications.** Évaluer une première version gardant l’ancienne interface mais contenant déjà tous les nouveaux fichiers immuables, la vérifier sur le domaine public, puis activer la nouvelle interface. Le contrôle à 0 % seul n’a pas éliminé les 404 après activation.
3. **Indexation Google.** La propriété Search Console, la soumission du sitemap et les données d’indexation restent à confirmer avec le propriétaire.

Rapport faisant autorité : `reports/release-gate/deployment/state.json`, phase `verified`, et les rapports référencés dans `reports/release-gate/manifest.json`.

Sources officielles consultées :
- https://developers.cloudflare.com/workers/versions-and-deployments/
- https://developers.cloudflare.com/workers/versions-and-deployments/version-overrides/
- https://developers.cloudflare.com/workers/versions-and-deployments/version-urls/

L’applicabilité de l’option historique a été vérifiée dans le code installé de Wrangler 4.149.0 : `oldAssetTtl` est passé à `syncWorkersSite`, séparément du mécanisme `syncAssets` utilisé ici.
