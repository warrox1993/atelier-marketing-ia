# Observatoire : règles déterministes de la porte

Document de spécification (phase 1, lot D). Il fixe les règles que la porte applique à une Revision d'un Dossier,
d'un Chapitre ou d'une Edition de l'observatoire, avant toute relecture humaine ou par modèle.

## 1. Principes

- **Déterminisme** : chaque règle est une fonction pure des faits enregistrés (Affirmations, Preuves, sources,
  instantanés, essais, versions connues, Revisions). Mêmes entrées, même décision, même empreinte : c'est le
  contrat déjà tenu par `evaluerPorte` (`plugin-atelier/src/serveur/porte.ts`, commentaire des lignes 1 à 8).
  Aucune sortie de modèle n'y entre comme autorité.
- **Verdict** : chaque règle rend FAIL quand sa condition est vraie, PASS sinon. La porte rend PASS seulement si
  aucune règle (existante ou nouvelle) ne rend FAIL.
- **Identifiant stable** : le code de motif ci-dessous est ajouté tel quel à l'énumération `CodeMotifPorte`
  (`plugin-atelier/src/contrats/porte.ts`, lignes 16 à 48) ; il n'est jamais renommé ni réutilisé pour un autre
  sens. Le numéro OBS-xx sert de renvoi dans la documentation.
- **Messages** : en français, avec l'emplacement (Chapitre, Affirmation) dans le champ `emplacement` et la source
  dans `sourceId` du `MotifPorte` existant. Au plus 20 motifs par règle, comme `MOTIFS_MAX_PAR_REGLE`
  (`plugin-atelier/src/serveur/regles-donnees.ts`, ligne 444).
- **Cycles** : tous les nouveaux motifs sont des refus de fond (ils consomment un cycle de correction), sauf
  OBS-08, ajouté à `MOTIFS_SANS_CYCLE` (`porte.ts`, ligne 125) : une base française devenue périmée n'est pas une
  faute du traducteur.
- **Comparaison de textes** : un extrait est comparé au texte normalisé de l'instantané produit par K2 (Unicode
  NFC, blancs réduits), jamais au HTML brut. La normalisation est la même des deux côtés et sa version est
  enregistrée.
- **Tests** : un fichier à créer, `plugin-atelier/tests/regles-observatoire.spec.ts`, avec pour chaque règle un
  cas qui rend FAIL et le cas voisin qui rend PASS. Les noms de tests sont donnés dans la colonne « Test ».

## 2. Ce que l'actuelle porte couvre déjà

Lecture de `plugin-atelier/src/serveur/porte.ts` (fonction `evaluerPorte`, ligne 152) et de
`plugin-atelier/src/contrats/porte.ts` le 26/10/2026.

**S'appliquent sans changement** à l'observatoire, car ils portent sur le circuit et non sur le contenu :
`livrable_absent`, `preuve_sur_autre_revision`, `revue_requise_absente`, `revue_sur_ancienne_version`,
`revue_non_reussie`, `revue_bloquee_information`, `revue_na_non_justifiee`, `constat_bloquant_ouvert`,
`information_manquante`, `cycles_epuises`. Ce sont eux qui font tenir la transition vers « Validé » de F.5 (PASS
frais de la porte et du relecteur sur la Revision courante).

**Aucune des dix règles demandées n'est couverte telle quelle** : la porte actuelle raisonne par exigence de
campagne et par élément attendu, pas par Affirmation. Quatre ont un analogue dont la forme se reprend :

| Règle demandée | Analogue existant | Différence |
| --- | --- | --- |
| OBS-01 affirmation sans preuve | `preuve_absente`, `element_attendu_sans_preuve` (`porte.ts`, lignes 201 et 210) | niveau exigence et élément du brief, pas Affirmation |
| OBS-06 chiffre de performance sans essai ni source primaire | `chiffre_offre_sans_source` (`regles-connaissances.ts`, lignes 262 et 328) | chiffres d'offre contre les connaissances du client, pas mesures de performance |
| OBS-10 citation d'une affirmation remplacée | `citation_connaissance_perimee` (`regles-connaissances.ts`, ligne 310) | version de connaissance périmée, pas Affirmation remplacée |
| OBS-16 renvoi vers une affirmation inconnue | `citation_connaissance_inconnue` (`regles-connaissances.ts`, ligne 295) | adresse de connaissance, pas identifiant d'Affirmation |

