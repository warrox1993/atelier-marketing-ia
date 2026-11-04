# Observatoire phase 3 : chaîne du département et fiche REA, plan d'exécution

> **Pour les agents qui exécutent :** compétence requise `superpowers:executing-plans` (ou
> `superpowers:subagent-driven-development`). Cases `- [ ]` pour le suivi. Aucun worktree (règle de l'opérateur), commits
> `git commit -o -- <chemins>` avec les deux lignes d'attribution de la session.

**Goal :** construire la chaîne minimale réelle de l'Observatoire (stockage documentaire, collecte GitHub et npm,
affirmations et preuves, règles OBS-01 à OBS-16 de la porte, export Markdown) et la prouver sur la fiche REA.

**Architecture :** module isolé `plugin-atelier/src/serveur/observatoire/` (fonctions pures testées sans base +
un dépôt SQL paramétré par `company_id`), une migration additive `023_obs_documentaire.sql`, un branchement de la
porte existante par service (`stock.serviceDeEntreprise(companyId) === "observatoire"`), des actions et outils
d'agent enregistrés avec les capacités DÉJÀ déclarées du manifeste (`api.routes.register`, `agent.tools.register`),
et un script d'export hors plugin (`scripts/exporter-observatoire.py`) qui écrit le dépôt de contenu.

**Décisions d'architecture (revue gstack-plan-eng-review du 27/10/2026, choix délégués par l'opérateur) :**
- R1. La porte de l'Observatoire réutilise la mise sous porte native (`portes.creer`, `routes.ts:41`) : chaque
  projet suivi a UNE campagne technique (`campagnes`, `mode = 'reel'`, `nom = 'Observatoire : <nom>'`), parce que
  `portes.campagne_id` est obligatoire (`001_atelier_socle.sql:82`). La mise sous porte impose déjà une étape de
  revue et une approbation humaine finale (`services.ts:1821-1830`) : c'est FR-016 sans code nouveau.
- R2. Le brouillon de fiche est le livrable natif de la tâche (document de tâche `fiche-<slug>-<langue>`, révisions
  natives) ; la porte l'évalue comme tout livrable. `obs_revisions` reçoit l'instantané APPROUVÉ (corps, empreinte,
  identifiant de révision native) : c'est la seule source de l'export.
- R3. Les agents appellent le module par des routes HTTP déclarées dans `ROUTES_API` (`src/contrats/routes.ts`),
  chemin `/taches/:issueId/obs/...`, `auth: "board-or-agent"`, comme le relecteur (`organisation/agents/relecteur/AGENTS.md:77-80`) ;
  la liste `tools` du manifeste (`manifest.ts:198`) reste celle de la fabrique.

**Tech Stack :** TypeScript (plugin, vitest), SQL PostgreSQL 18 (schéma du plugin), Python 3.14 (script d'export,
tests `scripts/tests/`), git.

**Spec :** `specs/001-observatoire-chaine-rea/spec.md` (FR-001 à FR-036, SC-001 à SC-007). Références :
`docs/observatoire/modele-donnees.md` (§ SQL indicatif, l. 15-206), `docs/observatoire/regles-porte.md`
(OBS-01 à OBS-16, l. 59-215), `docs/observatoire/composants.md` (K1, K2, K3, K6), `docs/observatoire/droits-collecte.md`.

## Global Constraints

- Aucune nouvelle capacité dans `plugin-atelier/src/manifest.ts` (piège prouvé : bloque la mise à jour du plugin).
- Aucun job SDK (`jobs.schedule` serait une capacité nouvelle, `veilleur.ts:24`) : la collecte est une action à la demande.
- Migrations : fichier `NNN_slug.sql`, schéma `plugin_atelier_f0322cc62c`, **aucune apostrophe droite** dans les
  commentaires (validateur de Paperclip), aucune instruction `DELETE`/`DROP`/`ALTER ... DROP`, purement additive.
- Tout SQL paramétré et filtré par `company_id` (convention de `services-experiences.ts:12`).
- Toute opération du module refusée hors de l'entreprise dont le service est `observatoire`, message exact :
  « module Observatoire désactivé pour cette entreprise » (FR-035).
- Règles de la porte de l'Observatoire : codes `obs_*` exactement comme `regles-porte.md`, messages en français,
  au plus 20 motifs par règle (`MOTIFS_MAX_PAR_REGLE`), OBS-08 ajouté à `MOTIFS_SANS_CYCLE` (`porte.ts:125`).
