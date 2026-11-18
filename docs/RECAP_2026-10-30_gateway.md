# État des travaux — 30 octobre 2026

**Correctifs locaux, non publiés.** Source actuelle `ink-explorer-public-api-budget-20261030`, 729 fichiers figés. Tests contrôlés réussis ; campagne réelle avec échecs et couverture des profils incomplète. La procédure locale intègre désormais la passerelle ; les contrôles réels du site restent à terminer. Public f802 inchangé, huit processus et fichiers d'entrée vérifiés ; essais privés fermés.

Dossier : Relais publics (archive opérateur `ink-explorer-public-api-budget-20261030/docs/PUBLIC_API_BUDGET_2026-10-30.md`). Preuves : `ink-explorer-public-api-budget-20261030/reports/public-api-budget/summary.json`. Bilan parent conservé : [Documents indexés](RECAP_2026-10-30_indexbudget.md).

## Réalisé

| Travail | Résultat et limite |
| --- | --- |
| API POST | Défaut Node reproduit avant l'arrivée au serveur puis corrigé. Corps, Origin, réseau et absence de transfert des cookies/identifiants vérifiés. |
| Filtres avancés | Chaîne locale cohérente API65 s → deux relais70 s → client75 s ; les autres délais ne sont pas augmentés. Réponses valides à60 s acceptées au lieu d'être coupées à55 s ; corps bloqués refusés vers65 s. |
| Annulation | Déconnexion propagée du site au moteur puis à la passerelle ; transport vers l'API fermé. Le calcul d'index partagé reste borné et peut servir d'autres lecteurs. |
| Tests contrôlés | 204 tests ciblés et272 observations API réussis, douze trajets complets du candidat et douze reproductions parent. Pas d'horloge accélérée pour les longs délais. |
| Premiers documents indexés, acquis parent | API12/document13 pour neuf lecteurs, dates et fraîcheur conservées. Anciennes preuves178 tests/164 sondes/seize documents conservées ; pas de double comptage avec les204 tests actuels. |
| Interface, acquis parent | Cartes mobiles compactes, noms/compilateurs longs, grandes polices, libellés espacés et notice de reprise non obstructive. Bundle inchangé ;208 parcours contrôlés conservés sans prétendre les réexécuter ici. |
| Campagne réelle actuelle | 18 groupes réussis sur21 ;359 observations réussies sur385 enregistrées,26 échecs. Profils arrêtés après41/100 cas :59 non exécutés. Contrôle de livraison :1103/1123 réussis. Échecs conservés. |
| Livraison coordonnée | Passerelle intégrée aux deux API et au site : trois lanceurs stables,quatre processus.18 tests de procédure,47 contrôles des vrais paquets et10 contrôles/32 observations par les lanceurs installés en scratch réussis. Pas de publication ; les échecs réels du site ne sont pas effacés. |
| Audit des prochaines corrections | Dix acceptations incorrectes de marqueurs réseau de pools reproduites en lecture, non corrigées. Budget mixte des fiches d'adresse précisé. |
| SEO/public | Accueil indexable, canonique correct, robots/sitemap200. Public inchangé ; pas de garantie de classement Google. |

## À réaliser, dans cet ordre

| Priorité | Tâche | Critère de fin |
| --- | --- | --- |
| P1 | Disponibilité réelle | Diagnostiquer et suivre comptes, appels internes et retraits Mainnet. Résoudre les erreurs/retards sans présenter le cache ancien comme actuel ; vérifier reprise et tenue dans la durée. |
| P1 | Fiches d'adresse | Analyser document4 s, index12 s, preuve canonique partagée3 s et garde5 s. Budget total cohérent sans relâcher la fraîcheur ; terminer les59 cas de profils non exécutés puis reprendre la campagne complète. |
| P1 | Vérifications avant publication | La passerelle est préparée et ses scénarios de reprise privés réussis. Renouveler WebSocket/temps réel, disponibilité des sources, santé/rétention et campagne du site avant toute activation explicitement demandée. |
| P1 | Réseau des pools et autres métadonnées | Refuser types invalides et contradictions imbriquées sur catalogues/fiches/probes/transactions ; tests avant/après puis régressions sur données réelles. |
| P1 | Interface et ergonomie | Recherche, sous-menus mobiles, filtres, tableaux, courbes, dialogues, états vides/erreur/chargement, noms longs et cohérence visuelle. Revue composant par composant, avec corrections observables. |
| P1 | Appareils/accessibilité | Android/iOS, Safari mobile, clavier virtuel, lecteurs d'écran, orientation et zoom ; les moteurs simulés ne remplacent pas ces vérifications physiques. |
| P2 | Langues et HTML utiles | Revue éditoriale sur l'ensemble des pages, textes longs, détails NFT et filtres pertinents ; contenu/URL/canoniques cohérents dès le premier HTML. |
| P2 | Statistiques | Couverture historique, provenance, définitions/unités, agrégats, graphiques et suivi du gas ; aucune valeur inventée. |
| P2 | Performance/SEO | Mesures visiteurs et longues sessions, Search Console, indexation, contenu et maillage. Le classement Google ne peut pas être garanti. |
| P2 | Exploitation | Anciens lanceurs/scénarios, restauration et reboot réels, rotations et futurs déploiements. |
| Publication | Après demande explicite uniquement | Passerelle incluse, santé/source/rétention recontrôlées puis validation domaine et secours. L'ancienne question d'autorisation n'est pas répétée. |

Livraison locale actuelle : candidat `569b9881-2ab0-41fb-8260-75a34001d7d0`, secours `2f78a846-c3c9-4315-8d87-77dcfc1bd689`, outils `ink-explorer-release-ops-gateway-20261030` (dix fichiers figés,schéma2). Capture API `ink-explorer-redesign-20261017`,passerelle `ink-explorer-cloudflare-20261016`,site `ink-explorer-server-20261027`. Détails et preuves (archive opérateur `ink-explorer-release-ops-gateway-20261030/docs/GATEWAY_RELEASE_2026-10-30.md`). L'ancienne préparation à trois services reste archivée. Dernier candidat dont la campagne entière du site avait réussi : `index-document-budget-20261030`,727 fichiers ; disponibilité actuelle non garantie pour autant.
