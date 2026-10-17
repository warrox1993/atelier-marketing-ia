---
name: "adaptation-fr-nl-en"
description: "Adapte un texte d'entreprise entre le français, le néerlandais et l'anglais pour un public belge ou international (communiqué, page du site, courriel client, annonce interne, offre d'emploi) en adaptant le registre, les conventions locales et la terminologie plutôt qu'en traduisant mot à mot, avec le contrôle de cohérence entre versions, la liste des choix faits et les passages à faire relire par un locuteur natif. À utiliser dès qu'une version NL ou EN est demandée ou qu'une traduction existante doit être vérifiée ; jamais pour publier, modifier un engagement ou choisir la langue d'un document soumis à la législation linguistique."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "communication"
---

# Adaptation en français, néerlandais et anglais

## Quand l'utiliser

- Un communiqué, une page ou un courriel doit exister en FR et en NL, parfois en EN.
- Une traduction existante doit être vérifiée avant publication.
- Une annonce au personnel doit être diffusée dans plusieurs langues.

## Objectif

Des versions qui disent exactement la même chose, avec les mêmes engagements, mais qui sonnent juste pour chaque public,
et une liste de choix qui permet à un relecteur natif de valider vite.

## Prérequis

- Le texte source validé et sa langue.
- Les langues cibles et le public : Flandre, Bruxelles, Pays-Bas, international. Sans précision pour le néerlandais,
  supposer la Belgique et le dire.
- Le canal et le registre (site, courriel formel, réseau social, document contractuel ou destiné au personnel).
- Le glossaire de l'entreprise, s'il existe.

## Entrées

- `source` : texte et langue.
- `cibles` : langues et public.
- `canal` : support et registre.
- `glossaire` : termes imposés.

## Étapes

1. **Comprendre le texte** : intention, public, appel à l'action, éléments qui engagent l'entreprise (prix, délais,
   garanties, citations).
2. **Adapter le registre** : en néerlandais, « u » par défaut pour un texte commercial belge, « je » seulement si la marque
   tutoie déjà ; en anglais, un ton direct, sans idiome.
3. **Localiser** : dates (JJ/MM/AAAA en FR et NL de Belgique ; en anglais, mois en toutes lettres), nombres et devises,
   noms officiels d'institutions dans la langue cible quand ils existent (SPF Finances / FOD Financiën), unités.
4. **Préserver les engagements** : chiffres, conditions, mentions légales et citations identiques dans toutes les
   versions. Une citation d'une personne n'est pas réécrite : sa traduction est soumise à la personne citée.
5. **Contrôler la cohérence entre versions** : tableau ligne à ligne des chiffres, dates, noms, mentions et appels à
   l'action ; tout écart est corrigé ou signalé. Une ambiguïté du texte source est signalée, jamais résolue en silence.
6. **Relire comme un natif** : longueur (le néerlandais s'allonge, l'anglais raccourcit), fluidité, faux amis,
   gallicismes en néerlandais.
7. **Signaler la législation linguistique** : un document destiné au personnel, un contrat de travail ou un règlement
   peut devoir être rédigé dans une langue imposée selon la région du siège d'exploitation ; la compétence le signale
   pour vérification et ne choisit pas la langue à la place de l'entreprise.
8. **Documenter** les choix qui pourraient surprendre un relecteur et lister les passages à faire relire.

## Livrable

Une section par langue cible avec le texte adapté ; le tableau de cohérence entre versions ; le tableau des choix
d'adaptation (passage source, choix retenu, raison) ; la liste des passages à faire relire par un locuteur natif ou un
traducteur professionnel ; le signalement éventuel de la législation linguistique.

## Critères de réussite

- Chiffres, dates, mentions et engagements identiques dans toutes les versions (tableau de cohérence sans écart non
  expliqué).
- Aucune version n'est une traduction littérale ; chaque version porte la mention « à faire relire par un locuteur
  natif » avant publication.
- Aucune citation modifiée sans validation de la personne citée.
- Aucun engagement, chiffre ou mention ajouté ou retiré.

## Sources officielles

État au 17/10/2026 :

- Aucune source officielle n'a été relue pour la législation linguistique (lois coordonnées sur l'emploi des langues en
  matière administrative, décrets régionaux et communautaires sur l'emploi des langues dans les relations sociales) :
  la compétence ne cite aucun article et renvoie la question au juriste (voir ci-dessous).

## À vérifier par un professionnel

- Si l'entreprise est soumise à la législation sur l'emploi des langues (documents sociaux, relations de travail,
  communications au personnel selon la région du siège d'exploitation), la langue obligatoire et les sanctions sont à
  vérifier par un juriste avant diffusion.
- Un document contractuel, réglementaire, une notice de sécurité ou une communication de crise est relu par un
  traducteur professionnel.

## Limites

- L'adaptation est un texte de travail de bonne qualité, pas une traduction certifiée.
- La compétence ne complète pas un texte source incomplet : elle signale ce qui manque.
- Elle ne publie rien.

## Exemple

Cas nominal : communiqué « ouverture d'une agence à Liège », version NL pour la presse flamande. Registre « u », titre
réécrit pour un lecteur flamand, nom des institutions en néerlandais, tableau de cohérence (date d'ouverture, adresse,
horaires) sans écart ; la citation du gérant est traduite et marquée « à valider par la personne citée » ; mention « à
faire relire par un locuteur natif ».

Cas d'échec évité : la version NL d'une annonce au personnel d'un siège situé en région de langue néerlandaise est
demandée « en plus » de la version française. L'agent ne décide pas quelle version fait foi : il signale la question de
la législation linguistique au coordinateur pour avis juridique.

## Origine de la méthode

Port de la compétence `entreprise-marketing:adaptation-fr-nl-en` du dépôt github.com/warrox1993/skills-claude-entreprise,
`plugins/entreprise-marketing/skills/adaptation-fr-nl-en/SKILL.md`, commit 474785fbcba8429cb034ef35fca20bbfcfd68554,
licence MIT (même auteur que l'atelier). Ajouts : contrôle de cohérence entre versions, traitement des citations,
signalement de la législation linguistique. Texte de la licence et liste des reprises :
`organisation/skills/LICENCES-TIERS.md`.
