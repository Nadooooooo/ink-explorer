# Fiches de blocs et transactions — arrivée directe

État : publiée et vérifiée. Version Cloudflare `34e5747c-af47-4c5c-b743-43d2bc7aa411`, issue de `ink-explorer-record-arrival-20261023`. Le processus de publication s’est terminé avec le code 0 le 23 octobre 2026 à 12:39 UTC. Rapport : `reports/detail-arrival/manifest.json`.

## Comportement

À l’ouverture d’une fiche, Cloudflare demande un enregistrement à la passerelle authentifiée et produit le contenu HTML dès cette réponse. Le navigateur reçoit les mêmes données pour démarrer l’interface sans les effacer ni les demander à nouveau. La lecture initiale est limitée à 2,5 secondes et à 512 Kio, corps de réponse compris ; elle n’allonge pas indéfiniment le chargement si la source est indisponible.

Les blocs sont rapprochés de leur hauteur ou de leur hash demandé. Les transactions sont rapprochées de leur hash. Réseau, date de lecture et identité sont contrôlés avant réutilisation. Une source signalée comme ancienne ou lue il y a plus de quinze secondes ne fournit pas de valeurs au premier document. Le navigateur refuse aussi une amorce vieille de plus de dix secondes et redemande alors les données. Les montants restent des entiers exacts jusqu’au formatage.

Une inclusion attestée mais encore en cours d’indexation conserve l’identifiant et reprend la lecture côté navigateur. Une panne ou un 404 isolé de l’indexeur ne prouve pas l’inexistence sur la chaîne : le premier document signale une indisponibilité temporaire, avec HTTP 503 et Retry-After. Il reste utilisable par le navigateur et ne présente pas de données inventées. Les chemins mal formés conservent leur 404.

Le build produit quarante structures de fiches : deux types, dix langues et deux réseaux. Aucune donnée de chaîne ni identifiant de démonstration n’est conservé dans ces structures. Les requêtes publiques ne contiennent pas le secret de la passerelle. Les valeurs intégrées au HTML et au JSON sont échappées.

## Vérifications

Les tests `record-arrival-test.mjs` et `record-document-test.mjs` couvrent identité, réseau, dates, délais, taille, injection, statuts, langues et canoniques. Les scénarios navigateur contrôlés couvrent cinq états : disponible, indexation, panne, rétablissement automatique et amorce expirée, puis un changement de fiche sans afficher la précédente. Les scénarios réels rapprochent blocs et transactions des deux RPC et comprennent des ouvertures sans JavaScript.

Ces deux séries de navigateur font partie des contrôles de publication avant et après activation. Les tests de listes et flux existants restent exigés. Résultats : 50 tests unitaires et 10 cas workerd. Avant et après activation : 40 documents réels dans les dix langues, 60 scénarios navigateur contrôlés et 16 ouvertures avec données réelles, dont quatre sans JavaScript. Les suites existantes de recherche, IME, pages, listes, réseau, flux et compteurs ont aussi passé la procédure. Un dernier contrôle de 40 documents a redécouvert ses références directement sur les RPC, sans dépendre d’un rapport local antérieur. Les résultats complets sont liés dans le manifeste.

## Incidents de validation conservés

- Le premier test unitaire changeait uniquement le hash d’un bloc demandé par hauteur ; ce n’est pas un désaccord d’identité. Le scénario a été corrigé pour changer la hauteur demandée.
- Les premières séries sur Firefox attendaient le statut global des polices pendant que le module était volontairement retenu. Les faces effectivement demandées étaient chargées, mais Firefox ne terminait ce statut qu’après le module. Le test observe maintenant les faces individuelles et capture cet affichage intermédiaire.
- Une série de tests de documents a été lancée pendant la reconstruction du répertoire `dist` et a rencontré des fichiers temporairement absents. Les contrôles du build doivent être lancés après la fin de la compilation ; le rapport initial est conservé.

- Le premier candidat Cloudflare (`b09fa455-88c0-4fc7-9585-8b26398f3ced`) a échoué sur les quarante lectures réelles à 0 %. La cause est `fetch(..., {redirect: "error"})`, accepté par Node.js mais rejeté par Workers. L’API publique et les nœuds fonctionnaient. Ce candidat a été retiré avant activation ; seuls les fichiers compatibles et l’interface antérieure ont été servis aux visiteurs. Le candidat corrigé utilise `redirect: "manual"` et rejette tout code 3xx. Un test du moteur workerd vérifie la lecture, les données périmées, les mauvaises identités, les corps invalides ou suspendus et l’absence de suivi des redirections authentifiées. Les quarante documents réels sont maintenant contrôlés avant et après activation.

