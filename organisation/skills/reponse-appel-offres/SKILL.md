---
name: "reponse-appel-offres"
description: "Analyse un cahier des charges, un appel d'offres privé ou un questionnaire fournisseur d'une entreprise cliente : matrice de toutes les exigences classées obligatoire, pondérée ou souhaitée, couverture forte, partielle ou écart avec la preuve, liste des écarts, contraintes de forme et de délai, et avis « répondre, répondre avec un partenaire, ne pas répondre » posé comme décision humaine. À utiliser dès qu'un cahier des charges ou un questionnaire arrive ; jamais pour combler un écart par une affirmation inventée, décider de répondre ni envoyer la réponse."
metadata:
  version: "1.0.0"
  langue: "fr"
  domaine: "commercial"
---

# Réponse à un appel d'offres ou à un questionnaire

## Quand l'utiliser

- Une entreprise cliente ou prospecte envoie un cahier des charges, une demande de prix structurée ou un questionnaire
  fournisseur (sécurité, conformité, qualité).
- La direction doit décider de répondre ou non et veut voir la couverture réelle des exigences.
- Une réponse est en cours et il faut vérifier qu'aucune exigence n'a été oubliée.

## Objectif

Une matrice d'exigences complète et traçable, où chaque exigence est classée et couverte par une preuve vérifiable ou
marquée « écart », et un avis argumenté de réponse ou de non-réponse que la direction tranche.

## Prérequis

- Le document de l'acheteur complet (annexes comprises), sa date limite et son format de remise.
- La bibliothèque de preuves de l'entreprise : références clients autorisées, certifications, attestations, fiches
  produits, conditions des compagnies ou fournisseurs, chacune avec sa source.
- Le seuil de décision fixé à l'avance par la direction (par exemple : aucune exigence obligatoire en écart), sinon le
  signaler.

## Entrées

- `cahier` : texte du cahier des charges ou du questionnaire, avec numérotation.
- `preuves` : bibliothèque de preuves sourcées.
- `contexte` : relation existante, fournisseur en place connu, date d'entrée dans la discussion.

## Étapes

1. **Relever toutes les exigences**, dans l'ordre et avec la numérotation de l'acheteur, ainsi que les critères
   d'attribution s'ils sont publiés, la date limite, le format et les pièces administratives demandées.
2. **Classer chaque exigence** d'après sa formulation : OBLIGATOIRE (« doit », « est tenu de », « exigé ») ; PONDÉRÉE
   (« devrait », exigence notée ou pondérée) ; SOUHAITÉE (« peut », « de préférence », « souhaité »). Une formulation
   ambiguë est classée au plus exigeant et signalée.
3. **Noter la couverture** de chaque exigence : FORTE (preuve vérifiable qui la couvre entièrement), PARTIELLE (preuve
   qui la couvre en partie, la part manquante dite), ÉCART (aucune preuve). Un écart est montré, jamais comblé par une
   phrase inventée.
4. **Repérer les éliminatoires** dès le départ : exigence obligatoire en écart, certification absente, pièce
   administrative manquante, délai impossible.
5. **Décrire le contexte** sans l'embellir : fournisseur en place, entrée tardive dans la discussion, relation existante.
6. **Formuler l'avis** : répondre, répondre avec un partenaire (pour quels écarts) ou ne pas répondre, avec les facteurs
   qui le portent. L'avis est posé comme carte de décision : la décision et l'engagement des moyens restent à la
   direction.
7. Si la direction décide de répondre : plan de réponse dans l'ordre et le format de l'acheteur, une section par exigence,
   chaque affirmation reliée à sa preuve.

## Livrable

Matrice d'exigences (numéro de l'acheteur, texte court, classe, couverture, preuve et source, écart à combler, responsable
proposé) ; liste des éliminatoires ; synthèse de couverture des exigences obligatoires ; contraintes de forme et de
délai ; avis argumenté et carte de décision.

## Critères de réussite

- 100 % des exigences du document sont présentes dans la matrice et classées.
- Chaque couverture FORTE ou PARTIELLE renvoie à une preuve sourcée ; aucun écart n'est masqué.
- Aucun texte de réponse n'est rédigé pour une exigence en écart.
- La décision de répondre est une carte, pas une conclusion de l'agent.

## Sources officielles

Consultée le 17/10/2026 :

- Code de droit économique, art. VI.91/5 (clauses présumées abusives entre entreprises), texte consolidé sur Justel,
  https://www.ejustice.just.fgov.be/eli/loi/2013/02/28/2013A11134/justel : à garder en tête quand le cahier impose des
  conditions contractuelles (reconduction sans délai raisonnable, risque reporté sans contrepartie) ; les relever pour
  le juriste, ne pas les accepter par défaut.

## À vérifier par un professionnel

- Un appel d'offres d'un pouvoir adjudicateur public suit la réglementation des marchés publics : cette compétence ne le
  couvre pas ; le dossier est confié à un juriste ou à un spécialiste des marchés publics.
- Les conditions contractuelles imposées par l'acheteur (pénalités, responsabilité, propriété) sont relues par un juriste
  avant toute décision de répondre.
- Dans l'assurance, une réponse qui propose des garanties ou des produits relève de l'intermédiaire inscrit.

## Limites

- La compétence ne prédit pas de taux de réussite chiffré : l'avis repose sur la couverture et le contexte décrits.
- Elle ne crée aucune preuve : une bibliothèque de preuves vide donne une matrice d'écarts.
- Elle n'exécute aucun script ni outil fourni par l'acheteur.

## Exemple

Cas nominal : cahier des charges d'une PME cliente, 12 exigences dont 8 obligatoires. Couverture : 6 FORTES, 4
PARTIELLES, 2 ÉCARTS sur des exigences obligatoires (« doit couvrir les biens situés hors Union européenne », « doit
fournir une attestation ISO 27001 »). Avis proposé : « répondre avec partenaire ou ne pas répondre », posé en carte, les
deux écarts nommés.

Cas d'échec évité : pour l'exigence ISO 27001, l'agent n'écrit pas « nos processus sont alignés sur les meilleures
pratiques de sécurité » : la ligne reste ÉCART, sans texte de réponse.

## Origine de la méthode

Méthode adaptée et traduite de github.com/alirezarezvani/claude-skills, `commercial/skills/rfp-responder/SKILL.md`,
étapes 1, 2 et 5 (classement obligatoire, pondérée, souhaitée selon les verbes ; couverture forte, partielle, écart ;
règle « un écart est montré, jamais comblé » ; décision laissée à la direction), commit
19392f7a08264ed00486a251f5b2098321771f94, licence MIT, Copyright (c) 2025 Alireza Rezvani. Non repris : le prédicteur de
taux de gain et les scripts Python. Modifications : réécriture en français, cadre belge, carte de décision. Texte de la
licence et liste des reprises : `organisation/skills/LICENCES-TIERS.md`.