Toutes les règles OBS-xx sont donc **nouvelles** ; elles vivront dans un module pur à créer,
`plugin-atelier/src/serveur/regles-observatoire.ts`, appelé par `evaluerPorte` comme le sont déjà
`verifierDonneesDemo` et `controlerCitationsConnaissances` (`porte.ts`, lignes 12 et 14).

## 3. Règles

Les dix premières (OBS-01 à OBS-10) sont celles exigées par le lot ; OBS-11 à OBS-16 complètent les statuts de F.1 et les menaces de
J.1. « Revision évaluée » désigne la Revision courante soumise à la porte, avec tous ses Chapitres.

### OBS-01 `obs_affirmation_sans_preuve`

- **Condition** : une Affirmation citée par la Revision évaluée n'a aucune Preuve liée, quel que soit son statut,
  sauf `non_verifie` explicitement affiché comme tel dans le texte, et `infere` (traité par OBS-12).
- **Verdict** : FAIL.
- **Message** : « Affirmation <id> (<chapitre>) : aucune preuve liée. Ajoutez une preuve ou affichez-la comme non
  vérifiée. »
- **Test** : `OBS-01 refuse une affirmation rapportée par l'éditeur sans preuve` ; `OBS-01 accepte une affirmation
  non vérifiée affichée comme telle`.

### OBS-02 `obs_extrait_absent_instantane`

- **Condition** : l'extrait d'une Preuve, une fois normalisé, n'apparaît pas comme sous-chaîne exacte du texte
  normalisé de l'instantané qu'elle désigne, ou l'instantané désigné n'existe pas.
- **Verdict** : FAIL.
- **Message** : « Preuve <id> : l'extrait cité ne figure pas dans l'instantané <id> de la source <url>. »
- **Test** : `OBS-02 refuse un extrait paraphrasé` ; `OBS-02 accepte un extrait identique aux blancs près`.

### OBS-03 `obs_source_non_enregistree`

- **Condition** : une Preuve désigne une source absente des sources enregistrées de l'entreprise (table `sources`
  du plugin, provenance `instantane` ou autre provenance admise), ou une adresse citée dans le texte d'un Chapitre
  comme référence n'a pas de source enregistrée.
- **Verdict** : FAIL.
- **Message** : « <emplacement> : la source <url> n'est pas enregistrée. Lisez-la par la lecture protégée avant de
  la citer. »
- **Test** : `OBS-03 refuse une preuve vers une adresse jamais lue` ; `OBS-03 accepte une preuve vers une source
  enregistrée`.

### OBS-04 `obs_verifie_sans_essai`

- **Condition** : une Affirmation a le statut `verifie_experimentalement` et n'a aucun essai lié, ou son essai n'a
  pas été exécuté par le service d'essais (K8), ou n'est pas terminé avec succès, ou vise une autre version que
  l'Affirmation.
- **Verdict** : FAIL.
- **Message** : « Affirmation <id> : « vérifié expérimentalement » sans essai exécuté par notre service sur la
  version <v>. »
- **Test** : `OBS-04 refuse un statut vérifié sans essai` ; `OBS-04 refuse un essai sur une autre version` ;
  `OBS-04 accepte un essai réussi sur la même version`.
- **Remarque** : en P0, K8 n'existe pas ; la règle refuse donc tout statut `verifie_experimentalement`, ce qui est
  l'effet voulu.

### OBS-05 `obs_version_inconnue`

- **Condition** : une Affirmation, un Chapitre ou une Revision cite une version de l'outil qui n'est pas dans la
  liste des versions connues du Dossier (versions relevées par K1 et K5 depuis une source enregistrée).
- **Verdict** : FAIL.
- **Message** : « <emplacement> : la version <v> n'est pas une version connue de <outil>. »
- **Test** : `OBS-05 refuse une version inventée` ; `OBS-05 accepte une version relevée sur la page de
  publication`.

### OBS-06 `obs_performance_sans_essai_ni_source_primaire`

- **Condition** : une Affirmation de nature « performance » (champ structuré du schéma) n'a ni essai réussi lié
  (statut `verifie_experimentalement`), ni Preuve dans une source primaire de l'éditeur (statut
  `confirme_doc_officielle`, ou `rapporte_editeur` affiché comme annonce de l'éditeur). Également FAIL : dans le
  texte d'un Chapitre, un nombre suivi d'une unité de performance (ms, s, Mo/s, Go/s, requêtes par seconde, jetons
  par seconde, %, « fois plus rapide ») dans une phrase qui ne renvoie à aucune Affirmation.