Les 731 fichiers actifs du navigateur ont été copiés sans modification depuis le build déjà validé. Le changement correctif concerne le Worker ; la provenance et les empreintes sont conservées dans `reports/detail-arrival/build-provenance.json` et les manifestes de publication. Les premiers rapports locaux complets restent dans `ink-explorer-detail-arrival-20261023/reports/detail-arrival`.

Le candidat suivant, `1c9ec85c-2547-4e51-9f51-546e606ea4f7`, a réussi 38 des 40 documents publics mais deux lectures ont atteint la limite de 1,5 seconde. Il a également été retiré avant activation. Une mesure distincte de 32 routes publiques a donné zéro erreur, une médiane de 376 ms, un 95e centile de 1 075 ms et un maximum de 1 484 ms : la marge initiale était trop faible. La limite est portée à 2,5 secondes ; un dixième test workerd couvre une source saine répondant après 1,7 seconde. Les rapports antérieurs sont conservés et ne sont pas présentés comme des validations complètes.

La troisième publication a été interrompue après la promotion de son interface intermédiaire parce que le contrôle immédiat de l’état Cloudflare ne correspondait plus à la valeur attendue. Une nouvelle lecture a confirmé la même promotion à 100 %, sans déploiement ultérieur dans l’historique retourné, puis la procédure a été reprise. Une réponse API momentanément incohérente est une hypothèse ; sa valeur divergente n’a pas été capturée. Voir `deployment/phase-check-note.json`.

Le moniteur de la première séquence a observé 874 arrivées sans erreur. Dans la seconde séquence, une requête d’accueil à 12:08:24 UTC a échoué avec `fetch failed`, sans statut HTTP ni version reçue. Sa cause n’est pas établie. Les résultats du moniteur doivent être présentés avec cet échec, même si les contrôles ultérieurs réussissent.

Une ouverture Sepolia de la série réelle suivante a dépassé 2,5 secondes (15/16 premiers documents disponibles). La limite n’a pas été augmentée de nouveau : une source temporairement indisponible doit rester déclarée comme telle. Le contrôle navigateur vérifie désormais aussi, si le premier document renvoie un 503 structuré, la reprise automatique jusqu’à une réponse API fraîche rapprochée du RPC, avec un seul document et aucun clic. Les quatre cas sans JavaScript exigent toujours du contenu en HTTP 200. La disponibilité initiale et le délai de récupération sont enregistrés séparément. Douze scénarios contrôlés supplémentaires imposent cette transition 503→données sans clic ; la série comporte maintenant soixante cas. La série réelle en échec est conservée sous `candidate-records-real.initial-status-check`.

## SEO et limites

Le contenu des blocs et transactions est désormais préparé à la requête, pour les visiteurs comme pour les robots. Cette approche suit les [recommandations Google pour JavaScript](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics). Elle ne prouve ni indexation ni classement : les diagnostics de propriété dans Search Console restent à obtenir. Une recherche publique ne remplace pas ces données.

Cette livraison ne couvre pas encore le HTML initial des adresses, tokens/NFT, pools et résultats de recherche. Elle ne garantit pas non plus que tous les agrégats de l’explorateur sont récents. Les essais navigateur automatisés ne remplacent pas les appareils physiques. Les données détaillées restent tributaires de l’indexeur pour leurs enrichissements ; leur date de téléchargement n’établit pas la date de calcul de chaque champ.

## Bilan de surveillance

Trois séquences, depuis un seul emplacement, totalisent 2 354 lectures de l’accueil et de son graphe initial : 874 sans échec, 366 avec trois échecs de transport, puis 1 114 sans échec. La dernière séquence couvre 12:16:34–12:40:14 UTC et inclut l’activation de la version publiée. Elle ne remplace pas la surveillance de toutes les routes ni celle des visiteurs réels. Les sondes temporaires et les prévisualisations sont arrêtées.

Quatre mesures Chromium en chargement normal, aux largeurs 390 et 1 440 px, ont relevé une somme de déplacements de mise en page entre 0,0000308 et 0,000157. Il s’agit de mesures de laboratoire limitées à ces parcours, pas de Core Web Vitals terrain. Voir `reports/detail-arrival/candidate-layout/results.json`.
