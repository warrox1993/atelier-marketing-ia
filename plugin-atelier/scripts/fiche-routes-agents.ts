/**
 * Génère la fiche des corps d'entrée des routes ouvertes aux agents
 * (`auth` `board-or-agent` ou `agent` dans `src/contrats/routes.ts`) à partir
 * des contrats zod, pour que les agents n'aient jamais à lire le code source
 * du plugin.
 *
 *   npx tsx scripts/fiche-routes-agents.ts             # écrit organisation/registre/routes-agents.md
 *   npx tsx scripts/fiche-routes-agents.ts --verifier  # code 1 si la fiche écrite n'est plus à jour
 *
 * Aucune dépendance ajoutée : zod 4 fournit `z.toJSONSchema`.
 * La sortie est déterministe (ordre de `ROUTES_API`, aucune date).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod";
import * as C from "../src/contrats/index.js";
import { ROUTES_API, type RouteApi } from "../src/contrats/routes.js";

export const FICHE_ROUTES_AGENTS = resolve(dirname(fileURLToPath(import.meta.url)), "../../organisation/registre/routes-agents.md");

type SchemaZod = z.ZodType;

/** Schéma du corps de chaque route d'agent qui en lit un. */
export const SCHEMAS_CORPS: Record<string, SchemaZod> = {
  "tache.couverture": C.DeclarerCouvertureEntree,
  "tache.verdict": C.DeposerVerdictEntree,
  "tache.messages.envoyer": C.EnvoyerMessageEntree,
  "tache.messages.etat": C.EtatMessageEntree,
  "tache.sources.lire": C.LireUrlEntree,
  "tache.donnees.deposer": C.DeposerDonneesConnexionEntree,
  "tache.liens.verifier": C.VerifierLiensEntree,
  "tache.diffusions": C.DemanderDiffusionEntree,
  "tache.diffusions.issue": C.RapporterIssueDiffusionEntree,
  "tache.appels.proposer": C.ProposerAppelEntree,
  "tache.planification": C.PlanifierEntree,
  "portes.creer": C.MettreSousPorteEntree,
  "campagnes.creer": C.CreerCampagneEntree,
  "campagnes.exigences": C.EnregistrerExigencesEntree,
  "exigences.exclusion": C.ExclusionEntree,
  "imports.creer": C.ImporterDocumentEntree,
  "tache.prospects.deposer": C.DeposerProspectsEntree,
  "tache.prospects.exporter": C.DemanderExportCrmEntree,
  "tache.connaissances.rechercher": C.RechercherConnaissancesEntree,
  "prospects.exclure": C.ExclureProspectEntree,
  "prospects.critere.evaluer": C.EvaluerCritereEntree,
};

/** Routes d'agent en écriture dont le serveur ne lit aucun corps. */
export const ROUTES_SANS_CORPS: readonly string[] = ["tache.porte.evaluer", "tache.plan.controler"];

/**
 * Exemples écrits à la main, seulement quand la génération automatique ne
 * produit pas un exemple valide (règles croisées entre champs). Le test
 * vérifie que chaque exemple passe son schéma zod.
 */
const EXEMPLES_MANUELS: Record<string, unknown> = {
  "tache.donnees.deposer": { service: "gsc", outil: "gsc_requete_performances", reponse: { texte: "texte brut de la réponse de l'outil" } },
  "tache.prospects.deposer": { service: "bce", outil: "bce_entreprise", reponse: { texte: "texte brut de la réponse de l'outil" } },
  "tache.diffusions.issue": { reponse: { texte: "texte brut de la réponse de l'outil" } },
  "prospects.critere.evaluer": {
    companyId: "123e4567-e89b-42d3-a456-426614174000",
    statut: "verifie",
    justification: "Page officielle consultée",
    sources: ["https://exemple.be/page"],
  },
};