- **Verdict** : FAIL.
- **Message** : « <emplacement> : chiffre de performance « <extrait> » sans essai ni source primaire. »
- **Test** : `OBS-06 refuse un gain chiffré tiré d'une vidéo` ; `OBS-06 refuse un chiffre nu dans le texte` ;
  `OBS-06 accepte un chiffre de la documentation officielle affiché comme annonce de l'éditeur`.
- **Remarque** : la règle de F.1 « un chiffre de performance n'est jamais vérifié expérimentalement sans essai de
  notre service » est tenue par OBS-04 ; OBS-06 interdit en plus le chiffre sans aucune base.

### OBS-07 `obs_chapitre_complet_sans_affirmation`

- **Condition** : un Chapitre a l'état « complet » et ne cite aucune Affirmation.
- **Verdict** : FAIL.
- **Message** : « Chapitre <titre> : déclaré complet sans aucune affirmation. Rattachez ses faits ou déclarez-le
  « information manquante ». »
- **Test** : `OBS-07 refuse un chapitre complet vide d'affirmations` ; `OBS-07 accepte un chapitre « information
  manquante » sans affirmation`.
- **Remarque** : un Chapitre « information manquante » rend PASS pour cette règle ; il est affiché comme tel.

### OBS-08 `obs_traduction_base_perimee`

- **Condition** : la Revision anglaise évaluée porte un identifiant de base française qui n'est pas la Revision
  française courante du même Dossier ou de la même Edition.
- **Verdict** : FAIL (motif sans cycle).
- **Message** : « Version anglaise : traduite depuis la révision française <id>, la révision courante est <id>. »
- **Test** : `OBS-08 refuse une traduction d'une ancienne base` ; `OBS-08 accepte une traduction de la base
  courante` ; `OBS-08 ne consomme pas de cycle`.

### OBS-09 `obs_code_modifie_traduction`

- **Condition** : la suite ordonnée des blocs de code (blocs délimités par trois accents graves) et des segments de
  code en ligne (entre accents graves simples) de la Revision anglaise diffère, octet pour octet, de celle de sa
  base française ; ou un terme du glossaire protégé présent dans la base française est absent ou modifié dans la
  version anglaise.
