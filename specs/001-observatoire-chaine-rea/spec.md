# Feature Specification: Chaîne de production de l'Observatoire et fiche pilote REA (phase 3)

**Feature Branch**: aucune (travail sur `main`, sans copie de travail, règle de l'opérateur)

**Created**: 27/10/2026

**Status**: Draft

**Input**: User description: « Phase 3 de l'Observatoire : la chaîne de production du département, de la collecte jusqu'au contenu publiable, prouvée de bout en bout sur le pilote REA. » JB (27/10/2026) : « c'est à lui [le département] de faire ce travail : récolter toutes les informations et les publier sur le site web dédié de l'observatoire » ; « tu peux mettre cela en place et passer à la phase suivante ».

## Contexte

L'Observatoire est le 29e service de l'usine (entreprise « OBS » sur l'instance 3100), installé en phase 2 avec ses 13 agents en pause. Il n'a encore produit aucun contenu : aucun outil ne collecte ses sources, aucune base ne garde ses preuves, la porte de contrôle applique encore les règles du marketing, et rien n'alimente le site. Cette phase construit la chaîne minimale réelle et la prouve sur un seul sujet, REA (dépôt `morluto/rea`, paquet npm `rea-agents`), jusqu'à une fiche de 25 champs publiable en interne. Références : `docs/observatoire/` (modèle de données, règles OBS-01 à OBS-16, politique de vérification, droits de collecte, ADR-001 à 010) et le plan maître (livrables F, I, K, M).

## Clarifications

### Session 2026-10-27

Réponses tranchées par Claude sur délégation de l'opérateur (« c'est à toi de guider »), chacune avec la recommandation du plan maître ; à revoir par l'opérateur à la relecture.

- Q: Comment la collecte est-elle déclenchée en phase 3 ? → A: à la demande (tâche du directeur ou commande), la tâche planifiée toutes les 6 h existe mais reste désactivée jusqu'à la phase 5.
- Q: La collecte GitHub utilise-t-elle un jeton ? → A: non en phase 3 (60 requêtes par heure suffisent pour un projet) ; un jeton en lecture seule, lu par son nom, viendra avec l'élargissement.
- Q: Par quel canal JB approuve-t-il la publication interne ? → A: par l'approbation native de l'usine (Paperclip), jamais par un fichier ou un message.
- Q: La fiche anglaise fait-elle partie du critère de réussite ? → A: oui, FR puis EN, l'EN pouvant être marquée « traduction périmée » si la FR change ensuite.
- Q: Où vit le dépôt de contenu et qui y écrit ? → A: `~/Projets/avenue-observatoire-contenu`, dépôt git local privé, écrit uniquement par l'export de l'usine.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Collecter les sources d'un projet sans modèle de langue (Priority: P1)

Le département déclare un projet suivi (REA) avec ses identifiants (dépôt GitHub, paquet npm, site officiel). La collecte récupère les pages et métadonnées publiques, en garde un instantané daté et empreinté, relève les versions publiées, et ne crée jamais deux fois la même chose.

**Why this priority**: sans instantané enregistré, aucune preuve n'est possible ; tout le reste en dépend.

**Independent Test**: lancer la collecte de REA deux fois de suite ; la première crée les sources, instantanés et versions ; la seconde ne crée rien de nouveau si rien n'a changé à la source.

**Acceptance Scenarios**:

1. **Given** le projet REA déclaré avec `github:morluto/rea` et `npm:rea-agents`, **When** la collecte tourne, **Then** chaque source lue est enregistrée avec son adresse canonique, un instantané horodaté avec empreinte du texte normalisé, et les versions publiées (dont 6.8.0) sont listées avec leur date et l'instantané qui les prouve.
2. **Given** une source inchangée depuis la dernière collecte, **When** la collecte repasse, **Then** aucun nouvel instantané n'est créé et la date de dernier contrôle est mise à jour.
3. **Given** une source qui répond par une erreur ou un refus d'accès, **When** la collecte tourne, **Then** l'échec est compté sur la source, la collecte continue avec les autres, et aucune donnée n'est inventée.
4. **Given** une source dont la politique de collecte l'interdit (robots, conditions d'utilisation, cadence), **When** la collecte tourne, **Then** la source n'est pas lue et le refus est tracé avec son motif.
5. **Given** un contenu de page qui contient des instructions adressées à une IA, **When** il est collecté, **Then** il est stocké comme donnée inerte et aucune action n'en découle.