/** Règles croisées entre champs, invisibles dans un schéma JSON : une phrase par route concernée. */
const NOTES_CROISEES: Record<string, string> = {
  "tache.donnees.deposer": "`reponse` doit contenir `texte` ou `structuredContent` (au moins l'un des deux). `arguments` devient obligatoire en mode réel.",
  "tache.prospects.deposer": "`reponse` doit contenir `texte` ou `structuredContent` (au moins l'un des deux).",
  "tache.diffusions.issue": "`reponse` doit contenir `texte` ou `structuredContent` (au moins l'un des deux).",
  "prospects.critere.evaluer": "Un statut `verifie` ou `contraire` exige au moins une source ; `non_verifie` accepte une liste vide.",
};

const UUID_EXEMPLE = "123e4567-e89b-42d3-a456-426614174000";
const DATE_EXEMPLE = "2026-01-15T09:00:00Z";

export function routesAgents(): RouteApi[] {
  return (ROUTES_API as readonly RouteApi[]).filter((r) => r.auth !== "board" && r.methode !== "GET");
}

type Json = { [cle: string]: unknown };

function schemaJson(cle: string): Json {
  return z.toJSONSchema(SCHEMAS_CORPS[cle]!, { unrepresentable: "any", io: "input" }) as Json;
}

/* ----------------------------- exemple minimal ----------------------------- */

function candidatsMotif(): string[] {
  return ["REQ-001", "https://exemple.be/page", "https://exemple.be", "exemple", "exemple_outil", "a", "a1", "0123456789", "2026-01-15"];
}

function exemple(s: Json): unknown {
  if ("const" in s) return s.const;
  if (Array.isArray(s.enum)) return s.enum[0];
  const variantes = (s.anyOf ?? s.oneOf) as Json[] | undefined;
  if (variantes) return exemple(variantes.find((v) => v.type !== "null") ?? variantes[0]!);
  const type = Array.isArray(s.type) ? s.type.find((t) => t !== "null") : s.type;
  switch (type) {
    case "object": {
      const sortie: Json = {};
      const props = (s.properties ?? {}) as Record<string, Json>;
      for (const cle of (s.required ?? []) as string[]) sortie[cle] = exemple(props[cle] ?? {});
      return sortie;
    }
    case "array": {
      const n = Number(s.minItems ?? 0);
      return Array.from({ length: n }, () => exemple((s.items ?? {}) as Json));
    }
    case "integer":
    case "number":
      return Math.max(Number(s.minimum ?? 0), Number(s.exclusiveMinimum ?? -Infinity) + 1 || 0);
    case "boolean":
      return false;
    case "string": {
      if (s.format === "uuid") return UUID_EXEMPLE;
      if (s.format === "date-time") return DATE_EXEMPLE;
      const min = Number(s.minLength ?? 0);
      const max = Number(s.maxLength ?? Infinity);
      if (typeof s.pattern === "string") {
        const re = new RegExp(s.pattern, "u");
        const trouve = candidatsMotif().find((c) => re.test(c) && c.length >= min && c.length <= max);
        if (trouve !== undefined) return trouve;
      }
      let t = "exemple";
      while (t.length < min) t += "x";
      return t.slice(0, Math.min(t.length, max));
    }
    default:
      return {};
  }
}

export function exempleDeRoute(cle: string): unknown {
  if (cle in EXEMPLES_MANUELS) return EXEMPLES_MANUELS[cle];
  return exemple(schemaJson(cle));
}

/* --------------------------------- champs --------------------------------- */

interface Ligne {
  champ: string;
  type: string;
  obligatoire: boolean;
  contraintes: string;
}

function typeLisible(s: Json): string {
  if (Array.isArray(s.enum)) return "énumération";
  if ("const" in s) return "constante";
  const type = Array.isArray(s.type) ? s.type.find((t) => t !== "null") : s.type;
  if (type === "string") {
    if (s.format === "uuid") return "uuid";
    if (s.format === "date-time") return "date ISO";
    return "texte";
  }
  if (type === "integer") return "entier";
  if (type === "number") return "nombre";
  if (type === "boolean") return "booléen";
  if (type === "array") {
    const it = (s.items ?? {}) as Json;
    return it.type === "object" || it.anyOf || it.oneOf ? "tableau d'objets" : `tableau de ${typeLisible(it)}`;
  }
  if (type === "object") return s.properties ? "objet" : "objet libre";
  return "valeur libre";
}

