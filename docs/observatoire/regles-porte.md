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
- **Code dans la prose** (SPEC-E10) : les blocs de code (trois accents graves ou trois tildes, refermés par le même
  caractère au moins aussi long, comme l'exporteur : O8) échappent aux règles de prose ; le
  code en ligne aussi, sauf s'il contient une URL ou un chiffre avec unité de performance, qui restent lus par
  OBS-03, OBS-05 et OBS-06. Un nom versionné entre accents graves reste exempté.
- **Comparaison de textes** : un extrait est comparé au texte normalisé de l'instantané produit par K2 (Unicode
  NFC, blancs réduits), jamais au HTML brut. La normalisation est la même des deux côtés et sa version est
  enregistrée.
- **Tests** : `plugin-atelier/tests/observatoire-regles-porte.spec.ts`, avec pour chaque règle un cas qui rend FAIL
  et le cas voisin qui rend PASS. Les noms de tests sont donnés dans la ligne « Test » de chaque règle.

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

Toutes les règles OBS-xx sont donc **nouvelles** ; elles vivent dans le module pur
`plugin-atelier/src/serveur/observatoire/regles-porte-obs.ts` (fonction `reglesObservatoire`), appelé par
`evaluerPorte` quand la tâche porte des entrées de l'Observatoire (`porte.ts`, `if (e.observatoire)`), comme le
sont déjà `verifierDonneesDemo` et `controlerCitationsConnaissances`.

## 3. Règles

Les dix premières (OBS-01 à OBS-10) sont celles exigées par le lot ; OBS-11 à OBS-16 complètent les statuts de F.1 et les menaces de
J.1. « Revision évaluée » désigne la Revision courante soumise à la porte, avec tous ses Chapitres.

### OBS-01 `obs_affirmation_sans_preuve`

- **Condition** : une Affirmation citée par la Revision évaluée n'a aucune Preuve liée, quel que soit son statut,
  `non_verifie` compris (décision du 30/10/2026, V2-3 : plus aucun fait publié sans preuve), sauf `infere` (traité
  par OBS-12).
- **Verdict** : FAIL.
- **Message** : « Affirmation <id> (<chapitre>) : aucune preuve liée. Ajoutez une preuve (une affirmation non
  vérifiée en exige une aussi). »
- **Test** : `OBS-01 refuse une affirmation rapportée par l'éditeur sans preuve` ; `OBS-01 refuse une affirmation
  non vérifiée sans preuve, même affichée comme telle` ; `OBS-01 accepte une affirmation non vérifiée qui porte une
  preuve`.

### OBS-02 `obs_extrait_absent_instantane`

- **Condition** : pour une Preuve qui désigne un instantané, l'un des cas suivants (contrôle réel :
  `causeExtraitRefuse`, `plugin-atelier/src/serveur/observatoire/normaliseur.ts`) :
  - l'instantané désigné n'existe pas ;
  - l'extrait normalisé fait moins de 20 caractères (`EXTRAIT_MIN_CARACTERES`, valeur provisoire à fixer avec K4) ;
  - l'extrait normalisé ne figure pas comme sous-chaîne exacte du texte normalisé de l'instantané ;
  - il y figure, mais pas à la `position` déclarée (champ obligatoire de la Preuve : indice du premier caractère de
    l'extrait dans le texte NORMALISÉ de l'instantané, pas dans le HTML brut ni dans la page affichée).
- **Faux refus connus** : une position comptée sur le texte brut ou affiché, une citation courte mais exacte (un nom,
  une version). Un extrait présent plusieurs fois est accepté à la position de n'importe laquelle de ses occurrences.
  Le message donne la première position trouvée, ce qui permet la correction en une passe.
- **Verdict** : FAIL.
- **Message** (O5 : la cause exacte) : « Preuve <id> (instantané <id>, source <url>) : <cause>. », la cause étant
  « l'extrait normalisé fait <n> caractères, moins des 20 exigés », « l'extrait figure à la position <x> et non à la
  position <y> déclarée », « l'extrait cité ne figure pas dans l'instantané » ou « l'instantané est inexistant ».
