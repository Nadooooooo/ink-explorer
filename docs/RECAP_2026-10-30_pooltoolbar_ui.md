# État des travaux — 30 octobre 2026

**Correctifs locaux, non publiés.** Source actuelle `ink-explorer-pool-toolbar-20261030`,733 fichiers figés. Nouvelle passe d'ergonomie des pools : barre mobile deux fois moins haute, champs tablette lisibles, ordre clavier corrigé et montants agrandis sans chevauchement.293 contrôles d'interface et cinq tests de prérendu réussis. Le public reste inchangé.

Détails de cette passe (archive opérateur `ink-explorer-pool-toolbar-20261030/docs/POOL_TOOLBAR_2026-10-30.md`). [Bilan précédent : identité des pools](RECAP_2026-10-30_poolscope.md). Résumé vérifiable (archive opérateur `ink-explorer-pool-toolbar-20261030/reports/pool-toolbar/summary.json`).

## Réalisé

| Travail | Résultat |
| --- | --- |
| Barre des pools sur mobile | À320 px :427,59→208 px, soit219,59 px libérés (51,36 %). Tri et filtres regroupés, tri choisi toujours visible ; réinitialisation sans action masquée. |
| Tablette | Grille à trois colonnes ; les 22 échecs initiaux de textes coupés sont corrigés dans la matrice finale78/78. |
| Texte agrandi | Noms complets et montants se réorganisent ; chevauchement observé puis reproduit et corrigé. Mesures des fragments de texte réels et des cellules. |
| Clavier/accessibilité | Bouton avant les champs, contrôles fermés hors tabulation, focus préservé au changement de largeur ; cibles44 px, texte des champs16 px, flèches locales et couleurs forcées. |
| Vérifications actuelles |293/293 observations d'interface : trois moteurs, six largeurs pour les champs, dix langues, clair/sombre, français et arabe sur mobile/ordinateur, minimum Firefox 32 px. Cinq tests de prérendu ; ressources et733 fichiers vérifiés. |
| Performance | JS +272 octets gzip, CSS +164 octets gzip ;775 ressources actives et462 conservées. |
| Correctifs précédents | Validations réseau des pools, participants/proxy/noms publics, soldes canoniques et budgets de première visite conservés.288 tests unitaires et221 parcours hors pools du parent sont conservés, pas réexécutés. |
| Public | Huit processus, quatre fichiers d'entrée et version f802 inchangés. Aucun redémarrage public ; essais privés fermés. |

Les matrices des 293 observations se recoupent et comprennent neuf contrôles de couleurs forcées ; aucun appareil physique. Le défaut initial du test clavier supposait un bouton de rafraîchissement désactivé focalisable ; le contrôle a été corrigé pour atteindre la prochaine commande active. Les rapports d'échec sont conservés.

## Reste à réaliser

| Priorité | Tâche | Critère de fin |
| --- | --- | --- |
| P1 | Disponibilité des index | Fiabiliser comptes/appels/retraits et curseurs ; terminer les 20 cas réels interrompus. Dernière campagne réelle du parent 732 :423 réussites, un échec,20 non exécutés sur444. Pas de fausse fraîcheur. |
| P1 | Paquets actuels | Régénérer et valider candidat/secours pour733. Les paquets préparés concernent732 et leurs essais réels sont incomplets. |
| P1 | Temps réel et mise en ligne | Renouveler WebSocket, santé, sources et rétention ; publication sur demande explicite seulement, puis contrôle domaine/secours. |
| P1 | Secours des adresses | Profil minimal attesté par le nœud lorsque l'index tombe ; aucun nom, compteur ou statut inventé. |
| P1 | Revue des composants | Recherche, menus, filtres/tableaux/courbes/dialogues, erreurs/chargement, textes longs, focus/zoom et autres métadonnées. Examiner les badges décoratifs de tokens serrés à 32 px. |
| P1 | Appareils réels | Android/iOS/Safari, clavier virtuel, lecteurs d'écran, orientation et zoom ; les moteurs simulés ne suffisent pas. |
| P2 | Langues et HTML | Revue éditoriale globale et premier HTML NFT ; URL, contenu et canoniques cohérents. Les contrôles des champs ne valident pas tous les textes du site. |
| P2 | Statistiques | Historique, provenance, définitions, unités, agrégats, graphiques et gas. |
| P2 | SEO et performance | Mesures visiteurs, Search Console, indexation, contenu et maillage. Aucun classement Google garanti. |
| P2 | Exploitation | Anciens scénarios/lanceurs, restauration/reboot réels et rotations. |

Aucune nouvelle campagne réelle globale ni essai de paquet pour733 dans cette passe. La source serveur/API est identique au parent. Les anciens résultats sont conservés sans être présentés comme une validation réelle actuelle. Derniers paquets 732 :candidat `dfac1197-e32f-4440-8b4a-f8293fce032b`,secours `66c38d48-8a2c-43cf-862e-116e85e9ab63`.