function bornes(s: Json): string {
  const p: string[] = [];
  if (Array.isArray(s.enum)) p.push(s.enum.map((v) => JSON.stringify(v)).join(" | "));
  if ("const" in s) p.push(`vaut ${JSON.stringify(s.const)}`);
  if (s.minLength !== undefined || s.maxLength !== undefined) p.push(`${s.minLength ?? 0} à ${s.maxLength ?? "∞"} caractères`);
  if (s.minItems !== undefined || s.maxItems !== undefined) p.push(`${s.minItems ?? 0} à ${s.maxItems ?? "∞"} éléments`);
  if (s.minimum !== undefined || s.maximum !== undefined) {
    const max = typeof s.maximum === "number" && s.maximum >= Number.MAX_SAFE_INTEGER ? "∞" : (s.maximum ?? "∞");
    p.push(`${s.minimum ?? "-∞"} à ${max}`);
  }
  if (typeof s.pattern === "string" && !s.format) p.push(`motif ${"`"}${s.pattern.replace(/\|/gu, "\\|")}${"`"}`);
  if (s.default !== undefined && s.default !== null && !(Array.isArray(s.default) && s.default.length === 0)) p.push(`défaut ${JSON.stringify(s.default)}`);
  return p.join(" ; ");
}

function aplatir(s: Json, chemin: string, obligatoire: boolean, sortie: Ligne[], racine = false): void {
  const variantes = (s.anyOf ?? s.oneOf) as Json[] | undefined;
  if (variantes) {
    const nonNuls = variantes.filter((v) => v.type !== "null");
    const nullable = nonNuls.length < variantes.length;
    if (nonNuls.length === 1) {
      const un = nonNuls[0]!;
      aplatir({ ...un, ...(s.default !== undefined ? { default: s.default } : {}) }, chemin, obligatoire, sortie, racine);
      if (nullable && sortie.length > 0) {
        const derniere = [...sortie].reverse().find((l) => l.champ === chemin);
        if (derniere) derniere.contraintes = [derniere.contraintes, "peut valoir null"].filter(Boolean).join(" ; ");
      }
      return;
    }
    // Union d'objets discriminée par `type` : une série de lignes par variante.
    sortie.push({ champ: chemin, type: "une des variantes ci-dessous", obligatoire, contraintes: nullable ? "peut valoir null" : "" });
    for (const v of nonNuls) {
      const props = (v.properties ?? {}) as Record<string, Json>;
      const disc = props.type && "const" in props.type ? String(props.type.const) : null;
      // La constante `type` est dite dans le nom de la variante : pas de ligne en plus.
      if (disc) {
        const sans = { ...v, properties: Object.fromEntries(Object.entries(props).filter(([k]) => k !== "type")) };
        sortie.push({ champ: `${chemin}{type=${disc}}`, type: "variante", obligatoire: true, contraintes: "" });
        aplatir(sans, `${chemin}{type=${disc}}`, true, sortie, true);
      } else aplatir(v, `${chemin}{variante}`, true, sortie);
    }
    return;
  }
  const type = Array.isArray(s.type) ? s.type.find((t) => t !== "null") : s.type;
  if (type === "object" && s.properties) {
    if (!racine) sortie.push({ champ: chemin, type: "objet", obligatoire, contraintes: "" });
    const requis = new Set((s.required ?? []) as string[]);
    for (const [cle, sous] of Object.entries(s.properties as Record<string, Json>)) {
      aplatir(sous, chemin === "" ? cle : `${chemin}.${cle}`, requis.has(cle), sortie);
    }
    return;
  }
  sortie.push({ champ: chemin, type: typeLisible(s), obligatoire, contraintes: bornes(s) });
  if (type === "array" && s.items) {
    const it = s.items as Json;
    const ouObjet = it.type === "object" || it.anyOf || it.oneOf;
    if (ouObjet) aplatir(it, `${chemin}[]`, true, sortie, true);
  }
}