- **Test** : `OBS-02 refuse un extrait paraphrasé` ; `OBS-02 accepte un extrait identique aux blancs près` ;
  `OBS-02 nomme la cause`.

### OBS-03 `obs_source_non_enregistree`

- **Condition** : une Preuve désigne une source absente des sources enregistrées de l'entreprise (table `sources`
  du plugin, provenance `instantane` ou autre provenance admise), ou une adresse citée dans le texte d'un Chapitre
  comme référence n'a pas de source enregistrée.
- **Verdict** : FAIL.
- **Comparaison des adresses** (O2) : l'adresse citée et les sources enregistrées sont comparées sans fragment
  (`#…`) ni barre oblique finale, schéma et hôte en minuscules ; le chemin et la requête restent exacts.
- **Message** : « <emplacement> : la source <url> n'est pas enregistrée. Lisez-la par la lecture protégée avant de
  la citer. », suivi, s'il en existe une, de « Source enregistrée de ce domaine la plus proche : <url>. »
- **Test** : `OBS-03 refuse une preuve vers une adresse jamais lue` ; `OBS-03 accepte une preuve vers une source
  enregistrée` ; `OBS-03 accepte la source enregistrée avec une barre oblique finale ou un fragment` ;
  `OBS-03 cite la source enregistrée la plus proche du même domaine`.

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

- **Condition** : une Affirmation de nature « performance » n'a ni essai réussi lié
  (statut `verifie_experimentalement`), ni Preuve dans une source primaire de l'éditeur (statut
  `confirme_doc_officielle`, ou `rapporte_editeur` affiché comme annonce de l'éditeur). Également FAIL : dans le
  texte d'un Chapitre, un nombre suivi d'une unité de performance (ms, s, Mo/s, Go/s, requêtes par seconde, jetons
  par seconde, « fois plus rapide ») dans une phrase qui ne renvoie à aucune Affirmation. Un pourcentage ne compte
  que dans une phrase qui porte un mot de performance (gain, plus rapide, latence, débit, vitesse, performance,
  faster, speed… : `RE_MOT_PERF`) ou dans un chapitre de performances ; « s » suivi d'une apostrophe n'est pas une
  durée (« En 2026 s'ouvre… ») (O3). « Affiché comme annonce
  de l'éditeur » (SPEC-O6) : la ligne qui cite une Affirmation `rapporte_editeur` chiffrée porte une mention
  d'annonce (annonce, selon, d'après, par l'éditeur, announces, according to : `RE_ANNONCE`).
- **Nature « performance »** (SPEC-E13 : aucun champ structuré, choix tenu) : l'Affirmation est du chapitre `ch20`
  (« Performances et benchmarks ») ou son texte contient un chiffre suivi d'une de ces unités (`RE_PERF`,
  `regles-porte-obs.ts`). Un champ déclaré par l'agent ne remplace pas cette lecture : un chiffre non déclaré
  passerait la porte. Le faux positif du pourcentage qui n'est pas une performance (part de marché, « 40 % des
  contributeurs ») est levé hors du chapitre `ch20` (O3) ; dans `ch20`, toute Affirmation reste de nature
  « performance ».
- **Verdict** : FAIL.
- **Message** : « <emplacement> : chiffre de performance « <extrait> » sans essai ni source primaire. »
- **Test** : `OBS-06 refuse un gain chiffré tiré d'une vidéo` ; `OBS-06 refuse un chiffre nu dans le texte` ;
  `OBS-06 accepte un chiffre de la documentation officielle affiché comme annonce de l'éditeur`.
- **Remarque** : la règle de F.1 « un chiffre de performance n'est jamais vérifié expérimentalement sans essai de
  notre service » est tenue par OBS-04 ; OBS-06 interdit en plus le chiffre sans aucune base.

### OBS-07 `obs_chapitre_complet_sans_affirmation`

