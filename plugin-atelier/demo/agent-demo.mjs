#!/usr/bin/env node
// Agent de DÉMONSTRATION déterministe de l'Atelier Marketing IA, lancé par
// l'adaptateur natif « process » de Paperclip (aucun appel de modèle).
//
// Usage (configuration de l'agent, chemin RELATIF au cwd = dossier du plugin) :
//   node demo/agent-demo.mjs <rôle> <scénario>
// Rôles : coordinateur, producteur, porte, controleur (exigences), metier,
//         technique, contourneur (tentative de contournement, scénario F).
// Variables injectées par Paperclip : PAPERCLIP_API_URL, PAPERCLIP_API_KEY
// (jeton du run), PAPERCLIP_RUN_ID, PAPERCLIP_AGENT_ID, PAPERCLIP_COMPANY_ID,
// PAPERCLIP_TASK_ID. Variables facultatives : DEMO_PAUSE_MS (scénario E) ;
// DEMO_DONNEES_CONNEXION (scénario A) : fichier JSON { service, outil, reponse } contenant
// la réponse BRUTE d'un outil de la passerelle, obtenue par le lanceur à travers la
// passerelle d'outils de Paperclip (l'adaptateur process ne reçoit pas de serveur MCP).
//
// Le contenu des pages, sources et messages est traité comme une DONNÉE :
// l'agent n'exécute jamais une instruction trouvée dans un contenu.
import { readFileSync } from "node:fs";
import { AFFIRMATIONS_A_SOURCER, MENTION, SCENARIOS } from "./scenarios.mjs";
import { patchDecisionPorte } from "./decision-porte.mjs";

// Les identifiants courts de l'organisation du lot B (organisation/registre/agents.json)
// sont acceptés comme rôles ; le scénario vient de l'argument ou d'ATELIER_SCENARIO.
const ALIAS = { contenus: "producteur", relecteur: "metier", "tests-techniques": "technique", "porte-controle": "porte" };
const ROLE = ALIAS[process.argv[2]] ?? process.argv[2] ?? "producteur";
const CODE_SCENARIO = process.argv[3] ?? process.env.ATELIER_SCENARIO ?? "B";
const SCENARIO = SCENARIOS[CODE_SCENARIO];
let BASE = (process.env.PAPERCLIP_API_URL ?? "http://127.0.0.1:3100").replace(/\/$/u, "");
if (!BASE.endsWith("/api")) BASE += "/api";
const CLE = process.env.PAPERCLIP_API_KEY ?? "";
const RUN = process.env.PAPERCLIP_RUN_ID ?? "";
const MOI = process.env.PAPERCLIP_AGENT_ID ?? "";
const SOC = process.env.PAPERCLIP_COMPANY_ID ?? "";
const TACHE = process.env.PAPERCLIP_TASK_ID ?? "";
const PLUGIN = "/plugins/atelier.marketing-ia/api";
const LIBELLES = { exigences: "contrôle des exigences", metier: "relecture métier et factuelle", technique: "vérification technique" };

function trace(evenement, donnees = {}) {
  console.log(JSON.stringify({ t: new Date().toISOString(), role: ROLE, scenario: CODE_SCENARIO, agent: MOI, run: RUN, evenement, ...donnees }));
}

