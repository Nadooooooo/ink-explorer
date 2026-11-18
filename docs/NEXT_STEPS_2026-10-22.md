# Ink Explorer — état et prochaines vérifications

Dernière version déployée pendant cette revue : `0576d174-ef9f-4d21-8bad-0549caae037f` (22 octobre 2026, 16:38 UTC). Les éléments ci-dessous restent révisables à partir des incidents et des retours réels.

## Validé sur la version publique

- Parcours mobile : 86 vérifications d’interaction sur Chromium et WebKit à 390 px ; 42 vérifications de géométrie supplémentaires à 320, 430 et 844 px. Le focus d’un champ de contrat reste visible sur une fenêtre de 320 px de haut.
- Accessibilité automatisée : 15 pages × 3 tailles, aucune violation Axe grave ou critique. Navigation clavier et historique testés sur Mainnet et Sepolia avec Chromium, Firefox et WebKit (6 combinaisons).
- Déploiement : 25/25 contrôles de ressources, documents, `robots.txt`, sitemaps et réseaux ; protection anti-spam publiée conservée (21 contrôles). Les tests SEO du navigateur passent (13 états).
- Le domaine principal répond en HTTPS ; `www` redirige vers le domaine canonique et HTTP redirige vers HTTPS.
- Lighthouse public sur accueil, statistiques, API, tokens, pools et transactions : performance mobile 95–97, ordinateur 100 sur les trois pages auditées ; accessibilité, bonnes pratiques et SEO 100 pour les neuf audits. La valeur est une mesure de laboratoire, pas un score garanti pour chaque visite.
- Sept pages principales vérifiées à 390 et 1440 px : aucune erreur JavaScript, requête échouée ou réponse HTTP ≥400 pendant ces visites. Accueil, tokens, pools, fiche token et API n’ont demandé aucune ressource tierce pendant les visites inspectées. Audit npm des dépendances de production : zéro vulnérabilité signalée.
- Comparaison visuelle directe avec l’explorateur officiel sur ordinateur et mobile : notre recherche, nos statistiques et nos flux tiennent plus haut dans la page ; le menu mobile est opaque et hiérarchisé. Cette comparaison n’est pas un test utilisateur.
- La charge réseau est recalculée à partir des 30 derniers blocs canoniques du nœud local ; six échantillons Mainnet/Sepolia confirment les sommes exactes et l’avancée des deux chaînes. La valeur de l’explorateur officiel correspond, elle, aux 50 derniers blocs indexés (recalcul indépendant dans `reports/mobile-focus/utilization-compare.json`) : les pourcentages ne portent donc ni sur la même fenêtre ni toujours sur la même tête de chaîne.
- Les WebSockets publics Mainnet et Sepolia ont chacun transmis une séquence valide et un nouveau bloc pendant le contrôle final.

## À suivre en priorité

1. **Fraîcheur des agrégats.** Les compteurs de l’indexeur, dont le total des blocs, se recalculent par lot : à 17:01 UTC, le retard dépassait une heure sur Mainnet et Sepolia et le moniteur l’a signalé. La même valeur ancienne est renvoyée par les API amont officielles ; ce n’est pas une mise en cache locale. Le site précise cette limite dans l’infobulle et la documentation API. Suivre le prochain recalcul et établir sa cadence réelle sur plusieurs jours. Puis exposer une hauteur « calculé jusqu’au bloc » et, au-delà d’un seuil justifié, afficher clairement « indisponible » plutôt qu’une valeur présentée comme actuelle. Ne pas confondre l’heure de récupération HTTP avec l’heure de calcul du compteur.
2. **Vérification indépendante des données.** Étendre l’audit des 18 compteurs et 30 graphiques (actuellement contrôlés sur sept jours) à plusieurs périodes, aux deux réseaux et aux cas de réorganisation ; rapprocher les frais des reçus bruts et les statistiques de l’indexeur avec la chaîne. Contrôler séparément prix, liquidité et capitalisations des tokens/pools, qui dépendent de marchés parfois très peu liquides.
3. **Appareils et aides réels.** Tester sur un iPhone et un Android physiques, avec clavier logiciel, zoom, mode paysage, VoiceOver et TalkBack. Les émulateurs Chromium/WebKit et Axe ne prouvent pas ces comportements.
4. **SEO en conditions réelles.** Suivre l’indexation de Search Console, les erreurs d’exploration, les Core Web Vitals terrain, les pages canoniques multilingues et les sitemaps après plusieurs jours. Les scores Lighthouse ne démontrent pas l’indexation effective.
5. **Exploitation.** Suivre les erreurs de Worker et d’origine, les limites Cloudflare, les coupures WebSocket, les 429/503 de l’indexeur et la disponibilité Mainnet/Sepolia. Conserver le test après déploiement et le rapport de qualité des données à chaque publication.

## Améliorations produit à cadrer ensuite

- Obtenir des retours de personnes qui recherchent un hash, suivent un bridge, comparent des tokens et lisent un contrat ; mesurer les tâches réellement difficiles avant un nouveau changement de mise en page.
- Envisager une soumission native de vérification de contrat, un suivi des autorisations et une liste de surveillance seulement si l’usage le justifie ; ces services demandent une conception de données et de confidentialité distincte.
- Revalider les libellés des méthodes non décodées, la provenance des prix, les rares adresses sans nom et les états vides sur des transactions réelles.

Les captures, rapports navigateur et résultats Lighthouse sont sous `reports/mobile-focus/`. Les constats ponctuels ne certifient pas une perfection absolue ni toutes les données historiques.
