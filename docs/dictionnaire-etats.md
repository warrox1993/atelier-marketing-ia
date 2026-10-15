# Dictionnaire des états, sorties, revues et approbations

Date : 15/10/2026. Source de vérité : les schémas Zod de `plugin-atelier/src/contrats/` (ce
document les résume ; en cas d'écart, le code fait foi). Contrats d'échange : `docs/contrats.md`.

## 1. Trois états distincts, jamais confondus

| Objet | Où il vit | Qui le change |
| --- | --- | --- |
| État de la **tâche** | statut natif Paperclip (`backlog`, `todo`, `in_progress`, `in_review`, `blocked`, `done`, `cancelled`) + `executionState` | le moteur Paperclip (agents, board, politiques d'exécution, gardes P1 et P2) |
| État du **livrable** | révisions du document natif `livrable` de la tâche | le producteur (ou l'humain, levier « version corrigée ») ; chaque révision périme les évaluations et invalide les décisions antérieures |
| État de la **diffusion** | table `diffusions` du plugin | seulement une demande couverte par une décision humaine valide |

## 2. Statut fonctionnel d'une tâche (cahier §10)

Calculé à la lecture depuis l'état natif (`calculerStatutFonctionnel`, `statuts.ts`), jamais
copié en base.

| Statut | Libellé affiché | Condition native |
| --- | --- | --- |
| `queued` | En file | `backlog`, ou `todo` non affectée |
| `ready` | Prête | `todo` affectée sans bloqueur, ou `in_progress` sans run actif |
| `running` | En cours d'exécution | run natif actif sur la tâche |
| `awaiting_review` | En revue | `in_review`, étape `review` |
| `changes_requested` | Corrections demandées | `in_progress` et `executionState.status = changes_requested` |
| `blocked_information` | Décision humaine requise | `blocked` sans bloqueur ni pause budget, ou escalade humaine d'une revue (dont les cycles épuisés) |
| `blocked_dependency` | Bloquée par une dépendance | bloqueurs natifs non résolus |
| `blocked_budget` | Bloquée par le budget | agent assigné en pause pour budget |
| `ready_for_human` | Prête pour validation humaine | `in_review`, étape `approval` : porte franchie, revérifiée par P2 |
| `approved` | Approuvée par l'humain | `done` d'une tâche sous porte (P2 a exigé la porte) |
| `completed` | Terminée | `done` hors porte |
| `failed` | Échec | dernier run en échec, tâche non terminée |
| `cancelled` | Annulée | `cancelled` (dont le rejet humain, section 6) |

## 3. Exigences et couverture (cahier §7)

- Exigence : code stable `REQ-001`, texte d'origine, interprétation, obligatoire, critères,
  dépendances, éléments attendus, exclusion (`aucune`, `demandee`, `autorisee`, `refusee` ;
  seul un humain autorise ou refuse).
- Couverture déclarée par le producteur, par révision : `non_traite`, `partiel`, `couvert`,
  `bloque` (question précise obligatoire), `na_justifie`. Chaque preuve porte la révision,
  l'emplacement, l'élément et un extrait que le serveur retrouve DANS le livrable.

## 4. Revues (cahier §8)

- Verdict : `PASS`, `CHANGES_REQUESTED` (constat nouveau ou constat bloquant encore ouvert du
  même rôle), `BLOCKED_INFORMATION`, `NOT_APPLICABLE_JUSTIFIED` (justification obligatoire).
  Rôles : `exigences`, `metier`, `technique` ; le producteur ne relit jamais son livrable.
- Constat : `findingId`, relecteur, révision, exigences, catégorie (`exigence_manquante`,
  `preuve_absente`, `affirmation_non_sourcee`, `offre_non_confirmee`, `promesse_excessive`,
  `lien_defectueux`, `page_erreur`, `incoherence_canaux`, `marque`, `technique`,
  `juridique_a_verifier`, `autre`), gravité (`critique` et `majeure` sont bloquantes,
  `mineure`, `info`), emplacement, description, preuve, correction attendue, résolution
  (`ouvert`, `resolu`, `rejete`, `accepte_par_humain`). La valeur `accepte_par_humain` existe
  dans le schéma mais **aucune action ne la pose** : un défaut bloquant n'est jamais accepté.

## 5. Porte déterministe et cycles de correction

- Décision de la porte : `PASS`, `REFUS`, `BLOQUE_INFORMATION`, avec motifs codés
  (`livrable_absent`, `exigence_obligatoire_non_couverte`, `element_attendu_sans_preuve`,
  `preuve_sur_autre_revision`, `revue_requise_absente`, `revue_sur_ancienne_version`,
  `revue_non_reussie`, `constat_bloquant_ouvert`, `information_manquante`, `cycles_epuises`,
  `donnee_demo_sans_mention`, `donnee_demo_campagne_reelle` (v1.4, section 12)…), avec, quand c'est
  localisable, l'emplacement (`section « … », ligne N`) et la source en cause,
  empreinte SHA-256 des entrées et horodatage de fraîcheur. Une évaluation est périmée dès
  qu'une entrée change.
- Cycle consommé : une révision distincte refusée (verdict `CHANGES_REQUESTED` ou porte
  `REFUS`). Maximum de départ : le plus petit du réglage de l'entreprise et de la porte
  (3 par défaut). **Cycles épuisés** : révisions refusées ≥ maximum effectif. Alors : plus de
  nouvelles revues, escalade explicite (`blocked`, statut « décision humaine requise »).
- **Relance de correction** (décision de l'opérateur du 15/10/2026), action `atelier.correction.relancer`,
  réservée à l'humain (refusée à un agent par le pont ET par le service) : commentaire
  obligatoire et au moins un levier :
  `information` (réponse enregistrée comme source de provenance `humaine`),
  `consigne` (transmise au producteur en plus des constats),
  `escalade` (palier suivant de l'escalier medium → high → xhigh → max, puis modèle au-dessus
  avec effort medium ; appliqué par l'API native de l'agent puis vérifié par le serveur),
  `version_corrigee` (révision écrite par l'humain dans le document natif, puis vérifiée : courante, auteur humain, jamais refusée).
  Effet : maximum effectif = cycles consommés + maximum de départ ; tâche renvoyée au
  producteur (`todo`, réveil natif) ; la version suivante repasse **toutes** les revues et la
  porte. Tracé : table `relances_correction`, événement `correction.relancee`, commentaire
  natif, dossier et chronologie. Il n'existe aucune option « accepter malgré les défauts » ;
  l'ancienne action `atelier.porte.lever` (qui désactivait la porte, donc P2) est retirée.
  Changer un critère reste une opération séparée tracée (exigence modifiée, exclusion).

## 6. Décision humaine et approbation (cahier §9)

- Action : `approuver` (exige une porte `PASS` fraîche sur la révision visée), `demander_correction`,
  `rejeter` ; commentaire obligatoire ; acteur : humain authentifié seulement.
- Portée d'une approbation : révision, action (`aucune_action_externe`, `publier`, `envoyer`,
  `programmer`, `activer_campagne_payante`), canal, compte, audience, montant maximal, durée.
  Une nouvelle révision invalide la décision (`invalidee: true`).
- **Dépense publicitaire** : l'approbation `activer_campagne_payante` doit viser un montant maximal,
  un canal et une durée précis, avec ou sans plafond (section 11). Le montant approuvé est un total
  pour toutes les diffusions de cette décision.
- Effet natif : `approuver` puis `PATCH /api/issues/:id { status: "done" }` par le board (P2
  revérifie) ; `demander_correction` puis `PATCH { status: "in_progress" }` ; **`rejeter` :
  le worker annule la tâche native (`cancelled`) AVANT d'enregistrer la décision, puis
  ajoute le commentaire** (besoin B-2) : jamais de rejet enregistré sans transition.

## 7. Diffusion

`refusee` (aucune décision couvrante ; en campagne réelle, aussi toute tâche qui porte une donnée de
démonstration, section 12), `simulee` (démonstration, rien n'est envoyé),
`preparee` (réel, aucun connecteur : rien n'est envoyé), `confirmee` (réservé à un futur
connecteur), `ambigue_a_reconcilier`. Clé d'idempotence unique par entreprise : une même
demande ne produit qu'un effet. Interface : bouton « Diffuser » visible ; désactivé en réel
avec la raison « aucun connecteur de publication » ; en démonstration, actif seulement après
une approbation qui autorise une action externe sur la révision courante.

## 8. Messages typés (cahier §6)

Types : `demande_information`, `reponse`, `contrat_propose`, `contrat_accepte`,
`dependance_modifiee`, `constat_revue`, `correction_demandee`, `blocage`, `decision`,
`resultat`. Traitement : `recu`, `lu`, `traite`, `rejete`. Provenance : `agent`, `humain`,
`systeme`. Un message ne transporte ni approbation, ni droit, ni identité (clés interdites).

## 9. Sources, imports, connexions

- Source : statut d'accès (`accessible`, `page_erreur`, `inaccessible`, `bloquee_ssrf`,
  `type_refuse`, `trop_volumineuse`, `delai_depasse`, `erreur`), provenance (`lecture_url`,
  `import`, `corpus_demonstration`, `humaine`, `connexion` en v1.4), mode (`demonstration` ou
  `reel`, jamais déclaré par l'agent), toujours `nonFiable: true` (donnée, jamais
  instruction), injections signalées.
- Import : `texte`, `markdown`, `csv` ; 512 Kio au plus (contrôlé avant lecture dans
  l'interface et par le worker).
- État d'une connexion ou d'un agent (6 états) : `demonstration`, `reel_teste`,
  `configure_non_verifie`, `non_connecte`, `indisponible`, `erreur`. Niveau d'intégration :
  `implemente_teste`, `implemente_non_teste`, `contrat_seulement`, `non_implemente`.

## 10. Calendrier

`brouillon`, `en_revue`, `approuve`, `planifie` (diffusion préparée), `publie` (diffusion
confirmée). La date proposée (intention, fuseau Europe/Brussels) n'est jamais une
programmation réelle (`publicationProgrammee` reste `null` sans connecteur).

## 11. Plafonds de dépenses choisis par le client (v1.3)

- **Plafond publicitaire** (entreprise et campagne) : `null` (aucun choix), `montant` (centimes > 0) ou
  `aucune_limite`, avec `decidePar` et `decideLe`. Seul un humain le choisit ; un agent est refusé
  (`elevation_refusee`). « Aucune limite » est une décision explicite, tracée (journal `plafond.modifie`,
  chronologie de la tâche de brief, activité native) ; elle ne dispense jamais d'approbation.
- **Engagé** = dépensé (diffusions simulées, préparées, confirmées ou ambiguës) + réservé (reste des
  approbations valides). Affiché face à la limite : « X engagés sur Y » ou « sans limite » ; « aucun
  plafond choisi » si aucun choix.
- Refus : `aucun_choix`, `plafond_campagne`, `plafond_entreprise` (approbation : erreur `conflit` ;
  diffusion : état `refusee` avec le motif).
- **Coûts IA** : budgets natifs Paperclip ; 0 = aucune limite ; changement journalisé `budget_ia.modifie`.

## 12. Données simulées (v1.4, lot L9)

- **Source de connexion** : réponse brute d'un outil de la passerelle déposée par un agent
  (`tache.donnees.deposer`). Mode **déduit** par le serveur : `demonstration` au moindre indice
  (enveloppe `_atelier.mode = demonstration`, mention en tête, identifiants fictifs connus,
  enveloppes en désaccord), sinon `reel` ; sans enveloppe `_atelier` : refus. Le détail garde les
  indices, le nombre de chiffres retenus et le mode effectif de la campagne au dépôt.
- **Mode effectif** d'une tâche : `reel` si la campagne est réelle ou si l'entreprise est réglée en
  mode réel ; sinon `demonstration`.
- **Porte** : `donnee_demo_sans_mention` (démonstration : un chiffre, une source ou une preuve tirés
  d'une connexion de démonstration, sans « démonstration » dans le même paragraphe, liste ou tableau
  ni dans un titre qui le couvre ; ou aucune mention dans tout le livrable) ;
  `donnee_demo_campagne_reelle` (réel : toute donnée de démonstration rattachée à la tâche, même
  étiquetée). Les deux sont des `REFUS` et consomment un cycle.
- **Diffusion réelle** refusée dans le second cas. Journal : `donnees.deposees`,
  `donnees.demo_campagne_reelle`, `donnees.refusees`.