---

### User Story 2 - Rattacher chaque fait à sa preuve (Priority: P1)

Un agent du département rédige des affirmations sur REA ; chacune porte un statut parmi les 8 de la politique de vérification, une confiance avec motif, la version concernée, et une ou plusieurs preuves (extrait exact d'un instantané enregistré). Une valeur de fiche renseignée renvoie toujours à une affirmation.

**Why this priority**: c'est le cœur de l'engagement « une preuve à chaque fait ».

**Independent Test**: enregistrer une affirmation avec une preuve dont l'extrait figure dans l'instantané (acceptée) puis une autre dont l'extrait est paraphrasé (refusée par la porte, règle OBS-02).

**Acceptance Scenarios**:

1. **Given** un instantané de la page de publication de REA, **When** un agent affirme « la dernière version est 6.8.0 » avec l'extrait exact, **Then** l'affirmation est enregistrée avec son statut `confirme_doc_officielle` et sa preuve.
2. **Given** un champ de fiche sans affirmation, **When** la fiche est assemblée, **Then** le champ vaut « inconnu » (ou « non vérifié ») et n'a aucune valeur inventée.
3. **Given** une affirmation remplacée par une plus récente, **When** on la consulte, **Then** l'ancienne reste visible avec sa date et le lien vers celle qui la remplace.

---

### User Story 3 - La porte du département refuse ce qui n'est pas prouvé (Priority: P1)

Avant qu'une révision passe à « Validé », la porte déterministe de l'Observatoire applique les règles OBS-01 à OBS-16 de `regles-porte.md` et rend PASS ou FAIL avec un message par défaut trouvé. Elle ne touche pas aux règles du marketing des autres services.

**Why this priority**: c'est le garde-fou contre les faits inventés ; sans elle, rien ne doit être publié.

**Independent Test**: soumettre à la porte un corpus piégé (source jamais lue, extrait paraphrasé, « vérifié expérimentalement » sans essai, version inventée, traduction sur une base française périmée, renvoi vers une affirmation inconnue…) ; chaque piège produit le FAIL de sa règle ; un corpus propre produit PASS.

**Acceptance Scenarios**:

1. **Given** une révision qui cite une source jamais enregistrée, **When** la porte l'évalue, **Then** FAIL OBS-03 avec l'adresse fautive.
2. **Given** une affirmation `verifie_experimentalement` (aucun service d'essais n'existe encore), **When** la porte l'évalue, **Then** FAIL OBS-04.
3. **Given** une révision anglaise dont la base française a changé, **When** la porte l'évalue, **Then** FAIL OBS-08 (traduction périmée).
4. **Given** une révision conforme, **When** la porte l'évalue, **Then** PASS, et ce PASS est requis pour la passer à « Validé ».
5. **Given** une tâche d'une autre entreprise de l'usine, **When** la porte tourne, **Then** les règles du marketing s'appliquent comme avant, inchangées.

---

### User Story 4 - Les agents produisent la fiche REA (Priority: P2)

Les agents de l'Observatoire nécessaires à la tranche sont activés sur 3100 (après sauvegarde, photos avant/après et essai à blanc). Le directeur crée la tâche « fiche REA » ; la veille et l'analyste produisent les affirmations ; l'adaptateur produit la version anglaise ; le relecteur indépendant relit ; la porte contrôle ; JB approuve la première publication interne.

**Why this priority**: c'est la preuve que la chaîne fonctionne avec de vrais agents, mais elle dépend des stories 1 à 3.

**Independent Test**: la fiche REA FR existe avec ses 25 champs, chaque valeur renseignée sourcée ou marquée « inconnu », PASS de la porte, relecture faite, approbation de l'opérateur enregistrée ; la fiche EN existe et renvoie à la révision française de base.

**Acceptance Scenarios**:

1. **Given** les agents de la tranche activés, **When** le directeur lance la fiche REA, **Then** le travail circule par les tâches natives de l'usine, sans appel direct entre agents, et s'arrête au retour humain après 3 cycles de correction.
2. **Given** la fiche FR validée, **When** l'adaptateur la traduit, **Then** la fiche EN porte l'identifiant de la révision française de base et le code, les commandes et les noms propres sont recopiés à l'identique.
3. **Given** les agents de l'Observatoire actifs, **When** on compare l'instance avant et après, **Then** les 28 autres services sont inchangés.

---

### User Story 5 - Exporter le contenu approuvé pour le site (Priority: P2)

Une révision approuvée est exportée en Markdown avec en-tête structuré dans un dépôt git de contenu local, que le site lira en phase 4. Le site n'accède jamais à la base de l'usine.

**Why this priority**: c'est le pont vers le site, mais le site n'existe qu'en phase 4.

**Independent Test**: après approbation, le dépôt de contenu contient `fr/projets/rea/fiche.md` et `en/projets/rea/fiche.md`, avec en-tête (projet, révision, langue, base française, date de vérification, statut, sources, affirmations) et un commit qui porte l'identifiant de la révision ; réexporter sans changement ne crée pas de commit.

**Acceptance Scenarios**:

1. **Given** une révision approuvée, **When** l'export tourne, **Then** le fichier Markdown est écrit, l'empreinte de l'artefact et le commit sont enregistrés comme publication.
2. **Given** une révision non approuvée, **When** l'export tourne, **Then** rien n'est exporté.
3. **Given** un champ « inconnu », **When** il est exporté, **Then** il reste « inconnu » dans le Markdown, jamais vide ni rempli.

---

### User Story 6 - Mesurer ce que coûte la tranche (Priority: P3)

La consommation de la tranche (quota de l'abonnement et équivalent API) est relevée par agent et par livrable, pour calibrer les volumes de la phase 5.

**Why this priority**: le quota est la ressource rare (mesure du 23/10), mais la mesure n'empêche pas la chaîne de fonctionner.

**Independent Test**: un relevé indique, pour la fiche REA, le coût par agent et le total, comparé à l'estimation du plan (≈ 0,90 $ par fiche).

**Acceptance Scenarios**:

1. **Given** la fiche REA produite, **When** on consulte le relevé, **Then** il donne le coût par agent, le total et l'écart avec l'estimation.

### Edge Cases

- Projet introuvable (dépôt supprimé, paquet retiré) : la source est marquée en échec, le projet passe « non maintenu » seulement après plusieurs échecs consécutifs, jamais sur un seul.
- Deux identifiants qui désignent le même projet (dépôt renommé, paquet au nom différent) : un seul projet, plusieurs alias ; un alias déjà pris ne peut pas être rattaché à un autre projet.
- Version préliminaire (rc, beta) : relevée et marquée comme telle, jamais présentée comme la dernière version stable.
- Page énorme ou réponse lente : la lecture est bornée en taille et en durée (lecture protégée existante), l'échec est tracé.
- Instantané au texte identique mais en-têtes HTTP différents : pas de nouvel instantané (l'empreinte porte sur le texte normalisé).
- Quota d'API GitHub épuisé : la collecte s'arrête proprement et reprend à la prochaine fenêtre, sans perte.
- Chiffre d'étoiles anormal (390 702 pour un dépôt créé le 14/04/2026) : relevé comme fait daté, jamais interprété sans preuve.
- Agent qui affirme un chiffre de performance : refusé sans essai ni source primaire (OBS-06).
- Une révision anglaise produite avant la française : impossible, la base française est obligatoire.

## Requirements *(mandatory)*

### Functional Requirements

**Stockage documentaire**

- **FR-001**: Le système DOIT conserver, par entreprise, les projets suivis, leurs alias (unique par type et valeur), les sources (adresse canonique unique), les instantanés (unique par source et empreinte du texte normalisé), les versions (unique par projet et numéro), les affirmations, les preuves, les révisions, les chapitres et les publications, selon `docs/observatoire/modele-donnees.md`.
- **FR-002**: Ce stockage DOIT être additif (aucune donnée existante modifiée) et inerte pour toute entreprise qui n'est pas l'Observatoire : ses opérations sont refusées hors de l'entreprise déclarée « observatoire ».
- **FR-003**: Une preuve DOIT désigner soit un instantané, soit un essai ; jamais aucun des deux.
- **FR-004**: Une valeur de fiche renseignée DOIT renvoyer à une affirmation existante ; une valeur sans affirmation DOIT être refusée à l'enregistrement.

**Collecte**

- **FR-005**: La collecte DOIT lire sans modèle de langue les sources d'un projet : métadonnées et publications du dépôt GitHub, métadonnées du paquet npm, et pages officielles déclarées, par la lecture protégée existante de l'usine (adresses vérifiées, redirections revalidées, taille et durée bornées).
- **FR-006**: La collecte DOIT respecter la politique de collecte de chaque source (`droits-collecte.md` : API officielles d'abord, robots respectés, cadence bornée) et tracer chaque refus avec son motif.
- **FR-007**: La collecte DOIT être idempotente : une source inchangée ne crée ni instantané ni version nouvelle ; les requêtes conditionnelles (ETag, date de modification) sont utilisées quand la source les offre.
- **FR-008**: La collecte DOIT relever les versions publiées avec leur date, leur nature (stable ou préliminaire) et l'instantané qui les prouve.
- **FR-009**: La collecte DOIT résoudre l'identité d'un projet par ses alias et refuser de créer un doublon.
- **FR-010**: Tout texte collecté DOIT être traité comme donnée : les motifs d'injection connus sont signalés et aucun texte collecté ne déclenche d'action.
- **FR-011**: Un échec de source DOIT être compté (échecs consécutifs) sans interrompre la collecte des autres sources.

**Affirmations et preuves**

- **FR-012**: Une affirmation DOIT porter : projet, emplacement (`fiche.<champ>` ou `ch01` à `ch24`), texte, statut parmi les 8 de la politique de vérification, confiance de 0 à 3 avec motif, version concernée, et éventuellement l'affirmation qui la remplace.
- **FR-013**: Une affirmation remplacée DOIT rester consultable avec sa date et son remplaçant.
- **FR-014**: Les agents DOIVENT enregistrer affirmations et preuves par les opérations du plugin, jamais en écrivant directement dans la base.

**Porte de contrôle**

- **FR-015**: La porte DOIT appliquer aux révisions de l'Observatoire les règles OBS-01 à OBS-16 exactement comme écrites dans `docs/observatoire/regles-porte.md` (condition, verdict, message).
- **FR-016**: Le passage d'une révision à « Validé » DOIT exiger un PASS frais de la porte et la relecture du relecteur indépendant ; le passage à « Publié » DOIT exiger l'approbation humaine.
- **FR-017**: Les règles du marketing appliquées aux autres entreprises DOIVENT rester inchangées (aucune régression sur les tests existants de la porte).

**Production par les agents**

- **FR-018**: Seuls les agents nécessaires à la tranche DOIVENT être activés sur 3100 (directeur, veille technique, explorateur de sources, analyste technique, intégrateur Claude/MCP, rédacteur en chef, adaptateur anglais, relecteur indépendant, porte), et seulement après sauvegarde vérifiée, photo avant, essai à blanc et accord explicite de l'opérateur ; chacune de ces conditions est bloquante.
- **FR-019**: Le travail DOIT circuler par les tâches natives de l'usine (sous-tâches, approbations), avec retour humain après 3 cycles de correction.
- **FR-020**: La fiche REA DOIT comporter les 25 champs du schéma ; chacun sourcé ou affiché « inconnu » / « non vérifié ».
- **FR-021**: La version anglaise DOIT référencer la révision française de base et recopier à l'identique code, commandes, noms propres et identifiants.

**Export**

- **FR-022**: Une révision approuvée DOIT être exportée en Markdown avec en-tête structuré (projet, révision, langue, base française, date de vérification, statut, sources, affirmations) dans un dépôt git de contenu local distinct de l'usine, avec une ancre stable par affirmation.
- **FR-023**: Chaque export DOIT être enregistré comme publication (cible, objet, empreinte de l'artefact, commit) ; un export sans changement ne crée pas de commit.
- **FR-024**: Une révision non approuvée NE DOIT jamais être exportée.

**Mesure**

- **FR-025**: La consommation de la tranche DOIT être relevée par agent et par livrable et comparée à l'estimation du plan.

**Précisions issues de la checklist d'intégrité (27/10/2026)**

- **FR-026**: « inconnu » signifie qu'aucune affirmation n'existe pour le champ ; « non vérifié » signifie qu'une affirmation existe avec le statut `non_verifie`, affichée comme telle.
- **FR-027**: Un instantané n'est jamais supprimé ni modifié ; une preuve reste attachée à son instantané d'origine même si un plus récent existe (la détection des changements est en phase 6).
- **FR-028**: La normalisation de comparaison des extraits est celle de la règle OBS-02 et du normaliseur K2 (`composants.md`), définie une seule fois et partagée par la collecte et la porte.
- **FR-029**: Le motif de confiance est une phrase non vide qui dit pourquoi ce niveau.
- **FR-030**: La porte choisit son jeu de règles selon l'entreprise de la tâche : règles OBS pour l'Observatoire, règles actuelles pour toutes les autres.
- **FR-031**: Un PASS est frais s'il a été rendu sur l'empreinte actuelle de la révision ; toute modification après le PASS l'annule.
- **FR-032**: Une source passe « en échec » après 5 échecs consécutifs ; en phase 3, un projet ne passe jamais « non maintenu » automatiquement.
- **FR-033**: À l'épuisement d'un quota d'API, la collecte s'arrête sans rien perdre et reprend à la fenêtre suivante (testable par une réponse de quota simulée).
- **FR-034**: Un contenu collecté contenant des motifs d'injection est signalé, et sa collecte ne crée aucune tâche, aucun message ni aucune action (vérifié par un README piégé dans le corpus de test).
- **FR-035**: Une opération du stockage documentaire demandée par une autre entreprise est refusée avec le message « module Observatoire désactivé pour cette entreprise ».
- **FR-036**: L'export n'écrit que des révisions approuvées, passe un contrôle de secrets avant chaque commit, et refuse d'écrire si le dépôt de contenu a des modifications locales non exportées ; l'ancre d'une affirmation est `#a-<identifiant>`.

### Key Entities

- **Projet** : une technologie suivie (REA), avec éditeur, statut éditorial et alias.
- **Alias** : identifiant externe (dépôt, paquet, site, nom) rattaché à un seul projet.
- **Source** : adresse canonique lue, avec sa politique de collecte, ses validateurs HTTP et ses échecs.
- **Instantané** : texte normalisé d'une source à une date, avec empreinte ; jamais republié tel quel.
- **Version** : numéro publié d'un projet, date, nature, instantané de preuve.
- **Affirmation** : un fait sur un projet, à un emplacement, avec statut, confiance et version.
- **Preuve** : extrait exact d'un instantané (ou essai) qui appuie une affirmation.
- **Révision** : état daté d'une fiche ou d'un dossier dans une langue ; l'anglaise renvoie à sa base française.
- **Publication** : trace d'un export (cible, artefact, empreinte, commit).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: La fiche REA FR et EN est approuvée par l'opérateur, avec 25 champs dont 100 % des valeurs renseignées rattachées à une affirmation prouvée, les autres affichées « inconnu » ou « non vérifié ».
- **SC-002**: Le corpus piégé déclenche 16 refus sur 16 règles (au moins un cas de refus et un cas d'acceptation par règle OBS-01 à OBS-16) et le corpus propre passe ; 0 faux PASS.
- **SC-003**: Deux collectes successives sans changement à la source ne créent aucun nouvel enregistrement.
- **SC-004**: La comparaison de l'instance avant et après activation montre 0 changement dans les 28 autres services.
- **SC-005**: Le dépôt de contenu contient les deux fichiers de la fiche REA, reconstruisibles depuis la base, et un réexport sans changement ne crée aucun commit.
- **SC-006**: Le coût de la fiche REA est mesuré par agent et comparé à l'estimation (≈ 0,90 $ en équivalent API).
- **SC-007**: Toutes les suites existantes de l'usine restent vertes (scripts, plugin, porte du marketing).

## Assumptions

- Le stockage vit dans le plugin existant de l'usine (module isolé, migrations numérotées après la 022, tables préfixées `obs_`) ; aucune nouvelle capacité n'est ajoutée au manifeste du plugin (piège connu : cela bloque sa mise à jour).
- La collecte de cette phase couvre GitHub, npm et les pages officielles déclarées ; arXiv, YouTube et la réglementation viennent plus tard (phase 6), la transcription vidéo locale aussi (compétence `veille-publications-videos` à réécrire alors).
- Le service d'essais n'existe pas encore : tout statut « vérifié expérimentalement » est refusé (effet voulu d'OBS-04).
- Le dépôt de contenu est local et privé (`~/Projets/avenue-observatoire-contenu`) ; il n'est publié nulle part avant la phase 7.
- L'abonnement Claude de l'opérateur sert à faire tourner les agents ; aucun service payant n'est ajouté.
- Le dossier REA en 24 chapitres (phase 3 bis), le site (phase 4) et le magazine (phase 5) sont hors périmètre ; leur design est déjà choisi (fusion A, `~/Projets/avenue-observatoire/.impeccable/`).