- Les règles du marketing restent inchangées pour toute autre entreprise ; suites existantes vertes (SC-007).
- Normalisation des extraits (K2) : Unicode NFC + blancs réduits, une seule fonction partagée collecte/porte (FR-028).
- Lecture réseau seulement par `lireUrl` (`src/serveur/lecture-url.ts:150`, 2 Mo, 10 s, 5 redirections).
- Texte collecté = donnée : `injectionsSignalees` (`contenu-externe.ts:77`) signale, aucune action n'en découle.
- Jamais le nom du client dans un fichier suivi ; aucune donnée personnelle ; commentaires et messages en français.
- Instance 3100 : rien avant la tâche 12, et la tâche 12 exige l'accord explicite de l'opérateur, la sauvegarde vérifiée,
  la photo avant et l'essai à blanc.

## Review Focus

1. Extrait cité qui diffère de l'instantané seulement par des espaces insécables, des fins de ligne `\r\n` ou une
   composition Unicode NFD : doit être ACCEPTÉ (même normalisation des deux côtés). Test en tâche 3.
2. Réponse GitHub `403` avec `x-ratelimit-remaining: 0` au milieu d'une collecte : arrêt propre, aucune source
   marquée en échec, reprise possible (FR-033). Test en tâche 5.
3. Version préliminaire (`6.9.0-rc.1`, release `prerelease: true`) publiée après 6.8.0 : jamais retenue comme
   « dernière version » de la fiche. Test en tâche 5 et tâche 10.
4. Entreprise marketing qui appelle une action `obs.*` ou dont la tâche passe par la porte : refus du module pour
   la première, règles marketing inchangées pour la seconde. Tests en tâches 2 et 9.
5. Réexport d'une révision inchangée, et dépôt de contenu avec une modification locale : aucun commit pour le
   premier, refus explicite pour le second (FR-023, FR-036). Tests en tâche 11.

---

### Task 1 : migration `023_obs_documentaire.sql`

**Files :** Create `plugin-atelier/migrations/023_obs_documentaire.sql` ; Test `plugin-atelier/tests/migration-observatoire.spec.ts`

