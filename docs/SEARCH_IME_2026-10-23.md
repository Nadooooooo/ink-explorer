# Saisie pendant le démarrage — 23 octobre 2026

Version publiée et vérifiée : `5019ec70-093f-4bbf-adcf-f4d3d2e281e3`. Manifeste : `reports/search-ime/manifest.json`.

Source de cette correction : `ink-explorer-ime-20261023`.
La version et l’état de publication sont enregistrés dans `reports/search-ime/deployment/state.json` ; seuls des états `verified` prouvent les contrôles finaux.

## Défaut reproduit

Sur la version `34a02862-5594-488b-8b98-b64f172e8cda`, une composition japonaise commencée pendant le chargement de l’application perdait sa plage de remplacement lorsque React recréait le champ. La validation de `とうきょう` en `東京` produisait `とうきょう東京`. Le même clavier simulé dans le navigateur déjà initialisé produisait correctement `東京`. Les événements natifs et les deux résultats sont conservés dans `reports/search-ime/before.json`.

## Correction

Le script initial, autorisé par son empreinte CSP exacte, suit la composition avant le téléchargement de l’application. Le premier montage attend sa validation, son annulation ou la perte de focus. Il s’effectue dans la même tâche que la capture de la valeur, pour éviter qu’une nouvelle composition commence entre la capture et le remplacement du champ.

Le dernier événement de saisie peut arriver après `compositionend` : la reprise attend la tâche suivante avant de capturer la valeur. Les écouteurs initiaux sont ensuite retirés. Le champ conserve sa valeur et son focus ; une composition suivante appartient entièrement à l’application.

Quand le code est prêt mais que la saisie continue, l’aide de rechargement reste cachée. Il n’y a pas de délai arbitraire interrompant le clavier. Le HTML initial demeure utilisable et le démarrage reprend dès la fin de cette interaction. Les transports de données et les collecteurs ne sont pas modifiés.

## Vérification

- Compilation TypeScript/Vite et génération des vingt accueils sans données de chaîne enregistrées.
- 14 scénarios de composition native Chromium via CDP, sur Mainnet à 1440 px et Sepolia à 390 px : japonais, chinois avec remplacement d’une sélection, coréen, annulation, perte de focus, composition terminée avant le démarrage et composition dépassant huit secondes. Chaque scénario vérifie aussi une seconde composition et la requête réellement soumise.
- 18 scénarios de recherche ordinaire sur Chromium, Firefox et WebKit : valeur, sélection, focus, soumission et retour sur l’accueil.
- 22 scénarios d’arrivée, dont les trois moteurs, le mode sans JavaScript et les dix langues en grands caractères.
- 20 tests unitaires de métadonnées, Worker, pré-rendu et CSP ; quatre tests de rétention et de publication compatible.
- La procédure de publication exige les scénarios IME sur le candidat à 0 %, puis sur le domaine public, en plus des contrôles de fichiers, d’arrivée et de sources réelles existants.

Les rapports de publication conservent les essais transitoires aussi bien que les validations finales. Le suivi HTTP continu ne représente qu’un emplacement de client et ne lance pas de navigateur à chaque cycle.

## Limites et suite

CDP déclenche la composition native de Chromium ; ce n’est pas une simulation par `dispatchEvent`. Cela ne remplace pas un clavier japonais/chinois/coréen physique, ni le clavier virtuel de Safari sur iPhone. Les deux autres moteurs sont vérifiés pour la conservation de la saisie ordinaire, pas certifiés pour un IME physique.

L’indexation réelle et la visibilité de la requête « ink explorer » restent à établir dans Google Search Console. Aucun classement n’est garanti par ces vérifications. Les frais locaux sur 24 heures restent séparés : leur raccordement attend une couverture complète de reçus et une réconciliation indépendante. Les collecteurs et leurs bases restent dans `ink-explorer-rolling-metrics-20261023`.

## Incidents de validation conservés

Le contrôle des compteurs réels a d’abord échoué parce que son chemin SQLite était relatif à la nouvelle copie frontend, sans base locale. Il ne s’agissait pas d’une base absente du service actif. Le rapport initial est conservé dans `reports/search-ime/deployment/public-rolling-initial/`.

Le test accepte maintenant `INK_ROLLING_DATA_DIR`, ouvre les bases en lecture seule et échoue immédiatement avec un message explicite si le chemin est absent. La publication vérifie l’existence des deux bases avant tout envoi et enregistre le chemin dans son état de reprise. Les fichiers des collecteurs n’ont pas été copiés, déplacés ou modifiés. La reprise conserve les fichiers applicatifs publiés et refait les vérifications finales.

La validation finale a réussi : 18 rapprochements réels de compteurs sur les trois moteurs et les deux réseaux, six parcours réels de blocs/transactions/charge réseau, 14 compositions natives et 18 recherches ordinaires sur le domaine public. Le suivi de publication a enregistré 366 arrivées sans fichier initial manquant entre 08:25:16 et 08:33:17 UTC. Les essais préalables ont néanmoins observé 12 réponses 404 sur de nouveaux fichiers, une ancienne version du fichier mutable `theme.js` et des documents portant encore un numéro de version précédent ; ils sont conservés dans le manifeste. Aucun échec de fichier n’a été observé lors des quatre passages complets sur le candidat activé.
