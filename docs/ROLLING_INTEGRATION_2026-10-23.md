# Intégration du compteur canonique sur 24 heures

Version publiée et vérifiée le 23 octobre 2026 : `34a02862-5594-488b-8b98-b64f172e8cda`. La procédure complète et ses deux étapes sont en phase `verified` dans `reports/rolling-metrics/deployment/state.json`. Le manifeste est `reports/rolling-metrics/integration-manifest.json`.

## Comportement

L’accueil, le résumé des transactions et les statistiques utilisent désormais le compteur du nœud local, transmis dans `rolling24h` par les WebSockets existants et `/api/live/snapshot`. Le contrat de `/api/stats/counters` reste celui de l’indexeur. Les graphiques et compteurs de frais ne changent pas de source.

La fenêtre comprend toutes les transactions incluses dans les blocs canoniques des dernières 86 400 secondes : succès, échecs, dépôts L1 et opérations système. Les transactions en attente et les appels internes ne sont pas ajoutés. La borne de début est exclue, celle de fin incluse. L’aide donne les heures et les numéros de blocs de cette fenêtre ; les nombres sont affichés exactement dans la langue choisie.

Avant affichage, le serveur et le navigateur vérifient le réseau, sa synchronisation, la couverture, les bornes, l’âge de l’observation et l’appartenance du bloc de fin à la chaîne courante. Une observation vieille de plus de cinq secondes, un collecteur arrêté, un hash remplacé, une couverture incomplète ou une connexion interrompue donne `N/A`. Un minuteur côté navigateur expire aussi le compteur lorsque le transport reste silencieux. Aucun ancien chiffre de l’indexeur ne le remplace.

Le passage hors ligne suspend maintenant immédiatement les connexions et requêtes du flux. Le retour en ligne recrée les transports ; les réponses d’une génération précédente restent rejetées. Les graphiques ne sont pas rechargés à chaque changement du compteur.

L’icône d’aide suit le style carré arrondi existant. Son placement a été séparé de celui de l’icône décorative : ni chevauchement du libellé en arabe, ni débordement de la carte sur un petit écran. La zone tactile conserve au moins 44 px de haut.

## Vérifications

- Douze tests unitaires : neuf sur le collecteur et trois sur la validation/lecture des observations. Les reçus, bornes, réorganisations, interruptions et réponses anciennes sont couverts.
- Compilation TypeScript, 37 tests de données/activité et génération des vingt accueils traduits.
- Vingt contrôles de HTML initial, Worker, politique de thème et protection anti-spam.
- Trente-six scénarios navigateur : trois moteurs × deux réseaux × deux tailles × trois pages. Ils couvrent les nouveaux blocs, une baisse de hauteur, une branche remplacée, l’expiration, les états hors ligne, la reprise, l’indépendance de l’indexeur et l’absence de rechargement des graphiques. Contrôle Axe des erreurs graves/critiques et vérification géométrique des icônes et libellés. Un défaut du banc d’essai WebKit (`pauseAt` visant un instant déjà passé) a été corrigé puis le scénario relancé ; les journaux initiaux restent conservés.
- Douze scénarios du cycle de vie sur Chromium, dont les retours réels via le cache de navigation sur les deux réseaux.
- Dix-huit parcours avec sources réelles : chaque moteur visite les trois pages sur les deux réseaux. La valeur affichée est rapprochée d’une trame WebSocket reçue, du total des blocs conservés et du hash du bloc dans le RPC local.
- Vingt contrôles de mise en page à 320 px : dix langues sur Chromium et Firefox, ce dernier avec une taille minimale configurée pour les polices occidentales. Le nombre de test à neuf chiffres reste entièrement visible, sans chevauchement de l’aide.
- La procédure de publication ajoute les scénarios du compteur avant activation et le rapprochement avec les sources réelles après activation. Les contrôles de chargement, de saisie initiale et de flux réel existants restent présents.

Les rapports exacts sont dans `reports/rolling-metrics/`. `browser-final/` conserve la première série fonctionnelle réussie ; `browser-layout/` et `browser-layout-retry/` concernent l’ajustement visuel et la reprise du test WebKit. `deployment/candidate-rolling/` est la série complète portant sur les fichiers réellement publiés. Les résultats ne constituent pas un test sur un téléphone physique.

## Incident de redémarrage et correction

Le premier `pm2 restart inkexplorer-api --update-env` a repris `PORT=8787` depuis l’environnement de la console. L’API Mainnet n’a alors plus écouté sur 4194 et a échoué à démarrer sur le port déjà occupé. Le HTML Cloudflare est resté disponible, mais les requêtes Mainnet d’origine ont été interrompues pendant cette opération.

La configuration explicite de production a été réappliquée et les réponses publiques des deux réseaux ont été vérifiées. Le chemin des agrégats est conservé dans les fichiers d’environnement de chaque API. Depuis la racine de la copie déployée, le redémarrage utilise le fichier de configuration et cible l’application :

```bash
pm2 startOrRestart ./ecosystem.production.config.cjs \
  --only inkexplorer-api --update-env
pm2 startOrRestart ./ecosystem.production.config.cjs \
  --only inkexplorer-sepolia --update-env
```

Les ports attendus restent 4194/4196, avec écoute sur `127.0.0.1`. Vérifier ces champs avant l’action, puis la synchronisation et les réponses publiques après. Ne pas se fier au simple état `online` de PM2 : un processus peut encore échouer après son démarrage.

Les trois fichiers serveur installés, leur sauvegarde et l’incident sont décrits dans `backend-install.json`. Aucun nœud, DNS, secret de passerelle ni dépôt GitHub n’a été modifié. L’état PM2 a été sauvegardé après rétablissement.

## Limites restantes

Les frais locaux sur 24 heures restent `null` tant que des reçus nécessaires manquent ; leur intégration visuelle nécessite une couverture complète et un rapprochement supplémentaire. La fraîcheur détaillée des autres agrégats externes reste à établir. La propriété Search Console, l’indexation Google et les essais avec appareils et aides techniques réels restent ouverts. Voir également `ROLLING_METRICS_2026-10-23.md`.

## Contrôle de la publication

Le candidat publié a passé les 36 scénarios du compteur avant activation, puis 18 parcours avec données réelles sur le domaine public. Les 25 contrôles généraux, six parcours publics du flux, 18 contrôles de conservation de la saisie et les accueils ont également passé leurs vérifications. Le moniteur a enregistré **371 arrivées sans échec de fichier initial** pendant cette publication, depuis un seul emplacement ; ce contrôle HTTP ne remplace pas une mesure mondiale ni un test de toutes les ressources différées. Les documents ont parfois conservé brièvement le numéro de version précédent ; ces tentatives restent dans les rapports avant les passes finales.

Les contrôles exhaustifs ont néanmoins rencontré **12 réponses 404 transitoires sur de nouveaux fichiers** pendant les étapes de prépositionnement. Aucun de ces chemins n’existait dans le build précédent, encore affiché à ce moment ; ils ont été revérifiés avec succès avant activation de la nouvelle interface. Une réponse publique OpenAPI a aussi conservé temporairement les anciens octets après activation. Ces échecs sont conservés dans le manifeste et les rapports numérotés. Le résultat « 371 arrivées sans échec » porte uniquement sur les fichiers initiaux effectivement demandés par le moniteur, pas sur tous les chemins durant toutes les étapes.