**Interfaces :** Produces les tables `obs_projets`, `obs_alias`, `obs_sources`, `obs_instantanes`, `obs_versions`,
`obs_affirmations`, `obs_preuves`, `obs_revisions`, `obs_publications` (colonnes et contraintes : `modele-donnees.md`
§ SQL indicatif, restreint à ces 9 tables ; `obs_essais`, `obs_editions`, `obs_comparaisons`, `obs_categories`
viennent plus tard). Chaque table porte `company_id uuid not null`. Contraintes exigées : unicité (`company_id`,
`slug`) des projets ; (`company_id`, `type`, `valeur`) des alias ; (`company_id`, `url_canonique`) des sources ;
(`source_id`, `empreinte_sha256`) des instantanés ; (`projet_id`, `version`) des versions ; `check` sur
`obs_affirmations.statut` (les 8 valeurs de `STATUTS_VERIFICATION`) et `confiance between 0 and 3` ; `check
((instantane_id is not null) <> (essai_id is not null))` sur `obs_preuves` (FR-003 ; `essai_id uuid` sans clé
étrangère tant que `obs_essais` n'existe pas).

- [ ] Écrire le test (modèle : `tests/migration-experiences.spec.ts:15-24`) : `023` suit `022` ; le texte ne contient
  ni `delete`, ni `drop`, ni apostrophe droite dans un commentaire ; il crée les 9 tables ; il contient le `check`
  des 8 statuts et le `check` exclusif instantané/essai.
- [ ] Lancer `cd plugin-atelier && npx vitest run tests/migration-observatoire.spec.ts` → ÉCHEC (fichier absent).
- [ ] Écrire la migration.
- [ ] Relancer → PASS ; puis `npx vitest run tests/migration-` (toutes les migrations) → PASS.
- [ ] Commit `feat(observatoire): migration 023 du stockage documentaire`.

### Task 2 : garde du module

**Files :** Create `plugin-atelier/src/serveur/observatoire/garde.ts` ; Test `plugin-atelier/tests/observatoire-garde.spec.ts`

**Interfaces :** Produces `export const SERVICE_OBSERVATOIRE = "observatoire"` et
`export async function exigerObservatoire(stock: Pick<StockLiaisons, "serviceDeEntreprise">, companyId: string | undefined): Promise<string>`
(renvoie `companyId` ; sinon lève l'erreur `acces_refuse` du module `erreurs.ts` avec le message de FR-035).

- [ ] Tests : `refuse une entreprise sans companyId` ; `refuse une entreprise du service marketing` (message exact) ;
  `refuse une entreprise sans service déclaré` ; `accepte l'entreprise du service observatoire`.
- [ ] ÉCHEC → implémenter → PASS → commit `feat(observatoire): garde du module par service`.

### Task 3 : normaliseur K2

**Files :** Create `plugin-atelier/src/serveur/observatoire/normaliseur.ts` ; Test `tests/observatoire-normaliseur.spec.ts`

**Interfaces :** Produces `export const VERSION_NORMALISATION = 1`,
`export function normaliserTexte(brut: string, type: "html" | "texte" | "json"): string` (html → `htmlVersMarkdown`
de `html-markdown.ts:88` ; puis NFC, `\r\n` → `\n`, espaces insécables → espace, suites de blancs → un espace par
ligne, lignes vides multiples → une), `export function empreinte(texteNormalise: string): string` (sha256 hex),
`export function extraitPresent(extrait: string, texteNormalise: string): boolean` (normalise l'extrait par la même
fonction, `type: "texte"`, puis sous-chaîne exacte).

- [ ] Tests : Review Focus 1 (NBSP, `\r\n`, NFD acceptés) ; `refuse un extrait paraphrasé` ; `même texte, même
  empreinte` ; `html réduit au texte visible`.
- [ ] ÉCHEC → implémenter → PASS → commit `feat(observatoire): normaliseur des instantanés`.

### Task 4 : identités K3

**Files :** Create `plugin-atelier/src/serveur/observatoire/identites.ts` ; Test `tests/observatoire-identites.spec.ts`

**Interfaces :** Produces `export type Alias = { type: "github" | "npm" | "site" | "nom"; valeur: string }`,
`export function canoniserAlias(a: Alias): Alias` (github `Owner/Repo` → minuscules, sans `.git` ni URL ; npm →
minuscules ; site → origine sans barre finale ; nom → NFC minuscules sans accents),
`export function resoudreProjet(alias: Alias[], existants: ReadonlyArray<{ projetId: string; alias: Alias }>): { projetId: string | null; conflit: boolean }`
(conflit si les alias désignent deux projets différents : FR-009).

- [ ] Tests : `github.com/Morluto/REA.git et morluto/rea désignent le même projet` ; `alias inconnu → projet null` ;
  `deux alias rattachés à deux projets → conflit`.
- [ ] ÉCHEC → implémenter → PASS → commit `feat(observatoire): résolution des identités de projets`.

### Task 5 : collecteurs K1 (GitHub, npm, page officielle)

**Files :** Create `plugin-atelier/src/serveur/observatoire/collecte.ts` ; Test `tests/observatoire-collecte.spec.ts`
(+ fixtures `tests/fixtures/observatoire/{github-repo,github-releases,npm-rea-agents}.json`, construites à partir de
réponses réelles de `api.github.com/repos/morluto/rea`, `/releases` et `registry.npmjs.org/rea-agents`, réduites aux
champs utiles ; aucune donnée personnelle hors noms publics d'auteurs)

**Interfaces :** Consumes `normaliserTexte`, `empreinte` (tâche 3), `lireUrl` (transport injecté).
Produces :
- `export type VersionRelevee = { version: string; publieeLe: string | null; prerelease: boolean }`
- `export function versionsGithub(releasesJson: unknown): VersionRelevee[]` ; `export function versionsNpm(paquetJson: unknown): VersionRelevee[]` (prerelease = drapeau GitHub ou suffixe semver `-x`) ;
- `export function derniereStable(v: VersionRelevee[]): VersionRelevee | null` ;
- `export type ResultatCollecte = { url: string; etat: "nouveau" | "inchange" | "refuse" | "echec" | "quota"; texteNormalise?: string; empreinte?: string; etag?: string; motif?: string; injections?: string[] }`
- `export async function collecterSource(s: { url: string; etag: string | null; derniereEmpreinte: string | null; politique: { autorisee: boolean; motif?: string } }, lire: LireUrl): Promise<ResultatCollecte>`
  (politique refusée → `refuse` sans requête, FR-006 ; envoie `If-None-Match` ; `304` ou empreinte identique →
  `inchange`, FR-007 ; `403`/`429` avec quota épuisé → `quota`, FR-033 ; autre erreur → `echec` ; signale
  `injectionsSignalees`, FR-010/FR-034).

- [ ] Tests : `versionsGithub relève 6.8.0 et sa date` ; Review Focus 3 (`derniereStable ignore 6.9.0-rc.1`) ;
  `304 → inchangé` ; `même empreinte → inchangé` ; Review Focus 2 (`403 quota → état quota, pas échec`) ;
  `politique refusée → aucune requête` ; `README piégé : injections signalées, texte conservé`.
- [ ] ÉCHEC → implémenter → PASS → commit `feat(observatoire): collecteurs GitHub, npm et pages`.

### Task 6 : dépôt SQL du module

**Files :** Create `plugin-atelier/src/serveur/observatoire/base-observatoire.ts` ; Test `tests/observatoire-base.spec.ts`

**Interfaces :** Consumes les tables de la tâche 1 ; le motif de `base.ts:96-97` (`db.query`, `db.execute`).
Produces `export function baseObservatoire(db: PluginContext["db"], ns: string)` qui renvoie : `projetParSlug`,
`creerProjet`, `ajouterAlias`, `listerAlias`, `sourcesDuProjet`, `enregistrerCollecte(companyId, sourceId, r: ResultatCollecte)`
(nouvel instantané seulement si `nouveau` ; `inchange` met à jour `controle_le` ; `echec` incrémente
`echecs_consecutifs`, `quota` ne l'incrémente pas ; FR-032 : `en_echec` à 5), `enregistrerVersions`,
`inserer/listerAffirmations`, `inserer/listerPreuves`, `instantane(companyId, id)`, `inserer/lireRevision`,
`insererPublication`. Toutes paramétrées et filtrées par `company_id`.

- [ ] Tests (faux `db` qui enregistre SQL et paramètres, modèle `tests/services-experiences.spec.ts`) : chaque requête
  contient `company_id = $1` ; `enregistrerCollecte inchangé n'insère pas d'instantané` ; `5e échec → en_echec` ;
  `quota n'incrémente pas les échecs`.
- [ ] ÉCHEC → implémenter → PASS → commit `feat(observatoire): dépôt SQL du module`.

### Task 7 : affirmations et preuves K6

**Files :** Create `plugin-atelier/src/serveur/observatoire/affirmations.ts` ; Test `tests/observatoire-affirmations.spec.ts`

**Interfaces :** Consumes `Affirmation`, `PreuveObservatoire` (`src/contrats/observatoire.ts:50,67`), `extraitPresent`.
Produces `export function validerAffirmation(a: unknown): Affirmation` (FR-012, FR-029 : motif de confiance non vide)
et `export function validerPreuve(p: unknown, instantane: { texteNormalise: string } | null): PreuveObservatoire`
(FR-003 ; refuse un extrait absent dès l'enregistrement, même règle qu'OBS-02).

- [ ] Tests : `refuse un statut hors des 8` ; `refuse un motif de confiance vide` ; `refuse une preuve sans
  instantané ni essai` ; `refuse un extrait absent de l'instantané` ; `accepte la version 6.8.0 avec son extrait`.
- [ ] ÉCHEC → implémenter → PASS → commit `feat(observatoire): affirmations et preuves validées`.

### Task 8 : règles OBS-01 à OBS-16

**Files :** Create `plugin-atelier/src/serveur/observatoire/regles-porte-obs.ts` ; Test `tests/observatoire-regles-porte.spec.ts`
(+ `tests/fixtures/observatoire/corpus-piege.ts` et `corpus-propre.ts`)

**Interfaces :** Produces `export type EntreesPorteObs = { revision: { id; langue: "fr" | "en"; empreinte; baseRevisionFr: { id; empreinteActuelle; empreinteTraduite } | null; texte: string }; affirmations: Affirmation[]; preuves: PreuveObservatoire[]; instantanes: Map<string, { texteNormalise: string; sourceId: string }>; sources: Set<string>; versionsConnues: Set<string>; essais: Map<string, unknown>; sourcesRefusees: Set<string> }`
et `export function reglesObservatoire(e: EntreesPorteObs): MotifPorte[]` (forme `motif(code, message, extra)` de
`porte.ts:132`), une fonction par règle, condition et message recopiés de `regles-porte.md` l. 59-215.

- [ ] Tests : pour CHAQUE règle OBS-01 à OBS-16, les deux tests nommés dans `regles-porte.md` (refus et
  acceptation) ; `corpus piégé → 16 codes distincts` ; `corpus propre → aucun motif` (SC-002).
- [ ] ÉCHEC → implémenter → PASS → commit `feat(observatoire): règles OBS-01 à OBS-16`.
- Si le lot dépasse 30 min : couper en 8a (OBS-01 à 08) et 8b (OBS-09 à 16), deux commits.

### Task 9 : branchement de la porte par service

**Prérequis (R1, R2) :** la tâche OBS est sous porte (`portes` existe) ; les entrées OBS sont lues depuis le livrable
natif (identifiants d'affirmations cités dans le corps, forme `#a-<id>`) et le dépôt de la tâche 6.

**Files :** Modify `plugin-atelier/src/serveur/porte.ts:62-105` (entrée facultative `observatoire?: EntreesPorteObs`)
et `:125` (`obs_traduction_base_perimee` dans `MOTIFS_SANS_CYCLE`) ; Modify `plugin-atelier/src/serveur/services.ts:440-470`
(si `serviceDeEntreprise(companyId) === SERVICE_OBSERVATOIRE`, construire `observatoire` depuis `baseObservatoire`) ;
Test `tests/porte.spec.ts` (ajouts) et `tests/observatoire-porte-branchement.spec.ts`

**Interfaces :** Consumes `reglesObservatoire`, `exigerObservatoire`/`SERVICE_OBSERVATOIRE`. `evaluerPorte` ajoute
les motifs OBS quand `observatoire` est fourni, et seulement alors (FR-030). PASS frais = empreinte actuelle de la
révision (FR-031, mécanisme existant de fraîcheur).

- [ ] Tests : Review Focus 4 (`entreprise marketing : motifs identiques avant/après`) ; `entreprise observatoire :
  OBS-03 refuse` ; `OBS-08 ne consomme pas de cycle`.
- [ ] ÉCHEC → implémenter → PASS ; puis `npx vitest run tests/porte tests/decision-porte tests/agent-porte` → PASS.
- [ ] Commit `feat(observatoire): porte de l'Observatoire branchée par service`.

### Task 10 : routes du module et assemblage de la fiche

**Files :** Create `plugin-atelier/src/serveur/observatoire/routes-observatoire.ts` et `fiche.ts` ; Modify
`src/contrats/routes.ts` (nouvelles entrées de `ROUTES_API`) et l'endroit où les gestionnaires de routes sont
assemblés (modèle `routesDepartements`, `services-departements.ts:44`) ; Test `tests/observatoire-routes.spec.ts`, `tests/observatoire-fiche.spec.ts`

**Interfaces :** Routes (R3, toutes passent par `exigerObservatoire`) : `obs.projet.declarer` `POST /obs/projets`
(board seulement ; crée le projet, ses alias et sa campagne technique R1), `tache.obs.collecter` `POST
/taches/:issueId/obs/collecter {slug}`, `tache.obs.affirmer` `POST /taches/:issueId/obs/affirmations {affirmation,
preuves[]}`, `tache.obs.fiche` `POST /taches/:issueId/obs/fiche {slug, langue}` (écrit le livrable natif, R2),
`obs.publications.aexporter` `GET /obs/publications/a-exporter` et `obs.publications.marquer` `POST /obs/publications`
(board seulement, pour le script de la tâche 11). À l'approbation humaine native, la révision approuvée est copiée
dans `obs_revisions` (R2). `export function assemblerFiche(projet, affirmations, versions): Fiche` (25 champs ;
champ sans affirmation → `valeur: null, statut: null` affiché « inconnu » ; affirmation `non_verifie` → « non
vérifié », FR-026 ; `derniereVersion` = `derniereStable`).

- [ ] Tests : `action refusée hors observatoire` ; `fiche REA : 25 champs, aucun champ rempli sans affirmation` ;
  `inconnu et non vérifié distincts` ; `dernière version ignore la préliminaire`.
- [ ] ÉCHEC → implémenter → PASS → `npm run typecheck` → 0 erreur → commit `feat(observatoire): actions et fiche`.

### Task 11 : export vers le dépôt de contenu

**Files :** Create `scripts/exporter-observatoire.py` ; Test `scripts/tests/tester-exporter-observatoire.py`

**Interfaces :** `exporter(revision: dict, depot: Path) -> str | None` (renvoie le hash du commit ou `None` si rien
n'a changé) ; écrit `{fr,en}/projets/<slug>/fiche.md` avec frontmatter (`projet`, `revision`, `langue`,
`base_revision_fr`, `verifie_le`, `statut`, `sources`, `affirmations`) et une ancre `#a-<id>` par affirmation ;
refuse une révision non `approuvee` (FR-024), un dépôt avec modifications locales (FR-036), et lance `gitleaks
protect --staged` avant le commit. Lecture des révisions par l'API du plugin (route existante ou action de la tâche 10).

- [ ] Tests (dépôt git temporaire) : Review Focus 5 (réexport identique → `None`, dépôt sale → refus) ; `révision
  non approuvée → refus` ; `« inconnu » reste « inconnu » dans le Markdown`.
- [ ] ÉCHEC → implémenter → PASS → commit `feat(observatoire): export Markdown vers le dépôt de contenu`.

### Task 12 : déploiement sur 3100 et fiche REA (arrêt : accord de l'opérateur)

Pas de code. Étapes : migration 023 et module répétés d'abord sur l'instance d'essai (`scripts/instance-essai.sh`) :
le SQL réel n'est exécuté par aucun test unitaire (les tests lisent le texte et un faux `db`) ; suite complète une fois (`cd plugin-atelier && npm test && npm run typecheck` ;
`scripts/tests/` ; bootstrap) → revue unique `ce-code-review` (sans Codex) puis revue `securite` sur le diff cumulé →
**accord explicite de l'opérateur** → sauvegarde vérifiée, photo avant, essai à blanc, mise à jour du plugin → activation des
agents de FR-018 → le directeur lance la fiche REA → porte, relecture, approbation de l'opérateur → export → photo après
(28 autres services inchangés, SC-004) → relevé du coût par agent (SC-006) → `scripts/publier.sh` → rapport Notion.

### Tâches 13 à 18 : demande de l'opérateur du 27/10/2026 (nuit)

Demande : « terminer 100 % du site ; utiliser le département avec Claude pour récolter les informations manquantes ;
10 articles complets, niveau TFE ; améliorer les agents OBS au niveau expert ». Accord de l'opérateur (question du 27/10) pour
la tâche 12 cette nuit, avec garde-fous. Exécution : 3 agents au plus, Ponytail (diff minimal, jamais au détriment des
tests, des validations ou de la sécurité), TDD, skill `verification` à la fin de chaque lot.

- **Task 13 (fait, ebe64a0 + 26679c6)** : `tache.obs.collecter` et `tache.obs.fiche` renvoient `projetId` et
  `instantaneId` ; route `tache.obs.instantane` (`GET /taches/:issueId/obs/instantanes/:id`, `TEXTE_MAX_CARACTERES`,
  `?debut=`). Tests : `tests/observatoire-routes.spec.ts`, parcours déclarer, collecter, lire, affirmer.
- **Task 14 : articles dans la chaîne.** Clé `article-<numero>-<slug>-<fr|en>` ; `cles.ts` :
  `lireCleObservatoire(cle) -> {type: 'fiche'|'article', slug, numero?, langue} | null`, utilisée par
  `services.ts` et `routes-observatoire.ts` ; porte, `approuvees()`, `a-exporter` et export vers
  `<lang>/magazine/<numero>/<slug>.md`. Tests : clé valide et invalide, OBS-08 sur article EN sans base FR,
  `a-exporter` liste l'article, export au bon chemin, invariant marketing inchangé.
- **Task 15 : consignes expertes des 13 agents OBS** (`organisation/services/observatoire/agents/*/AGENTS.md`) :
  constats agent-native 2, 4, 6, 7, 8, 9 (support réel et clés des documents, « Raisonnement : » dans l'affirmation,
  ajout de source par le directeur, pièges de la porte, ligne `base_revision_fr`, `checkout`) et méthode éditoriale
  (angle, plan, citations, relecture). Contrôle : `scripts/verifier-organisation.py` vert, aucune capacité ajoutée.
- **Task 16 : dossiers de recherche des 10 articles** (`docs/observatoire/briefs/numero-0/`) : faits avec URL,
  date, extrait exact d'au moins 20 caractères, statut de `statuts.ts`.
- **Task 17 : site lit les articles exportés** (collection Astro sur `avenue-observatoire-contenu/<lang>/magazine/`),
  page article générique tirée de `Article.astro`, cartes du numéro 0 reliées aux vrais articles ; les « exemple »
  restants ne disparaissent que remplacés par un article réel.
- **Task 18 : rédaction par le département sur 3100** (après la tâche 12) : tâches confiées au directeur OBS à partir
  des dossiers, rédaction par les agents, porte, relecteur indépendant, approbation de l'opérateur, export, puis traduction.

Ordre : 14 et 15 → suite complète une fois → `ce-code-review` (sans Codex) sur dba8bf4..HEAD → `securite` unique
(avec #13 injections et #14 approbation du rapport de revue) → tâche 12 → 17 → 18.

## Revue d'architecture (gstack-plan-eng-review, 27/10/2026)

Cible : ce plan (spec `specs/001-observatoire-chaine-rea/spec.md`). Choix délégués par l'opérateur (« c'est à toi de guider ») :
réponses recommandées appliquées et listées ici pour relecture. Télémétrie gstack coupée et relecture par Codex
désactivée (règles de l'opérateur).

- **Portée** : 12 tâches, environ 20 fichiers, 1 module neuf ; arrangement d'origine conservé (module isolé, une
  fonction pure par composant), aucune réduction de périmètre. Pas de `/office-hours` : la spec Spec Kit en tient lieu.
- **Constats** (gravité, confiance, preuve) :
  1. P1, 9/10 : la porte n'évalue qu'une tâche déjà sous porte, et `portes.campagne_id` est obligatoire
     (`001_atelier_socle.sql:82`, `services.ts:319-322`). Corrigé par R1 et R2 (tâches 9 et 10).
  2. P1, 9/10 : les agents appellent le plugin par des routes HTTP (`relecteur/AGENTS.md:77-80`), la liste `tools`
     du manifeste ne porte que la fabrique (`manifest.ts:198`). Corrigé par R3 (tâche 10).
  3. P2, 8/10 : deux sources de vérité possibles pour la révision (livrable natif et `obs_revisions`). Tranché par R2.
  4. P2, 8/10 : aucun test n'exécute le SQL réel (les tests de migration lisent le texte, `tests/outils-base.ts`
     simule la base). Ajouté : répétition sur l'instance d'essai en tâche 12.
  5. P3, 7/10 : la tâche 8 (32 tests) dépasse probablement 30 min ; la coupe 8a / 8b est déjà prévue.
- **Tests** : le Review Focus couvre les 5 entrées les plus risquées ; la règle de non-régression est portée par la
  tâche 9 (suites `porte`, `decision-porte`, `agent-porte` relancées).
- **Performance** : un projet, quelques sources, instantanés bornés à 2 Mo (`identifiants.ts:54`) : rien à signaler.
- **Avis extérieur** : non lancé (Codex exclu par l'opérateur ; revue unique de l'ensemble prévue en tâche 12).
- **Réalité** :
  - REALITY: premise-table pass 8 prémisses vérifiées, unverified=1 (application hôte des migrations) manifest.ts:205
  - REALITY: already-done pass aucun code `obs_` existant, git log 6d8e917
  - REALITY: surface-check pass gitleaks 8.30.1 `protect`, `scripts/instance-essai.sh`, route `portes.creer` routes.ts:41
  - REALITY: binding-decisions pass O1-O7, règles de l'opérateur (pas de Codex, pas de worktree) respectées
  - REALITY: numbers pass bornes 2 Mo/10 s/5 redirections identifiants.ts:54-56 [measured: code], coût 0,90 $ [estimated]
  - REALITY: deferred-asks pass aucune issue liée
  - REALITY: pr-count pass travail sur main, publication par scripts/publier.sh

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
| --- | --- | --- | --- | --- | --- |
| Eng Review | plan phase 3 | règle 15 de l'opérateur : revue d'architecture avant exécution | 1 | DONE | 5 (2 P1 corrigés, 2 P2 tranchés, 1 P3 déjà couvert) |

VERDICT : plan prêt à exécuter après corrections R1 à R3.

NO UNRESOLVED DECISIONS
