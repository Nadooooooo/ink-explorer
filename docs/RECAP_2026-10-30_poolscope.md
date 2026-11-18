# État des travaux — 30 octobre 2026

**Correctifs locaux, non publiés.** Source actuelle `ink-explorer-pool-scope-20261030`, 732 fichiers figés. Les validations des pools et de leurs participants sont corrigées. Compilation, 288 tests unitaires et 233 parcours d'interface contrôlés réussis. La campagne réelle reste à 20/21 groupes : 423 réussites, un échec et 20 cas non exécutés sur 444 prévus. Le paquet actuel reste à valider entièrement. Le public f802 est inchangé ; les essais privés sont fermés.

Détails des pools (archive opérateur `ink-explorer-pool-scope-20261030/docs/POOL_SCOPE_2026-10-30.md`). [Bilan précédent des fiches](RECAP_2026-10-30_addressbudget.md). Résumé vérifiable (archive opérateur `ink-explorer-pool-scope-20261030/reports/pool-scope/summary.json`).

## Réalisé

| Travail | Résultat et portée |
| --- | --- |
| Identité réseau des pools | Catalogues, fiches, sondes, transactions et implémentations refusent les marqueurs invalides ou contradictoires, même imbriqués. Les marqueurs facultatifs absents et identifiants décimaux valides restent acceptés. |
| Participants des transactions | Projection commune des adresses/contrats, noms publics, vérification et proxy cohérents ; libellés privés retirés ; données étrangères refusées ; objet d'origine préservé. |
| Régression ciblée | 55 nouveaux cas : 37 échecs sur le parent, tous corrigés. Ensemble complet : 288/288 tests unitaires. |
| Interface et démarrage | 233/233 parcours contrôlés, trois moteurs, mobile/bureau, langues et reprise après données invalides. Commande directe de démarrage réparée : 25 scénarios inclus. Aucun appareil physique. |
| Profils et catalogues réels | Profils 100/100, catalogues HTML 128/128, pools HTML 32/32 et interactifs 12/12 réussis dans cette campagne. Les résultats de disponibilité antérieurs sont conservés. |
| Livraison des ressources | 1137/1137 vérifications réussies, 775 ressources actives et 447 conservées. Entrée JavaScript : +120 octets bruts, +30 gzip. |
| Diagnostic des retraits | L'échec du curseur se reproduit hors application : le fournisseur direct ne répond pas dans les 22 secondes d'observation. L'API locale conserve son délai de 12 s. Pas de cache ancien présenté comme actuel. |
| Paquets et secours | Quatre processus coordonnés, candidat/secours préparés, 18 tests de procédure réussis. Deux essais des vrais paquets échouent après 25 puis 22 contrôles réussis sur des documents Mainnet indisponibles : validation réelle du paquet actuel incomplète. |
| Correctifs précédents conservés | Fiche d'adresse 16 s ; 24 abandons prématurés supprimés dans la comparaison contrôlée précédente. Soldes canoniques exacts et N/A si preuve absente. POST, délais et annulation préservés. API 272 observations, documents d'adresse 104 et mécanisme installé 32 observations : résultats parent conservés, pas réexécutés ici. |
| Intégrité/public | 732 fichiers et dix outils vérifiés ; runtime : 722 comparés, 717 identiques, cinq adaptateurs déclarés. Huit processus, quatre fichiers d'entrée et version publique inchangés. Aucun service public redémarré. |

La campagne réelle s'arrête au quatrième des 24 cas de filtres : trois réussites, un échec de retraits avec curseur et 20 cas non exécutés. Les autres groupes terminent. Le total est **423 réussites, un échec et 20 non exécutés**, et non 443/444. Les deux échecs de paquets concernent les retraits puis les comptes ; ils sont conservés. Une requête fournisseur lente ne prouve ni une panne permanente ni que toute fluctuation réelle provient du code local.

## Reste à réaliser

| Priorité | Tâche | Critère de fin |
| --- | --- | --- |
| P1 | Disponibilité des index | Traiter comptes/appels/retraits, particulièrement les curseurs ; observer la stabilité et les reprises sans fausse fraîcheur. Finir les 20 cas de filtres interrompus. |
| P1 | Validation des paquets | Terminer les essais réels des nouveaux paquets et du secours ; renouveler WebSocket/temps réel, santé, sources et rétention avant toute publication demandée. |
| P1 | Barre mobile des pools | Réduire la hauteur relevée à 320 px : tri, ordre et textes redondants. Conserver les valeurs complètes, zones tactiles et accès clavier. Aucune correction visuelle de cette barre n'est incluse ici. |
| P1 | Secours des adresses | Profil minimal attesté par le nœud quand l'index tombe ; l'API de solde indépendant existe. Ne pas inventer noms, vérification ou compteurs. |
| P1 | Composants et cohérence | Recherche, menus mobiles, filtres, tableaux, courbes, dialogues, états vide/erreur/chargement, contenus longs, focus/zoom ; autres contextes de métadonnées hors pools. |
| P1 | Appareils/accessibilité réels | Android/iOS, Safari, clavier virtuel, lecteurs d'écran, orientation et zoom ; les moteurs simulés ne remplacent pas les appareils physiques. |
| P2 | Langues et HTML | Revue éditoriale globale, textes longs, premier HTML NFT, filtres pertinents, URL/contenu/canoniques cohérents. |
| P2 | Statistiques | Couverture historique, provenance, définitions, unités, agrégats, graphiques et gas ; aucune valeur inventée. |
| P2 | Performance/SEO | Mesures visiteurs et longues sessions, Search Console, indexation, contenu et maillage. Aucun classement Google garanti. |
| P2 | Exploitation | Anciens scénarios et lanceurs, restauration/reboot réels, rotations et déploiement sur demande explicite. |

Candidat local `dfac1197-e32f-4440-8b4a-f8293fce032b`, secours `66c38d48-8a2c-43cf-862e-116e85e9ab63`, outils `ink-explorer-release-ops-poolscope-20261030` (dix fichiers figés, schéma 2). Le site du test de paquets lit la passerelle publique inchangée ; le canari complet séparé utilise les deux API, la passerelle et le site du candidat. Les 32 observations antérieures par lanceurs installés sont conservées. Aucune installation publique, activation PM2, restauration ou reboot réel effectué.
