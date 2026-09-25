# Ink Explorer — règles visuelles partagées

La source des valeurs visuelles est le bloc `:root` de `src/styles.css`. Les composants conservent leur disposition et leur fonction ; les variantes ci-dessous définissent leur apparence commune.

| Famille | Règles |
| --- | --- |
| Texte d’interface, noms de pools, contrats et NFTs | `--font-ui` : Plus Jakarta Sans, avec repli Arial/sans-serif |
| Identifiants, adresses, hashes, numéros de blocs et code | `--font-mono` : DM Mono, avec repli monospace |
| Cartes de métriques, contrats, NFTs et statistiques | `--surface-card`, `--line`, `--radius-card`, `--shadow-card` |
| Panneaux de données, fiches, tableaux et zones de code | `--surface-panel`, `--line`, `--radius-panel`, `--shadow-panel` |
| Bandeaux de pages et de détails | `--radius-hero` et le dégradé violet existant |
| En-têtes de tableaux et sections de code repliables | `--surface-header` |
| Champs de recherche | `--surface-field`, `--field-border`, `--shadow-field`, `--radius-control` |
| Action principale | `--action-fill`, texte blanc, `--radius-control`, `--shadow-action` |
| Action secondaire | fond `--paper`, bordure `--line`, survol `--surface-hover` |
| Lien contextuel dans une fiche | texte violet, fond transparent ; survol clair |
| Onglets et sélecteurs de période | conteneur `--surface-muted`, coins `--radius-control`, éléments internes `--radius-inset` |
| Source, données d’entrée et JSON | `--surface-code`, `--text-on-dark`, `--font-mono` |
| Badges de statut | `--radius-pill`, couleur sémantique succès/erreur ; variante claire sur fond sombre |
| Copie en ligne | bouton de 24 px, sans bordure native, `--radius-inset`, confirmation verte |
| Erreur | `--surface-error`, `--border-error`, message et action de reprise |
| Graphique sans données | surface secondaire, bordure discrète, hauteur minimale conservée et message d’état |

## Tailles et interactions

- Bandeaux : rayon de 24 px sur ordinateur, 20 px en format compact.
- Panneaux : rayon de 20 px sur ordinateur, 18 px en format compact.
- Cartes : rayon de 18 px sur ordinateur, 16 px en format compact.
- Commandes : rayon de 10 px ; hauteur minimale commune de 36 px, puis 44 px jusqu’à 760 px. Les liens de texte et les boutons de copie intégrés aux données gardent leur format compact.
- Éléments internes : rayon de 8 px ; statuts : forme de pilule.
- Le focus clavier utilise `--focus-color` avec un contour de 3 px. Les champs composés possèdent aussi un indicateur `focus-within`.
- Les commandes désactivées gardent leur fond au survol, avec une opacité de 0,45 et un curseur explicite.
- Les actions de copie affichent une coche et le nom accessible « Copié » après l’opération.

Les cartes sombres de statut, les zones de code, les illustrations de réseau et les surfaces d’accent sont des variantes fonctionnelles. Elles ne doivent pas être transformées en cartes claires uniquement pour égaliser les couleurs.

Les bandeaux d’accueil, de listes et de détails utilisent le symbole officiel Ink de `public/brand/ink-symbol.svg` comme décor. Sa géométrie reste intacte ; l’agrandissement, une légère rotation de 8° et le recadrage l’intègrent au fond. Le motif s’estompe derrière le texte et ne reçoit aucune interaction.

L’en-tête utilise le logo horizontal officiel de `public/brand/ink-wordmark.svg` avec « Explorer » en sous-titre. Le pied de page affiche ce même logo en blanc sur fond sombre.

## Prévenir les régressions

```bash
npm run test:style
```

Le test compare les styles calculés dans Chrome aux variables partagées sur les routes réelles, y compris les détails, le code source et les NFTs. Il couvre aussi survol, focus clavier, sélection, désactivation, copie et états réseau simulés. Il refuse les contrôles ayant récupéré une bordure native `inset`/`outset`.

Pour une vérification ciblée : `STYLE_WIDTHS=390,1440 npm run test:style`.

Ajouter toute nouvelle famille visuelle à cette documentation et aux contrôles de `scripts/style-consistency-test.mjs`. Réutiliser une variable de famille existante avant de créer une couleur, un rayon ou une ombre propre à une page.