- **Condition** : un Chapitre a l'état « complet » et ne cite aucune Affirmation. L'état se lit aussi écrit en gras
  ou en italique (`**État** : complet`) (O4).
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
  version anglaise. Le glossaire protégé est l'ensemble des alias `nom` (noms de produit) des projets dont la révision
  cite une Affirmation, pris avec la casse de leur occurrence dans le français (`entrees-porte.ts`) ; le nom d'un projet
  n'en fait pas partie (celui d'un article est son titre français, qui se traduit).
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
- **Contrôle réel (30/10/2026)** : aucun champ ne dit le sens d'une Preuve (à l'appui ou contraire) ; toute Preuve
  qui désigne un instantané présent compte comme « preuve contraire » (`preuvesValables`, `regles-porte-obs.ts`).
  La règle vérifie donc qu'une contradiction est prouvée par une source collectée, pas qu'elle contredit. Un champ
  de sens sur la Preuve reste à créer (phase ultérieure) ; d'ici là, le relecteur juge le sens.
- **Verdict** : FAIL.
- **Message** : « Affirmation <id> : « contredit » sans preuve contraire liée. »
- **Test** : `OBS-11 refuse une contradiction non prouvée`.

### OBS-12 `obs_infere_sans_raisonnement`

- **Condition** : une Affirmation a le statut `infere` sans raisonnement stocké, ou ce raisonnement ne renvoie à
  aucune Affirmation prouvée dont il part.
- **Contrôle réel (30/10/2026)** : aucun champ « raisonnement » n'existe. C'est une convention de texte : le
  raisonnement est le texte de l'Affirmation qui suit `Raisonnement :`, et les Affirmations de départ y sont citées
  par `[aff:<id>]`. Une Affirmation de départ compte si elle a une Preuve sur un instantané présent et un statut
  prouvé (`verifie_experimentalement`, `confirme_doc_officielle`, `rapporte_editeur`, `rapporte_tiers`).
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
  source marquée primaire pour cet éditeur (domaine ou dépôt officiel enregistré sur la Fiche). SPEC-E6 : une source
  primaire d'un projet ne vaut que pour les Affirmations de ce projet ; une source primaire de la base commune,
  rattachée à aucun éditeur, vaut pour toutes (limite connue).
- **Verdict** : FAIL.
- **Message** : « Affirmation <id> : « confirmé par la documentation officielle » mais la preuve vient de <domaine>,
  qui n'est pas une source de l'éditeur. »
- **Test** : `OBS-14 refuse un blog tiers présenté comme documentation officielle`.

### OBS-15 `obs_source_collecte_refusee`

