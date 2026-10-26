# ADR-005 : site Astro 7, Starlight 0.42 et Pagefind

- **Statut** : Accepté (JB, 26/10/2026), avec dérogation limitée à Starlight
- **Décision de référence** : D5 et O6 du plan

## Contexte

Le site public s'appelle « L'Avenue de l'Observatoire », réalisé par Smidjan (la marque de l'opérateur). Il est d'abord un lecteur de longs dossiers bilingues (FR/EN) : lecture, SEO, accessibilité, URLs localisées,
recherche. Il doit se publier sans serveur applicatif et gratuitement. Versions stables vérifiées sur npm le
26/10/2026 : astro 7.4.2, pagefind 1.5.2, @astrojs/starlight 0.42.7.

## Décision

- **Astro 7.4.2 en mode statique** : HTML sans JavaScript par défaut, collections de contenu typées par schémas Zod
  (même outil que le plugin), routage i18n intégré.
- **Starlight 0.42.7** pour la structure documentaire (barre latérale des chapitres, table des matières, blocs de
  code copiables).
- **Pagefind 1.5.2** pour la recherche lexicale côté navigateur, sans serveur ni LLM.
- **Dérogation de l'opérateur à sa règle « jamais de bêta », limitée à Starlight** : il est publié sous 0.x (API pouvant
  changer) sans être étiqueté bêta. Elle ne s'étend à aucun autre outil.
- Prérequis design (règle 7 de l'opérateur) : `PRODUCT.md` du site créé par `/impeccable init` avec questions posées à l'opérateur,
  puis critique, typographie, mise en page et finition. Design sobre, « fait main ».

## Options écartées et pourquoi

- **Next.js 16.4.3** : pile que l'opérateur connaît, bon second choix, mais JavaScript d'hydratation et serveur si l'export
  statique ne suffit plus ; Astro est plus adapté à un lecteur de contenu.
- **Blazor (.NET 10)** : rendu statique plus lourd, i18n et contenu Markdown à assembler, hébergement par serveur.
- **Astro sans Starlight** : sans dérogation, il fallait écrire soi-même barre latérale, table des matières et blocs
  de code (quelques composants).

## Conséquences

- Positives : hébergement statique gratuit ; très bonne accessibilité et bon SEO ; contenu portable.
- Négatives : outil nouveau pour l'opérateur ; Starlight 0.x peut casser l'API à une mise à jour, donc version figée et
  test de construction du site à chaque montée de version ; surface de dépendances npm à surveiller.

## Références

- Plan : Livrable A (D5), G.1 (choix technique), G.2 à G.4, Livrable K (versions), Livrable O (O6).
- Règles de l'opérateur : règle 5 (jamais de bêta, sauf dérogation) et règle 7 (design par Impeccable).