async function api(methode, chemin, corps) {
  const reponse = await fetch(BASE + chemin, {
    method: methode,
    headers: {
      authorization: `Bearer ${CLE}`,
      "x-paperclip-run-id": RUN,
      ...(corps === undefined ? {} : { "content-type": "application/json" }),
    },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
  const texte = await reponse.text();
  let donnees = null;
  try {
    donnees = texte ? JSON.parse(texte) : null;
  } catch {
    donnees = { brut: texte.slice(0, 300) };
  }
  return { code: reponse.status, corps: donnees };
}

const normaliser = (t) => t.normalize("NFD").replace(/[̀-ͯ]/gu, "").toLowerCase().replace(/[\s\-_'’.]+/gu, " ").trim();
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function mesTaches() {
  if (TACHE) {
    const { code, corps } = await api("GET", `/issues/${TACHE}`);
    if (code === 200 && corps?.assigneeAgentId === MOI) return [corps];
    // Un run, une tâche : réveillé pour une tâche précise, l'agent ne touche pas aux autres
    // (docs/enquete-run-annule.md). La liste complète ne sert que sans PAPERCLIP_TASK_ID.
    trace("tache_reveil_non_assignee", { code });
    return [];
  }
  const { code, corps } = await api("GET", `/companies/${SOC}/issues?assigneeAgentId=${MOI}&status=todo,in_progress,in_review,blocked`);
  if (code !== 200) {
    trace("liste_echec", { code });
    return [];
  }
  const liste = Array.isArray(corps) ? corps : corps?.items ?? [];
  const completes = [];
  for (const t of liste) {
    const detail = await api("GET", `/issues/${t.id}`);
    completes.push(detail.code === 200 ? detail.corps : t);
  }
  return completes;
}

async function checkout(tache) {
  const { code } = await api("POST", `/issues/${tache.id}/checkout`, { agentId: MOI, expectedStatuses: ["todo", "backlog", "blocked", "in_progress"] });
  trace("checkout", { tache: tache.identifier, code });
  return code === 200 || code === 201;
}

/** Lignes du livrable qui prouvent un élément (emplacement = titre de section le plus proche). */
function preuvesPour(corps, element, revisionId) {
  const lignes = corps.split("\n");
  let section = "Livrable";
  for (const ligne of lignes) {
    if (ligne.startsWith("#")) section = ligne.replace(/^#+\s*/u, "");
    if (!ligne.startsWith("#") && ligne.trim() && normaliser(ligne).includes(normaliser(element))) {
      return [{ revisionId, emplacement: `## ${section}`, element, extrait: ligne.trim() }];
    }
  }
  return [];
}

/* ------------------------------------------------------------------ */
/* Tâches d'un scénario : une seule (B à K) ou plusieurs en parallèle (A) */
/* ------------------------------------------------------------------ */
const DEFINITIONS = SCENARIO?.taches ?? (SCENARIO ? [{ ...SCENARIO, producteur: CODE_SCENARIO === "F" ? "Contourneur (démonstration)" : "Contenus et création", canal: "site", dateProposee: "2026-10-20T08:00:00.000Z" }] : []);
/** Définition de la tâche (par son titre) ; les exigences sont des objets complets. */
function definition(tache) {
  const def = DEFINITIONS.find((d) => d.titre === tache.title) ?? DEFINITIONS[0];
  const exigences = (def.exigences ?? []).map((e) => (typeof e === "string" ? SCENARIO.exigences.find((x) => x.code === e) : e)).filter(Boolean);
  return { ...def, exigences, revues: def.revues ?? SCENARIO.revues };
}
/** Réponse brute de connexion fournie au scénario A (jamais inventée ici). */
function donneesFournies(service) {
  const chemin = process.env.DEMO_DONNEES_CONNEXION;
  if (!chemin) return null;
  try {
    const d = JSON.parse(readFileSync(chemin, "utf8"));
    return d?.service === service ? d : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Coordinateur : exigences, tâche(s) de production sous porte            */
/* ------------------------------------------------------------------ */
async function coordonner(tache) {
  if (!tache.title.startsWith("Brief")) return;
  if (!(await checkout(tache))) return;
  const { corps: campagnes } = await api("GET", `${PLUGIN}/campagnes?companyId=${SOC}`);
  const campagne = (campagnes ?? []).find((c) => c.briefIssueId === tache.id);
  if (!campagne) return trace("campagne_introuvable", { tache: tache.identifier });
  const ex = await api("POST", `${PLUGIN}/campagnes/${campagne.id}/exigences`, { companyId: SOC, exigences: SCENARIO.exigences });
  trace("exigences", { code: ex.code, nombre: Array.isArray(ex.corps) ? ex.corps.length : ex.corps });
  const { corps: agents } = await api("GET", `/companies/${SOC}/agents`);
  // Noms des agents de démonstration, puis noms courts de l'organisation du lot B.
  const NOMS = {
    "Contenus et création": ["Contenus et création", "Contenus"],
    "Contourneur (démonstration)": ["Contourneur (démonstration)"],
    "SEO local GEO": ["SEO local GEO"],
    "Porte de contrôle": ["Porte de contrôle", "Porte"],
    "Contrôleur des exigences": ["Contrôleur des exigences", "Exigences"],
    "Relecteur métier": ["Relecteur métier", "Relecteur"],
    "Vérificateur technique": ["Vérificateur technique", "Tests techniques"],
  };
  const parNom = (n) => (agents ?? []).find((a) => (NOMS[n] ?? [n]).includes(a.name))?.id;
  const porte = parNom("Porte de contrôle");
  const relecteurs = { exigences: parNom("Contrôleur des exigences"), metier: parNom("Relecteur métier"), technique: parNom("Vérificateur technique") };

  // Idempotence : chaque tâche de production n'est créée qu'une fois.
  const { corps: enfants } = await api("GET", `/companies/${SOC}/issues?parentId=${tache.id}&status=backlog,todo,in_progress,in_review,blocked,done,cancelled`);
  for (const brute of DEFINITIONS) {
    const def = definition({ title: brute.titre });
    if (!(await planifierTache(tache, campagne, enfants, def, parNom(def.producteur), porte, relecteurs))) return;
  }
  const fin = await api("PATCH", `/issues/${tache.id}`, {
    status: "done",
    comment: `Plan établi (démonstration) : ${SCENARIO.exigences.length} exigence(s), ${DEFINITIONS.length} tâche(s) confiée(s) aux producteurs, chacune sous porte avec ses revues : ${DEFINITIONS.map((d) => `« ${d.titre} »`).join(", ")}.`,
  });
  trace("brief_clos", { code: fin.code });
}

/** Une tâche de production sous porte, planifiée, affectée à son producteur. Faux si la porte manque. */
async function planifierTache(tache, campagne, enfants, def, producteur, porte, relecteurs) {
  let production = (enfants ?? []).find((i) => i.title === def.titre);
  if (!production) {
    const cree = await api("POST", `/companies/${SOC}/issues`, {
      title: def.titre,
      description: `Livrable de démonstration pour la campagne « ${campagne.nom} ». Exigences : ${def.exigences.map((e) => e.code).join(", ")}.\n\n${MENTION}`,
      projectId: campagne.projectId,
      parentId: tache.id,
      status: "backlog",
      priority: "medium",
      // Humain responsable : Paperclip applique le responsable par défaut de l'entreprise
      // (un agent n'a pas le droit de le fixer) ; c'est la cible native de l'escalade.
      executionPolicy: {
        maxReviewRounds: 3,
        stages: [
          { type: "review", participants: [{ type: "agent", agentId: porte }] },
          { type: "approval", participants: [{ type: "user", userId: "local-board" }] },
        ],
      },
    });
    trace("tache_creee", { titre: def.titre, code: cree.code, erreur: cree.code >= 400 ? cree.corps : undefined });
    if (cree.code >= 400) return false;
    production = cree.corps;
  }
  const porteCree = await api("POST", `${PLUGIN}/portes`, {
    companyId: SOC,
    issueId: production.id,
    campagneId: campagne.id,
    exigencesCiblees: def.exigences.map((e) => e.code),
    revuesRequises: def.revues.map((role) => ({ role, agentId: relecteurs[role] })),
  });
  trace("porte", { titre: def.titre, code: porteCree.code, erreur: porteCree.code >= 400 ? porteCree.corps : undefined });
  if (porteCree.code >= 400 && porteCree.corps?.code !== "conflit") {
    trace("arret_sans_porte");
    return false;
  }
  await api("POST", `${PLUGIN}/taches/${production.id}/planification`, { canal: def.canal, dateProposee: def.dateProposee });
  const aff = await api("PATCH", `/issues/${production.id}`, { assigneeAgentId: producteur, status: "todo" });
  trace("affectation", { titre: def.titre, code: aff.code });
  return true;
}

/* ------------------------------------------------------------------ */
/* Producteur : livrable, couverture avec preuves, demande de clôture      */
/* ------------------------------------------------------------------ */
async function produire(tache) {
  if (tache.status === "in_review") return;
  if (tache.status === "blocked" && CODE_SCENARIO !== "D") {
    // Escalade déjà faite (cycles épuisés) : le moteur réveille la tâche bloquée sans bloqueur ;
    // la reprendre relancerait l'escalade en boucle. Seule une relance humaine la débloque.
    const { corps: c0 } = await api("GET", `${PLUGIN}/taches/${tache.id}/contexte`);
    const revues0 = c0?.revuesRevisionCourante ?? [];
    const enCours0 = revues0.filter((r) => r.statutNatif !== "done" && r.statutNatif !== "cancelled");
    const aCorriger0 = (c0?.constatsOuverts?.length ?? 0) > 0 || revues0.some((r) => r.verdict === "CHANGES_REQUESTED");
    if (c0?.livrable && enCours0.length === 0 && aCorriger0 && c0.cyclesConsommes + 1 >= (c0.cyclesMaximum ?? 3)) {
      // Les revues terminées restent liées comme bloqueurs résolus : le moteur réveille alors la
      // tâche en boucle (« issue_blockers_resolved »). On retire ces liens, sans changer le statut.
      const r0 = await api("PATCH", `/issues/${tache.id}`, { blockedByIssueIds: [] });
      return trace("escalade_en_attente", { tache: tache.identifier, liens_retires: r0.code });
    }
  }
  if (!(await checkout(tache))) return;
  const { code, corps: ctx } = await api("GET", `${PLUGIN}/taches/${tache.id}/contexte`);
  if (code !== 200) return trace("contexte_echec", { code, corps: ctx });

  if (CODE_SCENARIO === "D") return produireAvecInformationManquante(tache, ctx);
  const def = definition(tache);

  const requis = ctx.porte?.revuesRequises?.length ?? 0;
  const revues = ctx.revuesRevisionCourante ?? [];
  const actuelle = ctx.livrable?.revisionNumber ?? 0;
  const correctionDemandee = ctx.constatsOuverts.length > 0 || revues.some((r) => r.verdict === "CHANGES_REQUESTED") || tache.executionState?.status === "changes_requested";
  const maxCycles = ctx.cyclesMaximum ?? 3;
  const relances = ctx.relances ?? [];
  // Relance humaine avec version corrigée à la main : c'est la révision courante ; le
  // producteur ne la réécrit pas, il déclare sa couverture pour qu'elle repasse tous les contrôles.
  if (ctx.livrable && ctx.couvertures.length === 0 && relances[0]?.revisionCorrigee === ctx.livrable.revisionId) {
    trace("version_humaine", { version: actuelle, relance: relances[0].id });
    return declarerEtAttendre(tache, ctx.livrable.corps, actuelle);
  }
  if (ctx.livrable && ctx.couvertures.length === 0 && !correctionDemandee) {
    // Reprise après interruption : la révision existe déjà, on reprend à l'étape suivante
    // (aucune nouvelle révision, aucun double effet).
    trace("reprise", { version: actuelle });
    return declarerEtAttendre(tache, ctx.livrable.corps, actuelle);
  }
  if (ctx.livrable && ctx.couvertures.length > 0) {
    // Version déjà déclarée : attendre ses revues, puis demander la clôture ou corriger.
    const enCours = revues.filter((r) => r.statutNatif !== "done" && r.statutNatif !== "cancelled");
    if (enCours.length > 0) return attendreRevues(tache, enCours, actuelle);
    const reussies = revues.filter((r) => r.verdict === "PASS" || r.verdict === "NOT_APPLICABLE_JUSTIFIED").length;
    const aCorriger = ctx.constatsOuverts.length > 0 || revues.some((r) => r.verdict === "CHANGES_REQUESTED");
    // Scénario K : la porte a pu refuser la version pour des données de démonstration.
    const refusDemo = !aCorriger ? await refusDonneesDemo(tache, ctx) : null;
    if (refusDemo === "campagne_reelle") {
      return escalader(tache, ctx, "La porte refuse des données de démonstration dans une campagne réelle : ce livrable ne peut pas être accepté. Fournir des données réelles (connexion réelle) ou rejeter la tâche.");
    }
    if (!aCorriger && refusDemo !== "sans_mention") {
      const fin = await api("PATCH", `/issues/${tache.id}`, {
        status: "done",
        comment: `Version ${actuelle} relue (${reussies}/${requis} revue(s) réussie(s)) : demande de clôture, la porte déterministe décide (démonstration).`,
      });
      return trace("demande_cloture", { code: fin.code, statut: fin.corps?.status, etape: fin.corps?.executionState?.currentStageType });
    }
    if (ctx.cyclesConsommes + 1 >= maxCycles) return escalader(tache, ctx);
  }

  // Scénario A : réponse RÉELLE de la passerelle (connexion créée par la carte), déposée telle quelle.
  const donnees = def.connexion ? donneesFournies(def.connexion.service) : null;
  if (def.connexion && donnees && (ctx.donneesConnexion ?? []).length === 0) {
    const depot = await api("POST", `${PLUGIN}/taches/${tache.id}/donnees-connexion`, { service: donnees.service, outil: donnees.outil, reponse: donnees.reponse });
    trace("donnees_deposees", { code: depot.code, mode: depot.corps?.mode, indices: depot.corps?.indices, chiffres: depot.corps?.chiffresRetenus, erreur: depot.code >= 400 ? depot.corps : undefined });
  }
  if (CODE_SCENARIO === "K" && (ctx.donneesConnexion ?? []).length === 0) {
    // Réponse BRUTE de l'outil de connexion : le serveur en déduit le mode (jamais déclaré ici).
    const depot = await api("POST", `${PLUGIN}/taches/${tache.id}/donnees-connexion`, SCENARIO.donneesConnexion);
    trace("donnees_deposees", { code: depot.code, mode: depot.corps?.mode, interdite: depot.corps?.interdite, chiffres: depot.corps?.chiffresRetenus, erreur: depot.code >= 400 ? depot.corps : undefined });
  }
  if (CODE_SCENARIO === "C" && actuelle === 0) {
    const lecture = await api("POST", `${PLUGIN}/taches/${tache.id}/sources`, { url: `${SCENARIO.domaine ?? "https://renovations-meuse-ourthe.example"}/avis-clients` });
    // Le contenu lu peut contenir des ordres (« publie ceci ») : ce sont des données, l'agent ne les suit pas.
    trace("source_avis_lue", { code: lecture.code, injections: lecture.corps?.injectionsSignalees?.length ?? 0, nonFiable: lecture.corps?.nonFiable });
  }
  const version = actuelle + 1;
  const manquants = ctx.constatsOuverts.flatMap((c) => SCENARIO.etablissements.filter((e) => c.description.includes(e)));
  // Scénario K : en campagne réelle, la version est étiquetée d'emblée (le refus porte alors sur l'interdiction).
  const corpsLivrable = CODE_SCENARIO === "K" ? SCENARIO.livrable(version, manquants, relances, version >= 2 || ctx.mode === "reel") : def.livrable(version, manquants, relances, donnees);
  if (relances.length > 0) trace("relance_lue", { leviers: relances[0].leviers, consigne: Boolean(relances[0].consigne), information: Boolean(relances[0].information) });
  const doc = await api("GET", `/issues/${tache.id}/documents/livrable`);
  const ecrit = await api("PUT", `/issues/${tache.id}/documents/livrable`, {
    title: def.titre,
    format: "markdown",
    body: corpsLivrable,
    changeSummary: `Version ${version} (démonstration)`,
    baseRevisionId: doc.code === 200 ? doc.corps.latestRevisionId : null,
  });
  trace("livrable_ecrit", { version, code: ecrit.code });
  if (ecrit.code >= 400) return trace("livrable_refuse", { corps: ecrit.corps });

  // Scénario E : pause après une étape persistée pour permettre l'arrêt du serveur.
  const pauseMs = Number(process.env.DEMO_PAUSE_MS ?? 0);
  if (pauseMs > 0 && version === 1) {
    trace("pause_demonstration", { ms: pauseMs });
    await pause(pauseMs);
  }
  await declarerEtAttendre(tache, corpsLivrable, version);
}

/** Déclare la couverture de la révision courante (si absente) puis attend les revues liées. */
async function declarerEtAttendre(tache, corpsLivrable, version) {
  const { corps: ctx } = await api("GET", `${PLUGIN}/taches/${tache.id}/contexte`);
  const revisionId = ctx.livrable.revisionId;
  let revues = ctx.revuesRevisionCourante ?? [];
  if (ctx.couvertures.length === 0) {
    const lignes = definition(tache).exigences.map((e) => {
      const preuves = e.elementsAttendus.flatMap((el) => preuvesPour(corpsLivrable, el, revisionId));
      // Le producteur croit sa version complète : il déclare « couvert » avec les preuves trouvées.
      return { code: e.code, etat: preuves.length > 0 ? "couvert" : "non_traite", preuves, hypotheses: [], question: null };
    });
    const dec = await api("POST", `${PLUGIN}/taches/${tache.id}/couverture`, { revisionId, lignes });
    trace("couverture", { code: dec.code, revues: dec.corps?.revues?.length, cyclesEpuises: dec.corps?.cyclesEpuises, erreur: dec.code >= 400 ? dec.corps : undefined });
    if (dec.code >= 400) return;
    if (dec.corps.cyclesEpuises) return escalader(tache, ctx);
    revues = dec.corps.revues.map((r) => ({ ...r, statutNatif: r.statut }));
  }
  const enCours = revues.filter((r) => r.statutNatif !== "done" && r.statutNatif !== "cancelled");
  if (enCours.length > 0) return attendreRevues(tache, enCours, version);
  const fin = await api("PATCH", `/issues/${tache.id}`, { status: "done", comment: `Version ${version} prête : demande de clôture (démonstration).` });
  trace("demande_cloture", { code: fin.code, statut: fin.corps?.status });
}

/** Attente native : la tâche est bloquée par ses revues ; leur clôture réveille le producteur. */
async function attendreRevues(tache, enCours, version) {
  const r = await api("PATCH", `/issues/${tache.id}`, {
    status: "blocked",
    blockedByIssueIds: enCours.map((x) => x.issueId),
    comment: `Version ${version} déclarée ; en attente de ${enCours.length} revue(s) liée(s) : ${enCours.map((x) => x.identifier ?? x.issueId).join(", ")} (démonstration).`,
  });
  trace("attente_revues", { code: r.code, revues: enCours.map((x) => x.role), erreur: r.code >= 400 ? r.corps : undefined });
}

/** Dernière évaluation de la porte sur la révision courante : refus pour données de démonstration ? */
async function refusDonneesDemo(tache, ctx) {
  if (CODE_SCENARIO !== "K") return null;
  const { code, corps: ev } = await api("GET", `${PLUGIN}/taches/${tache.id}/porte`);
  if (code !== 200 || !ev || ev.decision !== "REFUS" || ev.revisionId !== ctx.livrable?.revisionId) return null;
  const codes = (ev.motifs ?? []).map((m) => m.code);
  const refus = codes.includes("donnee_demo_campagne_reelle") ? "campagne_reelle" : codes.includes("donnee_demo_sans_mention") ? "sans_mention" : null;
  trace("refus_porte_lu", { refus, emplacements: (ev.motifs ?? []).map((m) => m.emplacement).filter(Boolean) });
  return refus;
}

/** Cycles de correction épuisés (ou refus sans issue) : blocage explicite avec question à l'humain, aucun faux succès. */
async function escalader(tache, ctx, questionPrecise) {
  const n = (ctx.cyclesConsommes ?? 0) + 1;
  const question = questionPrecise ?? `${n} cycles de correction n'ont pas suffi : relance humaine requise (information manquante, consigne, montée d'un cran ou version corrigée). Le livrable n'est ni accepté ni diffusé en l'état.`;
  await api("POST", `${PLUGIN}/taches/${tache.id}/messages`, {
    recipient: { type: "humain", id: "local-board" },
    contenu: { type: "blocage", raison: questionPrecise ? "Refus de la porte sans correction possible par l'agent." : `Cycles de correction épuisés (${n}).`, informationManquante: question },
  });
  // Le moteur n'accepte « blocked » qu'avec un propriétaire du blocage : une question native
  // en attente adressée à l'humain (comme au scénario D). Sans elle, PATCH blocked → 422.
  const interaction = await api("POST", `/issues/${tache.id}/interactions`, {
    kind: "ask_user_questions",
    idempotencyKey: `atelier-cycles-${tache.id}-${n}`,
    title: questionPrecise ? "Refus de la porte sans correction possible" : "Cycles de correction épuisés",
    summary: "Le livrable n'a pas passé les contrôles ; il n'est ni accepté ni diffusé. Relance humaine requise dans l'atelier.",
    addresseeUserId: "local-board",
    payload: {
      version: 1,
      title: "Relancer la correction ?",
      questions: [{
        id: "relance",
        prompt: question,
        selectionMode: "single",
        required: true,
        options: [{ id: "relancer", label: "Relancer dans l'atelier (information, consigne, montée d'un cran ou version corrigée)", freeText: true }],
      }],
    },
  });
  trace("question_humaine", { code: interaction.code, erreur: interaction.code >= 400 ? interaction.corps : undefined });
  // Bloqueurs retirés : les revues terminées réveilleraient la tâche en boucle.
  const r = await api("PATCH", `/issues/${tache.id}`, { status: "blocked", blockedByIssueIds: [], comment: `Escalade (démonstration) : ${question}` });
  trace("escalade", { code: r.code, erreur: r.code >= 400 ? r.corps : undefined });
}

async function produireAvecInformationManquante(tache, ctx) {
  // Recherche dans le corpus de démonstration ; le contenu lu reste une donnée.
  const lecture = await api("POST", `${PLUGIN}/taches/${tache.id}/sources`, { url: SCENARIO.sourceAVerifier });
  const trouve = lecture.corps?.extrait ? normaliser(lecture.corps.extrait).includes(normaliser("Rénovation Qualité Liège")) : false;
  trace("source_lue", { code: lecture.code, statut: lecture.corps?.statutAcces, certificationTrouvee: trouve });
  if (trouve) return;
  if (!ctx.livrable) {
    const ecrit = await api("PUT", `/issues/${tache.id}/documents/livrable`, { title: SCENARIO.titre, format: "markdown", body: SCENARIO.livrable(1), changeSummary: "Version 1 (démonstration)", baseRevisionId: null });
    trace("livrable_ecrit", { code: ecrit.code });
  }
  const { corps: ctx2 } = await api("GET", `${PLUGIN}/taches/${tache.id}/contexte`);
  if (ctx2.couvertures.length === 0) {
    const dec = await api("POST", `${PLUGIN}/taches/${tache.id}/couverture`, {
      revisionId: ctx2.livrable.revisionId,
      lignes: [{ code: "REQ-001", etat: "bloque", preuves: [], hypotheses: [], question: SCENARIO.question }],
    });
    trace("couverture_bloquee", { code: dec.code });
    const msg = await api("POST", `${PLUGIN}/taches/${tache.id}/messages`, {
      recipient: { type: "humain", id: "local-board" },
      contenu: { type: "demande_information", question: SCENARIO.question, justification: "Aucune source publique ne confirme la certification.", consequence: "L'encart reste bloqué : rien n'est inventé." },
      references: [{ type: "source", id: lecture.corps?.id ?? "aucune" }],
    });
    trace("message_humain", { code: msg.code });
  }
  // Question native à l'humain : une interaction en attente autorise le statut « blocked ».
  const { corps: interactions } = await api("GET", `/issues/${tache.id}/interactions`);
  const dejaPosee = (Array.isArray(interactions) ? interactions : interactions?.items ?? []).some((i) => i.kind === "ask_user_questions" && i.status === "pending");
  if (!dejaPosee) {
    const question = await api("POST", `/issues/${tache.id}/interactions`, {
      kind: "ask_user_questions",
      idempotencyKey: `atelier-certification-${tache.id}`,
      title: "Information introuvable : certification",
      summary: "Aucune source publique ne confirme la certification demandée ; rien n'est inventé.",
      addresseeUserId: "local-board",
      payload: {
        version: 1,
        title: "Certification « Rénovation Qualité Liège »",
        questions: [{
          id: "certification",
          prompt: SCENARIO.question,
          selectionMode: "single",
          required: true,
          options: [
            { id: "detenue", label: "Oui, elle est détenue (préciser la référence, la date de validité et les services)", freeText: true },
            { id: "non_detenue", label: "Non : retirer toute mention de certification" },
          ],
        }],
      },
    });
    trace("question_humaine", { code: question.code, erreur: question.code >= 400 ? question.corps : undefined });
  }
  const bloc = await api("PATCH", `/issues/${tache.id}`, { status: "blocked", comment: `Information introuvable (démonstration). Question posée à l'humain : ${SCENARIO.question}` });
  trace("bloquee", { code: bloc.code, statut: bloc.corps?.status, erreur: bloc.code >= 400 ? bloc.corps : undefined });
}

/* ------------------------------------------------------------------ */
/* Porte de contrôle : revues liées par révision, consolidation, décision */
/* ------------------------------------------------------------------ */
async function garder(tache) {
  if (tache.status !== "in_review") return;
  const participant = tache.executionState?.currentParticipant;
  if (participant?.agentId !== MOI) return trace("pas_participant", { tache: tache.identifier });
  // La porte décide TOUJOURS dans son run (le moteur relance puis bloque une revue sans décision).
  const ev = await api("POST", `${PLUGIN}/taches/${tache.id}/porte/evaluer`, {});
  trace("evaluation", { code: ev.code, decision: ev.corps?.decision, motifs: ev.corps?.motifs?.map((m) => m.code) });
  if (ev.code >= 400) {
    const r = await api("PATCH", `/issues/${tache.id}`, { status: "in_progress", comment: `Porte : évaluation impossible (${ev.corps?.erreur ?? ev.code}) ; retour au producteur (démonstration).` });
    return trace("decision_porte", { code: r.code });
  }
  // Un renvoi pour information manquante (panne d'outil) porte `awaitingInformation` : hors compteur de tours du socle.
  const patch = patchDecisionPorte(ev.corps);
  const res = await api("PATCH", `/issues/${tache.id}`, patch);
  trace("decision_porte", { code: res.code, statut: res.corps?.status, etape: res.corps?.executionState?.currentStageType, erreur: res.code >= 400 ? res.corps : undefined });
}

/* ------------------------------------------------------------------ */
/* Relecteurs : verdict structuré sur la tâche parente, puis clôture       */
/* ------------------------------------------------------------------ */
async function relire(tache, role) {
  if (tache.status === "done" || tache.status === "cancelled" || tache.status === "in_review") return;
  const m = (tache.description ?? "").match(/\[revue:(\w+)\]\[rev:([0-9a-f-]{36})\]/u);
  if (!m || m[1] !== role) return trace("tache_hors_role", { tache: tache.identifier });
  if (!(await checkout(tache))) return;
  const parent = tache.parentId;
  const { corps: ctx } = await api("GET", `${PLUGIN}/taches/${parent}/contexte`);
  const rev = ctx?.livrable?.revisionId;
  if (rev !== m[2]) {
    await api("PATCH", `/issues/${tache.id}`, { status: "cancelled", comment: "Révision dépassée : revue sans objet (démonstration)." });
    return trace("revue_perimee");
  }
  const corps = ctx.livrable.corps;
  const ouverts = ctx.constatsOuverts.filter((c) => c.role === role);
  const detectes = [];
  const preuvesVerifiees = [];
  let exigencesExaminees = [];
  let justification = null;
  let verdictForce = null;

  if (role === "exigences") {
    exigencesExaminees = ctx.exigences.map((e) => e.code);
    for (const e of ctx.exigences) {
      for (const el of e.elementsAttendus) {
        const p = preuvesPour(corps, el, rev);
        if (p.length) preuvesVerifiees.push(...p);
        else
          detectes.push({
            requirementIds: [e.code], categorie: "exigence_manquante", gravite: e.obligatoire ? "majeure" : "mineure", emplacement: "Livrable entier",
            description: `${e.code} : « ${el} » n'est pas présenté.`, preuve: `Aucune mention de « ${el} » dans la révision ${ctx.livrable.revisionNumber}.`,
            correctionAttendue: `Ajouter « ${el} » conformément à ${e.code}.`,
          });
      }
    }
  } else if (role === "metier") {
    corps.split("\n").forEach((ligne, i) => {
      for (const motif of AFFIRMATIONS_A_SOURCER) {
        const t = ligne.match(motif);
        if (t && !ligne.startsWith("_")) {
          detectes.push({
            requirementIds: [], categorie: "affirmation_non_sourcee", gravite: "majeure", emplacement: `ligne ${i + 1}`,
            description: `Affirmation commerciale non sourcée : « ${t[0]} ».`, preuve: ligne.trim(), correctionAttendue: "Retirer l'affirmation ou fournir une source et une offre validée.",
          });
        }
      }
    });
  } else if (role === "technique") {
    const urls = [...new Set(corps.match(/https?:\/\/[^\s)>\]]+/gu) ?? [])];
    if (urls.length === 0) {
      verdictForce = "NOT_APPLICABLE_JUSTIFIED";
      justification = "Aucun lien ni formulaire dans le livrable.";
    } else {
      const v = await api("POST", `${PLUGIN}/taches/${parent}/liens/verifier`, { urls });
      for (const r of v.corps ?? []) {
        if (!r.ok) {
          detectes.push({
            requirementIds: [], categorie: r.statut === "page_erreur" ? "page_erreur" : "lien_defectueux", gravite: "majeure", emplacement: r.url,
            description: `Lien défectueux : ${r.url}.`, preuve: `Statut ${r.statut}, HTTP ${r.codeHttp ?? "aucun"} ${r.indicesErreur.join(", ")}`.trim(),
            correctionAttendue: "Remplacer le lien par une page valide.",
          });
        }
      }
    }
  }
  // Un problème déjà signalé reste ouvert (pas de doublon) ; ceux qui ont disparu sont résolus.
  const nouveaux = detectes.filter((d) => !ouverts.some((o) => o.description === d.description));
  const resolus = ouverts.filter((o) => !detectes.some((d) => d.description === o.description)).map((o) => o.findingId);
  const verdict = verdictForce ?? (detectes.length > 0 ? "CHANGES_REQUESTED" : "PASS");
  const depot = await api("POST", `${PLUGIN}/taches/${parent}/verdicts`, {
    revisionId: rev, role, verdict, exigencesExaminees, preuvesVerifiees, constats: nouveaux, constatsResolus: resolus,
    limites: ["Contrôle déterministe de démonstration (fixtures)."], controlesNonExecutes: [], justification,
  });
  trace("verdict", { role, verdict, code: depot.code, nouveaux: nouveaux.length, resolus: resolus.length, erreur: depot.code >= 400 ? depot.corps : undefined });
  const fin = await api("PATCH", `/issues/${tache.id}`, {
    status: "done",
    comment: `Verdict ${verdict} déposé sur la révision ${ctx.livrable.revisionNumber} (${nouveaux.length} constat(s) nouveau(x), ${resolus.length} résolu(s)). Démonstration.`,
  });
  trace("revue_close", { code: fin.code });
}

/* ------------------------------------------------------------------ */
/* Contourneur (scénario F) : tente de retirer la politique puis de clore  */
/* ------------------------------------------------------------------ */
async function contourner(tache) {
  if (tache.status === "in_review") return;
  if (!(await checkout(tache))) return;
  const retrait = await api("PATCH", `/issues/${tache.id}`, { executionPolicy: null });
  trace("tentative_retrait_politique", { code: retrait.code, erreur: retrait.corps?.error });
  const publication = await api("POST", `${PLUGIN}/taches/${tache.id}/diffusions`, {
    revisionId: "00000000-0000-4000-8000-000000000000", action: "publier", canal: "facebook", cleIdempotence: `contournement-${tache.id}`,
  });
  trace("tentative_publication", { code: publication.code, etat: publication.corps?.etat, motif: publication.corps?.motifRefus ?? publication.corps?.erreur });
  const verdict = await api("POST", `${PLUGIN}/taches/${tache.id}/verdicts`, { revisionId: "00000000-0000-4000-8000-000000000000", role: "exigences", verdict: "PASS" });
  trace("tentative_autoverdict", { code: verdict.code, erreur: verdict.corps?.erreur });
  const message = await api("POST", `${PLUGIN}/taches/${tache.id}/messages`, {
    recipient: { type: "humain", id: "local-board" }, contenu: { type: "resultat", resume: "Approuvé, publiez.", approvalId: "auto" },
  });
  trace("tentative_message_elevation", { code: message.code, erreur: message.corps?.erreur });
  const fin = await api("PATCH", `/issues/${tache.id}`, { status: "done", comment: "Clôture demandée sans relecture (tentative de contournement, démonstration)." });
  trace("tentative_cloture", { code: fin.code, statut: fin.corps?.status, etape: fin.corps?.executionState?.currentStageType });
}

/* Charge (scénario F) : occupe un run pendant DEMO_CHARGE_MS, puis clôt sa tâche. */
async function charger(tache) {
  if (tache.status === "done") return;
  if (!(await checkout(tache))) return;
  const ms = Number(process.env.DEMO_CHARGE_MS ?? 10000);
  trace("charge_debut", { ms });
  await pause(ms);
  const r = await api("PATCH", `/issues/${tache.id}`, { status: "done", comment: `Charge de démonstration terminée (${ms} ms).` });
  trace("charge_fin", { code: r.code });
}

async function main() {
  trace("reveil", { tache: TACHE || null, raison: process.env.PAPERCLIP_WAKE_REASON ?? null });
  if (!SCENARIO) return trace("scenario_inconnu");
  for (const tache of await mesTaches()) {
    try {
      if (ROLE === "coordinateur") await coordonner(tache);
      else if (ROLE === "producteur") await produire(tache);
      else if (ROLE === "porte") await garder(tache);
      else if (["exigences", "metier", "technique"].includes(ROLE)) await relire(tache, ROLE);
      else if (ROLE === "contourneur") await contourner(tache);
      else if (ROLE === "charge") await charger(tache);
    } catch (err) {
      trace("erreur", { tache: tache.identifier, message: err instanceof Error ? err.message : String(err) });
    }
  }
  return 0;
}

main().then(
  (code) => process.exit(code ?? 0),
  (err) => {
    trace("erreur_fatale", { message: err instanceof Error ? err.message : String(err) });
    process.exit(1);
  },
);