- **Condition** : une Preuve s'appuie sur une source dont la décision de droits (K4) est « refusée » ou absente, ou
  un extrait publié dépasse la longueur maximale fixée par K4 pour cette source, ou les extraits d'une même source
  cités dans la Revision dépassent ensemble le cumul fixé par K4. Décision K4 d'une source : `politique_collecte`
  (`autorisee: true`, `extraitMax` et `cumulMax` en caractères, entiers posés par un humain). Sans plafond fixé :
  500 caractères par extrait et 1500 en cumul (valeurs provisoires, à fixer source par source avant l'ouverture publique).
  DROIT-5.2 : la source d'une Preuve doit aussi avoir un auteur enregistré (`politique_collecte.auteur`, personne ou
  organisation, fixé par un humain par `obs.base.importer`, champ `auteur` ; l'importeur de la base reprend `editeur`),
  car une citation publiée mentionne la source et le nom de l'auteur (Code de droit économique, art. XI.189). Auteur
  impossible à établir : l'humain écrit pourquoi dans ce champ (par exemple « page sans auteur nommé, éditeur du site »).
  Les sources publiées par `obs.publications.aexporter` portent leur `auteur`.
- **Verdict** : FAIL.
- **Message** (O6 : chaque cause présente, séparées par « ; ») : « Preuve <id> : la source <domaine> n'est pas
  autorisée à la collecte (aucune décision de droits). » ou « … a un extrait de <n> caractères, au-delà des <max>
  permis. » ;
  pour le cumul : « Source <domaine> : <n> caractères d'extraits cités dans cette révision, au-delà des <max> permis. » ;
  sans auteur : « Preuve <id> : la source <domaine> n'a aucun auteur enregistré : une citation publiée nomme son auteur
  et sa source (CDE, art. XI.189), à faire fixer par l'humain (obs.base.importer, champ auteur). »
- **Test** : `OBS-15 refuse une source sans décision de droits` ; `OBS-15 refuse un extrait trop long` ;
  `DROIT-5.1 : OBS-15 applique le plafond d'extrait fixé par la décision K4` ; `DROIT-5.1 : OBS-15 refuse le cumul` ;
  `DROIT-5.2 : OBS-15 refuse une preuve dont la source n'a pas d'auteur enregistré`.

### OBS-16 `obs_affirmation_inconnue`

- **Condition** : le texte de la Revision renvoie à un identifiant d'Affirmation qui n'existe pas dans le Dossier.
- **Verdict** : FAIL.
- **Message** : « <emplacement> : renvoi à l'affirmation <id>, qui n'existe pas. », une fois par identifiant (première
  citation, comme OBS-01 et OBS-10 : O7).
- **Test** : `OBS-16 refuse un renvoi inventé` ; `OBS-16 ne répète pas le motif d'une même affirmation inconnue`.

### OBS-17 `obs_nombre_absent_affirmation`

- **Condition** : une phrase de la Revision qui cite une ou plusieurs Affirmations contient un nombre, une date ou une
  heure qui ne figure dans le texte d'aucune d'elles (audit du 29/10/2026, LIV-OB-3 : une heure inventée avait passé
  trois revues). Les nombres d'une date reformulée (« 27 octobre 2026 » pour « 27/10/2026 ») sont admis.
- **Verdict** : FAIL.
- **Message** : « <emplacement> : « <nombre> » ne figure dans le texte d'aucune affirmation citée par la phrase. »
- **Test** : `OBS-17 refuse une heure de la phrase citée absente du texte de l'affirmation`.

### OBS-18 `obs_version_hors_extrait`

- **Condition** : le texte d'une Affirmation contient un numéro de version (ou un nombre décimal) qui ne figure dans
  aucun de ses extraits (audit du 29/10/2026, LIV-OB-4 : affirmation plus large que sa preuve).
- **Verdict** : FAIL.
- **Message** : « Affirmation <id> (<chapitre>) : « <numéro> » ne figure dans aucun de ses extraits ; étendre l'extrait
  ou scinder l'affirmation. »
- **Test** : `OBS-18 refuse un numéro de version de l'affirmation absent de tous ses extraits`.

### Règles de rédaction communes (LANG-L3)

- **Portée** : appliquées à toute révision d'un livrable, celles de l'Observatoire comprises, en plus d'OBS-01 à
  OBS-18 (`controlerRedaction`, `plugin-atelier/src/serveur/regles-redaction.ts`, appelée par `evaluerPorte`).
  Elles vérifient la consigne commune « Langue et style » sur la seule prose de l'agent : blocs de code, code en
  ligne, lignes citées (`>`), citations entre guillemets français, liens et balises sont exclus.
- **Codes** : `redaction_tiret_cadratin` (tiret cadratin hors citation : virgule, deux-points ou parenthèses à la
  place) ; `redaction_guillemets_droits` (guillemets droits dans le texte : guillemets français « » à la place).
- **Verdict** : FAIL, un motif par règle avec le nombre d'occurrences et la ligne de la première.

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
| OBS-17 | `obs_nombre_absent_affirmation` | nombre cité absent de l'affirmation citée | audit du 29/10/2026 (LIV-OB-3) |
| OBS-18 | `obs_version_hors_extrait` | version de l'affirmation absente de ses extraits | audit du 29/10/2026 (LIV-OB-4) |

Un numéro n'est jamais réattribué, même si une règle est retirée.

## 5. Hors de la porte

Ne sont pas des règles de porte, car elles exigent un jugement : pertinence d'un outil, justesse d'un raisonnement,
promesse excessive, choix entre deux sources qui se contredisent. Elles relèvent de `relecteur-independant`, dont le
verdict structuré est ensuite exigé par les motifs existants `revue_requise_absente` et
`revue_sur_ancienne_version`. Les injections signalées par K2 ne font pas non plus échouer la porte : un extrait qui
contient une consigne reste une citation valable ; c'est l'agent qui ne doit pas lui obéir.
