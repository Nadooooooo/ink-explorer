# Prochaines étapes — 28 octobre 2026

État courant au 30 octobre : f802 reste publique sur serveur/Cloudflare Tunnel. Candidat transfer-recovery, 667 sources figées ; livraison release-ops-transfer-recovery-20261030 non installée. Reprise automatique de première lecture échouée, Retry-After, retry manuel et focus corrigés. 36 tests réexécutés, 72 parcours contrôlés/12 réels réussis ; canari 32 visites HTML/937 contrôles, procédure 12/paquet 24 réussis. Les incidents 503 des parents restent ouverts malgré la dernière fenêtre réussie. Tableau courant : RECAP_2026-10-30.md. Les jalons suivants sont historiques.

## Priorité 1 — sortir du quota Worker

- [x] Copier exactement le frontend public sur le serveur, préserver URL/SEO, tester HTML, API, WebSockets et retour arrière.
- [x] Corriger la validation de cible HTTP et isoler le cache par hôte ; protection active sur 4197, 692+24 contrôles après redémarrage.
- [x] Droit Cloudflare Tunnel — Modifier pris en compte le 29 octobre ; Tunnel sain avec quatre connexions.
- [x] Hôte provisoire non indexable validé : 690 contrôles, 22 parcours d’arrivée et six parcours réels.
- [x] Démarrage sélectif utilisateur activé avec Linger=yes, www/root basculés et validés, cache et revalidation304 confirmés ; Worker conservé pour retour arrière.
- [x] Surveillance initiale : 35 observations sur trois minutes sans erreur ; moniteur PM2 existant maintenu.
- [ ] Poursuivre la surveillance de durée longue, les mesures multi-régions et Search Console. Le cache des pages reste assuré sur le serveur ; les fichiers statiques sont servis par le CDN.

## Priorité 2 — livrer les corrections vérifiées

- [x] Rendu optimisé, frais sur 24 h exacts et couverture contrôlée, reprise des activités d’adresse, journaux, NFT et historiques de tokens, provenance des statistiques.
- [x] Troncatures320 px, pluriels français, contrôles mobiles Chromium/Firefox/WebKit.
- [x] Suivi des opérations utilisateur, reprise des onglets de transaction initialement vides, bornage des vrais vides et protection de l’historique.
- [x] 404 localisées sans JS, distinctions valeur d’appel/transfert, pages de flux vides compactes.
- [x] Validation locale du candidat plus récent : 96 scénarios de reprise/expiration/copie, 747 contrôles de livraison, 24 vues réelles et 132 contrôles clavier.
- [x] Correctif API de cache étendu aux fiches après reproduction : 176 lectures réelles de listes et 352 de fiches, 40 documents HTML et 12 parcours navigateur réussis sur les deux réseaux.
- [x] Premières arrivées avec index lent : fenêtre de nœud vérifiée, sans frais/cursor inventés, 40 documents en 518–602 ms dans l’essai local retardant l’index de quatre secondes ; 96 scénarios contrôlés réussis.
- [x] Première livraison coordonnée préparée et testée localement : douze tests de procédure et 22 contrôles avec le vrai produit, secours conservant les nouveaux fichiers. Rapport `ink-explorer-release-ops-20261029/docs/RELEASE_2026-10-29.md`. Lanceurs publics inchangés ; aucune publication.
- [ ] Livrer ensuite le candidat validé sur le serveur, avec une procédure de release/retour arrière adaptée, sans réintroduire de rattachement Worker. Vérifier les ressources retenues et tous les parcours publics concernés sur les deux réseaux. Un test local réussi ne signifie pas que le visiteur reçoit déjà cette version.

## Données et exploitation

- [x] Échantillon de10 transactions/251 appels internes rapproché d’un rejeu EVM et des blocs canoniques.
- [ ] Étendre cette couverture aux autres types d’appel et à l’historique ; une première page non vide ne prouve pas la complétude de l’index.
- [ ] Traiter les reçus historiques élagués, encore dépendants de l’indexeur.
- [x] Cadence de totalBlocks observée sur deux jours : environ deux heures, cohérente avec le code amont. Rapport `ink-explorer-aggregate-audit-20261028/docs/AGGREGATE_PROVENANCE_2026-10-28.md`.
- [ ] Établir les dates de calcul des autres agrégats ; leur réponse HTTP ne fournit pas ces dates.
- [ ] Compléter les identités de contrats uniquement avec une preuve de nom/proxy/vérification.
- [ ] Vérifier le redémarrage complet planifié de la chaîne Ink après bascule, les sauvegardes, l’espace disque et le Tunnel ; ne pas activer la restauration PM2 globale.

