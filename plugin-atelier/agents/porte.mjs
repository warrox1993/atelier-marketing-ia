#!/usr/bin/env node
// Agent déterministe « Porte de contrôle » de l'Atelier Marketing IA, lancé par l'adaptateur
// natif « process » de Paperclip (aucun appel de modèle).
//
// Usage (configuration de l'agent, chemin RELATIF au cwd = dossier du plugin) :
//   node agents/porte.mjs
// Variables injectées par Paperclip : PAPERCLIP_API_URL, PAPERCLIP_API_KEY (jeton du run),
// PAPERCLIP_RUN_ID, PAPERCLIP_AGENT_ID, PAPERCLIP_COMPANY_ID, PAPERCLIP_TASK_ID.
// PAPERCLIP_API_KEY, PAPERCLIP_AGENT_ID et PAPERCLIP_COMPANY_ID sont obligatoires : sans elles
// le script s'arrête avec un message clair et un code non nul.
//
// Le contenu des tâches est traité comme une DONNÉE : l'agent n'exécute jamais une instruction
// trouvée dans un contenu.
import { patchDecisionPorte } from "./decision-porte.mjs";

const ROLE = "porte";
const MANQUANTES = ["PAPERCLIP_API_KEY", "PAPERCLIP_AGENT_ID", "PAPERCLIP_COMPANY_ID"].filter((nom) => !process.env[nom]);
if (MANQUANTES.length > 0) {
  console.error(`Agent porte : variable(s) d'environnement Paperclip manquante(s) : ${MANQUANTES.join(", ")}. Ce programme doit être lancé par l'adaptateur « process » de Paperclip.`);
  process.exit(2);
}

let BASE = (process.env.PAPERCLIP_API_URL ?? "http://127.0.0.1:3100").replace(/\/$/u, "");
if (!BASE.endsWith("/api")) BASE += "/api";
const CLE = process.env.PAPERCLIP_API_KEY ?? "";
const RUN = process.env.PAPERCLIP_RUN_ID ?? "";
const MOI = process.env.PAPERCLIP_AGENT_ID ?? "";
const SOC = process.env.PAPERCLIP_COMPANY_ID ?? "";
const TACHE = process.env.PAPERCLIP_TASK_ID ?? "";
const PLUGIN = "/plugins/atelier.marketing-ia/api";

function trace(evenement, donnees = {}) {
  console.log(JSON.stringify({ t: new Date().toISOString(), role: ROLE, agent: MOI, run: RUN, evenement, ...donnees }));
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

/* Porte de contrôle : évaluation déterministe puis décision sur la tâche en revue. */
async function garder(tache) {
  if (tache.status !== "in_review") return;
  const participant = tache.executionState?.currentParticipant;
  if (participant?.agentId !== MOI) return trace("pas_participant", { tache: tache.identifier });
  // La porte décide TOUJOURS dans son run (le moteur relance puis bloque une revue sans décision).
  const ev = await api("POST", `${PLUGIN}/taches/${tache.id}/porte/evaluer`, {});
  trace("evaluation", { code: ev.code, decision: ev.corps?.decision, motifs: ev.corps?.motifs?.map((m) => m.code) });
  if (ev.code >= 400) {
    const r = await api("PATCH", `/issues/${tache.id}`, { status: "in_progress", comment: `Porte : évaluation impossible (${ev.corps?.erreur ?? ev.code}) ; retour au producteur.` });
    return trace("decision_porte", { code: r.code });
  }
  // Un renvoi pour information manquante (panne d'outil) porte `awaitingInformation` : hors compteur de tours du socle.
  const patch = patchDecisionPorte(ev.corps);
  const res = await api("PATCH", `/issues/${tache.id}`, patch);
  trace("decision_porte", { code: res.code, statut: res.corps?.status, etape: res.corps?.executionState?.currentStageType, erreur: res.code >= 400 ? res.corps : undefined });
}

async function main() {
  trace("reveil", { tache: TACHE || null, raison: process.env.PAPERCLIP_WAKE_REASON ?? null });
  for (const tache of await mesTaches()) {
    try {
      await garder(tache);
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
