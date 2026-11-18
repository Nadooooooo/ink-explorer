# Arrivée sur le site, données actuelles et visibilité Google

Version Cloudflare publiée le 23 octobre 2026 : `f858b910-3395-4652-841b-23ffb9538b9d`.
Source : `ink-explorer-arrival-seo-20261023`.
Version précédente : `6bb6cd0d-59ec-4d56-8c91-595ade955f4b`.

## Corrections livrées

- L’accueil contient sa structure réelle dès la réponse HTML : navigation, recherche, emplacements des données, rubriques, liens et pied de page. Il ne commence plus par un écran de chargement couvrant toute la page.
- Les 20 versions (10 langues × Mainnet/Sepolia) proviennent du même composant React que le site. Les API sont bloquées pendant leur génération : aucun cours, compteur ou bloc enregistré à la compilation n’est publié comme valeur actuelle.
- Le navigateur remplace cette structure et charge les observations courantes. En cas d’échec, une aide compacte permet de recharger en conservant réseau, langue, filtres et fragment. Elle est cachée au démarrage normal et apparaît après une erreur ou huit secondes d’attente.
- Les dépendances JavaScript utilisent un nouveau préfixe de fichiers. Cela libère les anciens onglets WebKit dont le cache conservait un échec de modulepreload. Le défaut a été reproduit dans le même onglet : rétablir l’ancien fichier ne suffisait pas, les nouveaux chemins permettent de reprendre.
- La disposition mobile des panneaux Transactions/Blocs est définie aussi en CSS. Le premier HTML et l’application utilisent le même emplacement, avec changement d’onglet au clic et au clavier.
- L’accueil présente brièvement les recherches et outils disponibles. Titres, description, canonique et données structurées sont cohérents ; le site se décrit comme indépendant, sans revendiquer une publication open source qui n’est pas établie.
- Le contrôle après publication suit désormais toutes les dépendances statiques de JavaScript, même sans modulepreload. Un test couvre imports imbriqués, réexports, cycles, commentaires et fichiers manquants. Le précédent lecteur utilisait des champs de l’ancienne API du lexer et omettait des dépendances.

## Vérifications

Les preuves sont dans `reports/arrival-seo/manifest.json` et les rapports associés.

- Vérification TypeScript, compilation et 37 tests de données/activité réussis ; la dernière compilation inclut les modifications de disposition mobile.
- 23 tests de Worker, pré-rendu, métadonnées, démarrage, graphe d’imports et protections anti-spam réussis.
- 22 scénarios d’arrivée en local, puis 22 sur le domaine public : Chromium/Firefox/WebKit, 320/768/1440 px, thèmes clair/sombre, recherche sans JavaScript et dix langues avec police minimale de 24 px.
- 25 scénarios locaux de reprise sur les autres pages, puis six scénarios de panne/reprise de l’accueil en local et six sur le domaine public. Les API sont volontairement indisponibles dans ces scénarios ; ils ne constituent pas une preuve de données réelles.
- Six parcours publics sans interception des API ni WebSockets : trois navigateurs, Mainnet à 390 px et Sepolia à 1440 px. Aucun échec de requête ou erreur JavaScript observé. Les hauteurs avancent d’au moins deux blocs, les transactions affichées figurent dans les messages reçus et le hash du bloc correspond au RPC local.
- Pour ces six parcours, le gas utilisé et la capacité des 30 blocs ont été relus au RPC local. Les sommes et le pourcentage concordent exactement avec la règle du serveur (troncature à six décimales). La valeur affichée correspond à son arrondi d’interface.
- 26 contrôles de publication réussis après propagation : octets des huit fichiers initiaux, documents, robots, sitemaps, réseaux et protections existantes. 13 parcours de métadonnées réussis dans le navigateur.
- Le décalage cumulé observé avec Chromium pendant le passage du HTML à l’application était de 0,007 à 0,014 dans trois scénarios contrôlés. Ce n’est pas une mesure des Core Web Vitals de visiteurs réels. L’absence d’entrées de décalage dans les deux autres moteurs n’est pas une mesure à zéro.

## Incidents de validation conservés

Deux assets ont renvoyé 404 pendant la propagation initiale Cloudflare. Le rapport initial `post-deploy/results.json` conserve 24/26 succès ; `post-deploy-settled/results.json` conserve la validation finale 26/26. Correction de ce point lors de l’audit suivant : l’option `--old-asset-ttl 86400` utilisée ne prouvait pas cette conservation pour Static Assets. Une conservation explicite a ensuite été ajoutée ; voir `RELEASE_GATE_2026-10-23.md`. Il reste à étudier une publication en étapes pour réduire cette fenêtre, sans supposer qu’un déploiement Cloudflare soit instantanément visible partout.

Le test initial du pourcentage utilisait une tolérance plus fine que la précision publiée par le serveur. Il a été corrigé pour vérifier exactement la formule entière existante, sans modification des données en production. Un contrôle d’arrivée attend maintenant explicitement la feuille de style avant de mesurer sa disposition ; sous Firefox, attendre `document.fonts.ready` seul pouvait dépendre du module volontairement suspendu.

## Google : ce qui est fait et ce qui reste

Le contenu d’accueil est accessible en HTTP et ses liens sont explorables avant JavaScript. Les visiteurs et les robots reçoivent le même document. Les sitemaps et directives d’indexation sont accessibles ; cela facilite l’exploration mais ne prouve ni indexation ni classement.

Aucun accès à la propriété Search Console n’est disponible dans cette session. L’absence de TXT de validation dans le diagnostic DNS ne prouve pas que le site ne soit pas validé par une autre méthode. Les recherches publiques réalisées n’ont pas suffi à établir sa position exacte dans Google.

À finaliser avec le propriétaire :

1. Ouvrir Google Search Console et vérifier ou créer la propriété de domaine `inkexplorer.xyz`.
2. Si une validation DNS est demandée, fournir la valeur publique `google-site-verification=…` pour l’ajouter dans Cloudflare. Aucun mot de passe Google n’est requis.
3. Soumettre `https://inkexplorer.xyz/sitemap.xml`, inspecter l’URL d’accueil et demander son indexation.
4. Examiner ensuite les pages indexées, les impressions et la position de la requête « ink explorer ». Corriger les exclusions réellement signalées par Google.

La première page ne peut pas être garantie. Les agrégats externes (cumuls statistiques, prix et marchés) conservent leur propre cadence : la vérification du flux de blocs ne prouve pas leur heure de calcul. Les tests restent des tests de navigateurs automatisés, pas de téléphones physiques.

Documentation officielle consultée :
- https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics
- https://support.google.com/webmasters/answer/9008080?hl=fr
- https://bugs.webkit.org/show_bug.cgi?id=270357