/* --------------------------------- rendu ---------------------------------- */

function premierePhrase(texte: string): string {
  const coupe = texte.split(/(?<=[.;])\s/u)[0] ?? texte;
  return coupe.length > 160 ? `${coupe.slice(0, 157)}...` : coupe;
}

function celluleMd(t: string): string {
  return t.replace(/\|/gu, "\\|");
}

function sectionRoute(r: RouteApi): string {
  const titre = `## ${r.methode} ${r.chemin}`;
  const intro = premierePhrase(r.description);
  const sortie: string[] = [titre, "", `Clé : ${"`"}${r.cle}${"`"}. ${intro}`, ""];
  if (ROUTES_SANS_CORPS.includes(r.cle)) {
    sortie.push("Corps : aucun (rien à envoyer).", "");
    return sortie.join("\n");
  }
  const json = schemaJson(r.cle);
  if (json.additionalProperties === false) sortie.push("Aucun champ en plus de ceux listés (les champs inconnus sont refusés).", "");
  const note = NOTES_CROISEES[r.cle];
  if (note) sortie.push(`Règle croisée : ${note}`, "");
  const lignes: Ligne[] = [];
  aplatir(json, "", true, lignes, true);
  sortie.push("| Champ | Type | Obligatoire | Bornes |", "| --- | --- | --- | --- |");
  for (const l of lignes) {
    sortie.push(`| ${"`"}${celluleMd(l.champ)}${"`"} | ${l.type} | ${l.obligatoire ? "oui" : "non"} | ${celluleMd(l.contraintes)} |`);
  }
  sortie.push("", "Exemple minimal valide :", "", "```json", JSON.stringify(exempleDeRoute(r.cle)), "```", "");
  return sortie.join("\n");
}

export function genererFiche(): string {
  const entete = [
    "# Fiche des routes ouvertes aux agents : corps des requêtes",
    "",
    "Fichier GÉNÉRÉ par `plugin-atelier/scripts/fiche-routes-agents.ts` à partir des contrats zod ; ne pas le modifier à la main.",
    "Seules les routes en écriture (POST, PATCH, DELETE) y figurent : les lectures (GET) n'ont pas de corps.",
    "Une erreur 400 `entree_invalide` rend le détail champ par champ ; les règles croisées entre champs n'apparaissent pas dans les tableaux.",
    "",
  ].join("\n");
  return `${entete}\n${routesAgents().map(sectionRoute).join("\n")}`.replace(/\n{3,}/gu, "\n\n").trimEnd() + "\n";
}

/** Garde-fou : toute route d'agent en écriture a un schéma déclaré ou figure dans `ROUTES_SANS_CORPS`. */
export function routesSansSchema(): string[] {
  return routesAgents()
    .map((r) => r.cle)
    .filter((cle) => !(cle in SCHEMAS_CORPS) && !ROUTES_SANS_CORPS.includes(cle));
}

function principal(): number {
  const manquantes = routesSansSchema();
  if (manquantes.length > 0) {
    console.error(`Routes d'agent sans schéma de corps déclaré : ${manquantes.join(", ")}`);
    return 1;
  }
  const fiche = genererFiche();
  if (process.argv.includes("--verifier")) {
    let actuel = "";
    try {
      actuel = readFileSync(FICHE_ROUTES_AGENTS, "utf8");
    } catch {
      /* absente : écart */
    }
    if (actuel !== fiche) {
      console.error("ÉCART : organisation/registre/routes-agents.md n'est plus à jour. Lancer : npx tsx scripts/fiche-routes-agents.ts");
      return 1;
    }
    console.log("Fiche des routes d'agents à jour.");
    return 0;
  }
  writeFileSync(FICHE_ROUTES_AGENTS, fiche, "utf8");
  console.log(`Fiche écrite : ${FICHE_ROUTES_AGENTS} (${Buffer.byteLength(fiche)} octets, ${routesAgents().length} routes).`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(principal());
