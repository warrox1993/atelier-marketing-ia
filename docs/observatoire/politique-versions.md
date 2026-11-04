# Politique de versions

Règles de révision, de publication et de correction du contenu de l'Observatoire. Voir le plan (F.4, F.5), le modèle de données ([modele-donnees.md](modele-donnees.md)) et les séquences de [architecture.md](architecture.md).

## 1. Révisions

- Un dossier a une suite de révisions par langue, identifiée par (`dossier_id`, `langue`, `numero`), unique.
- Une révision est immuable une fois publiée : toute modification crée la révision suivante. Le contenu et son empreinte restent consultables.
- Une révision EN garde `base_revision_fr`, la révision FR dont elle est la traduction.
- Statuts éditoriaux (calculés depuis les états natifs de Paperclip et le statut de la révision) : Découvert, À qualifier, Accepté, En analyse, À vérifier, À corriger, Validé, Programmé, Publié, À actualiser, Archivé.
- Passage à « Validé » : PASS frais de la porte déterministe et du relecteur. Passage à « Publié » : approbation humaine (première publication, conclusion sensible, modification majeure). Après 3 cycles de correction, retour à l'humain, jamais d'acceptation forcée.
- **Conclusion sensible** (DROIT-5.4) : toute affirmation négative sur une entreprise ou une personne nommée (faille, faute, retard, promesse non tenue, contradiction de ses annonces). Elle exige une preuve primaire (`confirme_doc_officielle` ou `verifie_experimentalement`), une formulation factuelle (le fait daté et sa source, sans qualificatif) et l'approbation humaine à chaque révision qui l'ajoute ou la change. Droit de réponse et de retrait : `droits-collecte.md`, section 3.

## 2. Publication versionnée

- Seules les révisions « Publié » sont exportées vers le dépôt de contenu, jamais les brouillons.
- Chaque publication écrit une ligne dans `obs_publications` : cible, objet, empreinte de l'artefact, commit de contenu.
- Chaque affirmation garde une ancre stable (`#a-<id>`) : un lien reste valable d'une révision à l'autre, tant que l'affirmation existe ; si elle est remplacée, l'ancre pointe vers l'affirmation de remplacement (`remplacee_par`).
- Les éditions du magazine suivent (`numero`, `langue`, `version`) ; elles citent les révisions telles qu'elles étaient à leur date.

## 3. Changelog documentaire

- Généré automatiquement depuis les révisions, jamais écrit à la main.
- Pour chaque révision : date, version du projet concernée, chapitres touchés, affirmations ajoutées, remplacées ou passées `contredit` ou `obsolete`, source déclenchante.
- Le changelog est lui-même publié sur le site, par projet.

## 4. Mises à jour après une nouvelle version

1. Chaque nouvel instantané est comparé au précédent (release, changelog, README, LICENSE, manifeste de paquet).
2. Impact : affirmations dont une preuve pointe la source changée, ou dont `version_concernee` est inférieure à la nouvelle version majeure ou mineure.
3. Seuls les chapitres touchés passent `a_actualiser` ; la tâche donne la liste exacte (jamais « réécris le dossier »).
4. Les comparaisons qui citent une affirmation remplacée passent `a_actualiser`.
5. Une préversion (`prerelease`) est notée mais ne remplace pas la version stable dans les chapitres, sauf mention explicite.

## 5. Traductions périmées

- Une nouvelle révision FR rend « traduction périmée » toute révision EN dont `base_revision_fr` est plus ancienne.
- Le site affiche un bandeau sur la page EN périmée, avec lien vers la page FR à jour.
- La mise à jour porte sur le seul diff FR (voir [i18n.md](i18n.md)). Une page EN périmée n'est pas retirée : elle reste visible avec son bandeau.

## 6. Projets abandonnés

- Critères : aucun commit ni aucune version depuis N mois (seuil configurable par catégorie), dépôt archivé, annonce de fin de vie.
- Effet : statut « non maintenu », avec la date de la dernière activité et la source ; le dossier reste publié et n'est plus actualisé, la page l'indique en tête.
- Un projet repris est rouvert : le statut repasse à actif avec la preuve de la reprise.
- Le statut « non maintenu » est une affirmation comme les autres : sourcée, datée.

## 7. Liens morts

- Un échec de récupération incrémente `echecs_consecutifs` ; la cadence recule.
- Au-delà du seuil, la source est marquée lien mort. Si une capture Wayback existe, elle est citée avec sa date, jamais présentée comme la page actuelle. Sinon, la mention « source inaccessible le JJ/MM/AAAA » est conservée.
- Les affirmations qui reposaient uniquement sur cette source perdent en confiance et sont signalées à revoir ; elles ne sont pas supprimées.
- Les liens sortants sont revérifiés à chaque actualisation du chapitre.

## 8. Corrections d'une édition publiée

- Une erreur découverte après publication se corrige par une nouvelle révision ou une nouvelle version d'édition, jamais par modification silencieuse.
- La correction est traçable : date, révision corrigée, affirmation concernée, nature de l'erreur, source de la correction (champ `corrections` de l'édition, et changelog documentaire).
- Le texte erroné reste consultable dans l'historique ; la page courante affiche une note de correction visible.
- Une erreur de fond (affirmation fausse publiée) passe l'affirmation à `contredit` ou la remplace, et ses citations (comparaisons, éditions, réponses en cache) sont revues.
- La correction suit la même chaîne que le reste : porte, relecteur, approbation si la modification est majeure, puis traduction mise à jour.
