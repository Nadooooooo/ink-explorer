# État des travaux — 30 octobre 2026

**Correctifs locaux, non publiés.** Source actuelle `ink-explorer-address-document-budget-20261030`,731 fichiers figés. Le délai des premières fiches d'adresse est corrigé. Les100 contrôles réels des profils et les1123 vérifications de livraison passent. La campagne complète reste à20/21 groupes,avec11 échecs de catalogues Mainnet. Le public f802 est inchangé ;les essais privés sont fermés.

Dossier des fiches d'adresse (archive opérateur `ink-explorer-address-document-budget-20261030/docs/ADDRESS_DOCUMENT_BUDGET_2026-10-30.md`). Bilan précédent : [Passerelle](RECAP_2026-10-30_gateway.md).

## Réalisé

| Travail | Résultat et portée |
| --- | --- |
| Premières fiches d'adresse | Budget documentaire4→16 s couvrant index12 s,preuve canonique3 s et marge1 s. Les délais API/preuve ne changent pas ;les autres lecteurs restent inchangés. |
| Première visite contrôlée |104 observations par version sur deux réseaux/quatre langues. Les503 à froid passent de40 à16 :24 abandons prématurés supprimés. Les16 refus attendus d'index bloqué ou de données étrangères restent maintenus. |
| Solde ETH | Preuves canoniques exactes,fenêtre15 s conservée.24 fiches contrôlées restent sans solde actuel quand la preuve manque ou que le nœud est trop ancien ;elles affichent N/A et jamais un zéro inventé. Métadonnées90 s et seed10 s inchangés. |
| Tests ciblés |230 tests réussis,y compris les délais complets3 s/16 s,les corps bloqués,la fermeture des connexions,l'identité,les scopes réseau et les montants exacts. |
| Profils réels |100/100 contrôles réussis :HTML,navigateurs avec/sans JavaScript et détails NFT. Les59 cas non exécutés lors de la campagne parent sont maintenant couverts. Le premier HTML natif NFT reste un chantier distinct. |
| Campagne réelle complète |433/444 observations réussies,20/21 groupes. Onze échecs conservés :dix retraits et un compte Mainnet.1123/1123 vérifications de livraison réussies lors du contrôle final ;cela ne prouve pas une disponibilité durable. |
| Livraison et secours | Passerelle,deuxAPI et site coordonnés.18 tests de procédure et47 contrôles des vrais paquets/secours réexécutés avec cette source. Les32 observations par lanceurs installés du mécanisme inchangé sont conservées,pas réexécutées ici. Aucun lanceur public installé. |
| API et interface précédentes | POST,délais65→70→75 s et annulation conservés. Cartes mobiles,grandes polices,libellés et notice non obstructive conservés. Bundle identique ;208 parcours d'interface et272 observations API parent conservés sans prétendre les réexécuter ici. |
| Intégrité/public |731 fichiers et dix outils vérifiés ;runtime :721 fichiers comparés,716 identiques,cinq adaptateurs de test déclarés. Huit processus publics et fichiers d'entrée inchangés. |

Les changements de disponibilité entre campagnes empêchent d'attribuer toute amélioration réelle au correctif. La causalité des24 faux503 est établie séparément avec les mêmes sources contrôlées avant/après. Une première visite lente attend désormais davantage pour obtenir le HTML utile ;le fournisseur d'index n'est pas accéléré.

## Reste à réaliser

| Priorité | Tâche | Critère de fin |
| --- | --- | --- |
| P1 | Disponibilité des index | Diagnostiquer comptes/appels/retraits sur la durée,réduire les erreurs et vérifier les reprises sans présenter un ancien cache comme actuel. Les11 erreurs réelles restent ouvertes. |
| P1 | Validations des pools | Corriger les dix acceptations incorrectes de marqueurs réseau déjà reproduites ;couvrir catalogues,fiches,probes et transactions,avec régressions réelles. |
| P1 | Secours des adresses | Étudier un profil minimal attesté par le nœud quand l'index tombe ;l'API de solde indépendant existe déjà. Conserver une provenance explicite et ne pas inventer de noms,vérification ou compteurs. |
| P1 | Ergonomie et composants | Recherche,sous-menus mobiles,filtres,tableaux,courbes,dialogues,états vide/erreur/chargement,contenus longs,focus/zoom et cohérence visuelle. Revue composant par composant. |
| P1 | Appareils/accessibilité réels | Android/iOS,Safari mobile,clavier virtuel,lecteurs d'écran,orientation et zoom. Les moteurs simulés ne remplacent pas les appareils physiques. |
| P1 | Avant publication | Renouveler WebSocket/temps réel,sources,santé et rétention ;terminer la campagne réelle du site. Activation seulement après demande explicite,puis contrôle domaine/secours. |
| P2 | Langues et HTML | Revue éditoriale globale,textes longs,premier HTML NFT et filtres pertinents ;URL,contenu et canoniques cohérents. |
| P2 | Statistiques | Couverture historique,provenance,définitions,unités,agrégats,graphiques et suivi du gas ;aucune valeur inventée. |
| P2 | Performance/SEO | Mesures visiteurs et longues sessions,Search Console,indexation,contenu et maillage. Aucun classement Google garanti. |
| P2 | Exploitation | Anciens scénarios,lanceurs,restauration/reboot réels,rotations et futurs déploiements. |

Livraison locale actuelle :candidat `3070c84b-f6b3-4e63-a579-0daaaade0b78`,secours `b46e4e04-bd81-446f-ae5b-2d8dfb173bf0`,outils `ink-explorer-release-ops-addressbudget-20261030` (dix fichiers figés,schéma2). Trois dossiers publics distincts capturés et quatre processus coordonnés. Aucun lanceur installé ou service public redémarré.