## Google et qualité terrain

- [ ] Obtenir l’accès propriétaire à Search Console ; soumettre les sitemaps et inspecter les pages utiles après migration.
- [ ] Mesurer exploration, canoniques retenues, impressions/clics/positions et passage des robots validés dans le WAF. Aucun classement en première page n’est établi ni garanti.
- [ ] Tester iPhone/Android physiques, clavier logiciel, orientation, zoom, reprise après verrouillage et retour d’application.
- [ ] Tester VoiceOver/TalkBack et mesurer performances réelles des visiteurs.
- [ ] Étudier le BFCache des fiches tout en conservant la politique de fraîcheur ; ne pas annoncer un succès natif lorsque Chromium le refuse pour no-store/WebSocket.

Jalon précédent du 29 octobre à 22:02 UTC : candidat alors courant `ink-explorer-transaction-labels-20261029` (647 sources), livraison `ink-explorer-release-ops-transactions-20261029`. Types et méthodes corrigés dans le HTML, les listes, les fiches et les filtres ; le nœud conserve les faits sans déduire l’exécution d’un simple payload. Démarrage local Node 24 exercé par les fixtures. 120 tests de logique, 16 essais de filtres, 44 contrôles API/HTML, 24 parcours sémantiques, 48 cas à froid, 84 cas de relais/géométrie et 880 contrôles de livraison réussis. Canari réel : 180 lectures, 40 documents, 12 parcours et 54 contrôles. Douze tests de procédure et 22 contrôles du paquet et du secours réussis. Aucune publication. Les autres composants, appareils physiques, agrégats, historiques, Search Console, sauvegardes et démarrage complet restent ouverts.


Jalon précédent du 29 octobre à 22:45 UTC : candidat alors courant transfer-integrity (652 sources), remplaçant la préparation transaction-labels dans la liste de livraison. Cinq réponses invalides reproduites puis rejetées, montants exacts/N/A, plantage de miniature NFT corrigé, carte NFT pleine largeur à 320 px et sens des chiffres corrigés. 32 tests, 42 parcours d’annuaire, six parcours d’historique NFT, 24 réponses/1 200 lignes et 895 contrôles de livraison locale passent. Douze tests de procédure et 22 contrôles des vrais paquets et du secours passent. Huit PID et entrées publics conservés ; f802 inchangée. Priorité après activation autorisée : étendre les premiers HTML aux autres annuaires, puis couverture historique, agrégats, appareils physiques/accessibilité, Search Console et restauration.


Actualisation à 23:42 UTC : transfer-arrival est le candidat courant (663 sources). Les transferts non filtrés sont dans le premier HTML, la reprise conserve géométrie et focus, le cache de page est contourné et les deux caches API de cette liste sont limités à cinq secondes. 61 tests, douze parcours de relais et deux passes couplées de vingt documents/douze visites sans JS réussissent. Dernière observation : 120 documents/60 secondes sans erreur ; contrôle complet 909/909, procédure 12/12 et paquets/secours 24/24. Deux 503 antérieurs demeurent inexpliqués ; ne pas effacer le premier canari en échec. Priorités ouvertes : disponibilité/diagnostics, autres premiers HTML, expiration des mises à jour en attente et horloges, démarrages très lents, appareils physiques/accessibilité, historiques/agrégats, Search Console et restauration. Aucun changement public.


Actualisation du 30 octobre : l’expiration des mises à jour en attente et les garde-fous d’horloge sont maintenant validés localement dans update-expiry. 923 contrôles de livraison et 24 contrôles des vrais paquets passent ; cela ne lève pas l’échec de disponibilité 30/32 du canari HTML. 656 sources du runtime comparées sans écart hors trois adaptateurs, dix fichiers racine/configuration non copiés. Reste prioritaire : réponse à froid de l’index et disponibilité, puis autres premiers HTML, démarrages lents, appareils réels/accessibilité, traductions, historiques/agrégats, Search Console et restauration. Tableau courant : RECAP_2026-10-30.md. Aucun changement public.


Dernière actualisation du 30 octobre : transfer-recovery remplace la préparation update-expiry comme candidat courant, sans publication. Le navigateur reprend automatiquement une première lecture échouée, respecte les cooldowns, conserve le contrôle lors d’un retry manuel et ignore une ancienne réponse même si son transport ignore AbortSignal. Le focus natif perdu lors du remplacement d’une ligne initiale est corrigé. La disponibilité du premier document lors d’un index lent demeure distincte et ouverte. Canari courant 32/32 et 937/937, paquets 24/24, huit PID conservés. Les échecs antérieurs sont conservés.
