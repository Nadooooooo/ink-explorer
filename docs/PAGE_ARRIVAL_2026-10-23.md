# Accès direct aux pages — 23 octobre 2026

Source : `ink-explorer-page-arrival-recovery-20261023`.
Version publiée et vérifiée : `70a73f95-3e29-4a52-ab6c-bf8eaf2a1599`. Validation finale achevée à 09:36 UTC. Le manifeste est dans `reports/page-arrival/manifest.json`.

## Problème constaté

Sur la version `5019ec70-093f-4bbf-adcf-f4d3d2e281e3`, les accès HTTP directs à `/blocks`, `/txs`, `/tokens` et `/developers` contenaient les métadonnées, mais seulement un écran de chargement dans le corps. L’accueil disposait déjà de son interface initiale. Les pages internes dépendaient entièrement du téléchargement et de l’exécution de JavaScript pour afficher leur navigation et leur titre.

## Modification

Les 24 rubriques fixes disposent maintenant d’un rendu initial issu des composants réellement utilisés : 10 langues × 2 réseaux = 480 documents. Les fichiers sont produits depuis le build local en utilisant le domaine canonique comme URL de navigateur ; aucun appel au site public ou à une source externe n’est effectué. Toutes les réponses API et tous les WebSockets sont suspendus pendant la capture. Aucun prix, bloc, transaction ou compteur de chaîne enregistré pendant la compilation n’est publié.

Le Worker sert le document correspondant à la route, à la langue et au réseau. Il ajoute les feuilles de style propres à la page avant son affichage. Un fichier absent, invalide ou destiné à une autre route conserve le mécanisme indépendant de reprise. Les métadonnées, canoniques, règles d’indexation et protections CSP sont conservées.

Les URL comportant des paramètres autres que la langue reçoivent une structure neutre (titre et attente), puis l’application applique les filtres de l’URL. Cela évite de présenter des contrôles non filtrés comme s’ils correspondaient à la demande. La documentation API reste complète pour ses paramètres sans effet sur le contenu.

Les liens, les détails natifs et la recherche globale fonctionnent dès le HTML. Les autres contrôles attendent React avant d’accepter une saisie. Sur mobile, l’ouverture de la recherche fonctionne dès le script initial ; son état ouvert, sa valeur, son focus et sa sélection passent à l’application. Le placement de cette recherche repose sur le même CSS avant et après le démarrage. Sans JavaScript, le champ reste visible et son formulaire GET reste utilisable.

La page Réseau affiche maintenant son titre pendant l’attente ou l’erreur de sa première observation. Cette modification ne change pas ses transports de données.

## Vérifications locales

- TypeScript, compilation et capture de 480 pages sans réponse de chaîne.
- 28 tests unitaires de Worker, pages, pré-rendu, métadonnées, CSP et publication. Les boucles comparent les 480 documents, leur réseau/langue, leurs feuilles de style, les versions pour robots et visiteurs et les cas de fichiers absents ou corrompus.
- 72 combinaisons page/navigateur : les 24 rubriques à 320 px en français sous Chromium, 768 px en arabe sous Firefox et 1440 px en japonais sous WebKit. Elles vérifient le premier HTML, les débordements, la hauteur du header, les sélections, le focus, le texte et la fermeture de la recherche mobile. Deux parcours sans JavaScript vérifient l’API, les détails natifs et la recherche GET.
- Quatre URL filtrées : blocs remplacés, transactions échouées, tokens ERC-721 et recherche de token. La requête réellement émise reprend le filtre demandé.
- 28 scénarios de composition native Chromium : accueil des deux réseaux, blocs et tokens sur mobile ; validation, remplacement, annulation, perte de focus et attente prolongée.
- Inspection visuelle des captures mobile Blocs/API et de la capture WebKit d’échec.

## Défaut de reprise reproduit et corrigé

La première série locale a observé l’aide de rechargement visible sous WebKit. Deux séries suivantes avaient réussi sans expliquer cette observation. Le contrôle du candidat Cloudflare `61390519-9b7c-4947-b4b7-e386b7ca8945` l’a ensuite reproduite à 509–512 ms : le conteneur avait une visibilité calculée `hidden`, mais son contenu d’aide était visible. Le mécanisme précédent dépendait d’une animation de visibilité et de son héritage. Les captures et l’échec sont conservés dans `ink-explorer-page-arrival-20261023/reports/page-arrival/deployment/candidate-pages/`.

Ce candidat n’a pas été activé. Son routage à 0 % a été retiré, en conservant la version intermédiaire vérifiée et son interface précédente. Le moniteur de cette première publication a observé 417 arrivées sans échec de ressource initiale.

La nouvelle source remplace les animations de visibilité par l’attribut HTML `hidden` et un affichage explicite, commandé par le script initial. Une erreur de module affiche l’aide ; sinon elle n’apparaît qu’après huit secondes. Le délai est annulé au démarrage de l’application. La saisie IME en cours masque toujours l’aide, et le mode sans JavaScript conserve son explication propre.

Douze scénarios dédiés vérifient le délai sur une page avec rendu initial et une fiche sans rendu initial, avec et sans réduction des animations, dans Chromium, Firefox et WebKit. Les aides sont masquées au début, deviennent visibles après huit secondes et disparaissent quand l’application reprend sans rechargement automatique. Les 25 scénarios de reprise indépendants, les six pannes/reprises de l’accueil, les 78 parcours de pages et les 28 compositions natives ont également réussi après correction.

La procédure exige maintenant ces tests de délai et de pages avant activation et sur le domaine public. L’état de chaque tentative et ses rapports restent conservés.

## Suite

- Étendre le rendu initial aux fiches de blocs, transactions, adresses, tokens/NFT et aux résultats de recherche, avec les bons états d’identifiant absent ou en cours d’indexation.
- Vérifier spécialement l’expiration des informations de la page Réseau après perte de ses transports.
- Finaliser Search Console et mesurer l’indexation, les impressions et les positions réelles. Ces changements ne prouvent pas un classement Google.
- Valider les claviers et lecteurs d’écran physiques iPhone/Android.
- Raccorder les frais locaux sur 24 heures seulement après couverture complète des reçus et rapprochement indépendant. Les collecteurs et leurs données restent dans `ink-explorer-rolling-metrics-20261023`.

## Publication vérifiée

Le candidat corrigé et le domaine public ont chacun réussi deux passages de 948 contrôles HTTP. Après activation : 78 parcours de pages, 28 compositions natives, 12 scénarios de délai, 18 scénarios de recherche, six parcours avec blocs réellement reçus et 18 rapprochements des compteurs sur 24 heures. Les scénarios contrôlés utilisent des API simulées ; les deux derniers groupes utilisent les données publiques réelles et les bases locales de rapprochement.

Le moniteur a enregistré 771 arrivées entre 09:21:34 et 09:38:07 UTC sans échec de ressource initiale. Il observe un seul emplacement et le graphe initial de l’accueil, sans exécuter un navigateur. Les premiers contrôles de la version intermédiaire ont encore vu le numéro précédent pendant la propagation ; les échecs restent enregistrés, puis les deux validations consécutives exigées ont réussi.

Une interruption de procédure provenait du répertoire de compatibilité, qui contenait les fichiers publiables mais pas les tests navigateur. Le script vérifie maintenant la source de test correspondante avant publication et enregistre ce chemin pour la reprise. Aucune panne de l’application n’a été établie par cet échec de lancement du test.