- **Verdict** : FAIL.
- **Message** : « Version anglaise, <emplacement> : le bloc de code n° <n> (ou l'identifiant « <terme> ») diffère de
  la version française. Les commandes et identifiants ne se traduisent pas. »
- **Test** : `OBS-09 refuse une commande traduite` ; `OBS-09 refuse un drapeau de commande modifié` ; `OBS-09
  accepte un commentaire traduit hors des blocs de code`.

### OBS-10 `obs_citation_affirmation_remplacee`

- **Condition** : la Revision évaluée cite une Affirmation qui a été remplacée (lien de remplacement non vide) ou
  dont le statut est `obsolete`.
- **Verdict** : FAIL.
- **Message** : « <emplacement> : l'affirmation <id> a été remplacée par <id>. Citez la nouvelle. »
- **Test** : `OBS-10 refuse une affirmation remplacée` ; `OBS-10 accepte l'affirmation qui la remplace`.

### OBS-11 `obs_contredit_sans_preuve_contraire`

- **Condition** : une Affirmation a le statut `contredit` sans Preuve contraire liée.
- **Verdict** : FAIL.
- **Message** : « Affirmation <id> : « contredit » sans preuve contraire liée. »
- **Test** : `OBS-11 refuse une contradiction non prouvée`.

### OBS-12 `obs_infere_sans_raisonnement`

- **Condition** : une Affirmation a le statut `infere` sans raisonnement stocké, ou ce raisonnement ne renvoie à
  aucune Affirmation prouvée dont il part.
- **Verdict** : FAIL.
- **Message** : « Affirmation <id> : inférence sans raisonnement ni affirmation de départ. »
- **Test** : `OBS-12 refuse une inférence sans raisonnement` ; `OBS-12 accepte une inférence qui part de deux
  affirmations prouvées`.

### OBS-13 `obs_confiance_sans_motif`

- **Condition** : la confiance d'une Affirmation est hors de 0 à 3, ou son motif est vide.
- **Verdict** : FAIL.
- **Message** : « Affirmation <id> : confiance sans motif (ou hors de 0 à 3). »
- **Test** : `OBS-13 refuse une confiance sans motif`.
- **Remarque** : le schéma Zod refuse déjà ces valeurs à l'écriture ; la règle protège contre une donnée ancienne
  ou importée.

### OBS-14 `obs_doc_officielle_non_primaire`

- **Condition** : une Affirmation a le statut `confirme_doc_officielle` et aucune de ses Preuves n'est dans une
  source marquée primaire pour cet éditeur (domaine ou dépôt officiel enregistré sur la Fiche).
- **Verdict** : FAIL.
- **Message** : « Affirmation <id> : « confirmé par la documentation officielle » mais la preuve vient de <domaine>,
  qui n'est pas une source de l'éditeur. »
- **Test** : `OBS-14 refuse un blog tiers présenté comme documentation officielle`.

### OBS-15 `obs_source_collecte_refusee`

- **Condition** : une Preuve s'appuie sur une source dont la décision de droits (K4) est « refusée » ou absente, ou
  un extrait publié dépasse la longueur maximale fixée par K4 pour cette source.
- **Verdict** : FAIL.
- **Message** : « Preuve <id> : la source <domaine> n'est pas autorisée à la collecte (ou extrait trop long). »
- **Test** : `OBS-15 refuse une source sans décision de droits` ; `OBS-15 refuse un extrait trop long`.

### OBS-16 `obs_affirmation_inconnue`

- **Condition** : le texte de la Revision renvoie à un identifiant d'Affirmation qui n'existe pas dans le Dossier.
- **Verdict** : FAIL.
- **Message** : « <emplacement> : renvoi à l'affirmation <id>, qui n'existe pas. »
- **Test** : `OBS-16 refuse un renvoi inventé`.

## 4. Table de référence et correspondance avec la demande

Numérotation définitive (elle fait foi pour les renvois de `agents.md` et `composants.md`) :

| N° | Code de motif | Exigence du lot | Statut |
| --- | --- | --- | --- |
| OBS-01 | `obs_affirmation_sans_preuve` | affirmation sans preuve | nouvelle (analogue `preuve_absente`) |
| OBS-02 | `obs_extrait_absent_instantane` | extrait absent du texte de l'instantané | nouvelle |
| OBS-03 | `obs_source_non_enregistree` | source absente des sources enregistrées | nouvelle |
| OBS-04 | `obs_verifie_sans_essai` | « vérifié expérimentalement » sans essai | nouvelle |
| OBS-05 | `obs_version_inconnue` | version absente des versions connues | nouvelle |
| OBS-06 | `obs_performance_sans_essai_ni_source_primaire` | chiffre de performance sans essai ni source primaire | nouvelle (analogue `chiffre_offre_sans_source`) |
| OBS-07 | `obs_chapitre_complet_sans_affirmation` | chapitre « complet » sans affirmation | nouvelle |
| OBS-08 | `obs_traduction_base_perimee` | traduction dont la base FR est périmée | nouvelle, sans cycle |
| OBS-09 | `obs_code_modifie_traduction` | commande ou identifiant traduit | nouvelle |
| OBS-10 | `obs_citation_affirmation_remplacee` | citation d'une affirmation remplacée | nouvelle (analogue `citation_connaissance_perimee`) |
| OBS-11 | `obs_contredit_sans_preuve_contraire` | statut `contredit` (F.1) | nouvelle, complément |
| OBS-12 | `obs_infere_sans_raisonnement` | statut `infere` (F.1) | nouvelle, complément |
| OBS-13 | `obs_confiance_sans_motif` | confiance 0 à 3 avec motif (F.1) | nouvelle, complément |
| OBS-14 | `obs_doc_officielle_non_primaire` | statut `confirme_doc_officielle` (F.1) | nouvelle, complément |
| OBS-15 | `obs_source_collecte_refusee` | collecte illicite (J.1) | nouvelle, complément |
| OBS-16 | `obs_affirmation_inconnue` | renvoi inventé | nouvelle, complément (analogue `citation_connaissance_inconnue`) |

Un numéro n'est jamais réattribué, même si une règle est retirée.

## 5. Hors de la porte

Ne sont pas des règles de porte, car elles exigent un jugement : pertinence d'un outil, justesse d'un raisonnement,
promesse excessive, choix entre deux sources qui se contredisent. Elles relèvent de `relecteur-independant`, dont le
verdict structuré est ensuite exigé par les motifs existants `revue_requise_absente` et
`revue_sur_ancienne_version`. Les injections signalées par K2 ne font pas non plus échouer la porte : un extrait qui
contient une consigne reste une citation valable ; c'est l'agent qui ne doit pas lui obéir.
