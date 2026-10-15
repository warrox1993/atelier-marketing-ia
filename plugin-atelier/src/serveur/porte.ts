/**
 * Évaluation DÉTERMINISTE de la porte P2 (cahier §8).
 *
 * Fonction pure : mêmes entrées, même décision et même empreinte. Aucune
 * sortie de modèle n'y entre comme autorité : seuls comptent les faits
 * enregistrés (couvertures avec preuves, verdicts structurés liés à une
 * révision, constats et leur résolution, exclusions autorisées par un humain).
 */
import { createHash } from "node:crypto";
import type { CodeMotifPorte, DecisionPorte, MotifPorte, RoleRevue } from "../contrats/index.js";
import { GRAVITES_BLOQUANTES } from "../contrats/index.js";
import { verifierDonneesDemo, type EntreesDonneesDemo } from "./regles-donnees-demo.js";
import { controlerCitationsConnaissances, type VersionPourValidite } from "./regles-connaissances.js";

export interface PreuveEntree {
  revisionId: string;
  emplacement: string;
  element: string | null;
  extrait: string;
}

export interface ExigenceEntree {
  code: string;
  obligatoire: boolean;
  elementsAttendus: string[];
  exclusionEtat: "aucune" | "demandee" | "autorisee" | "refusee";
  version: number;
}

export interface CouvertureEntree {
  id: string;
  revisionId: string;
  code: string;
  etat: "non_traite" | "partiel" | "couvert" | "bloque" | "na_justifie";
  preuves: PreuveEntree[];
  question: string | null;
  /** Ordre d'enregistrement (horodatage ISO ou texte comparable). */
  creeLe: string;
}

export interface VerdictEntree {
  id: string;
  revisionId: string;
  role: RoleRevue;
  relecteurId: string;
  verdict: "PASS" | "CHANGES_REQUESTED" | "BLOCKED_INFORMATION" | "NOT_APPLICABLE_JUSTIFIED";
  exigencesExaminees: string[];
  preuvesVerifiees: PreuveEntree[];
  justification: string | null;
  creeLe: string;
}

export interface ConstatEntree {
  findingId: string;
  gravite: "critique" | "majeure" | "mineure" | "info";
  statutResolution: "ouvert" | "resolu" | "rejete" | "accepte_par_humain";
  role: RoleRevue;
}

export interface EntreesPorte {
  porte: {
    exigencesCiblees: string[];
    revuesRequises: Array<{ role: RoleRevue; agentId: string }>;
    maxCycles: number;
  };
  exigences: ExigenceEntree[];
  livrable: { revisionId: string } | null;
  couvertures: CouvertureEntree[];
  verdicts: VerdictEntree[];
  constats: ConstatEntree[];
  /**
   * Révisions distinctes déjà refusées sur le fond (cycles consommés), hors révision courante.
   * M4 : quand leur nombre atteint `maxCycles` (maximum effectif, relevé par une relance humaine),
   * la révision courante n'a plus de cycle : l'évaluation est `BLOQUE_INFORMATION`, jamais `PASS`.
   */
  revisionsDejaRefusees: string[];
  /**
   * Garde des données simulées (lot L9) : sources de la tâche, mode effectif, corps du
   * livrable courant. Absente : la règle ne s'applique pas (compatibilité des appels existants).
   */
  donneesDemo?: EntreesDonneesDemo;
  /**
   * Connaissances du client (lot R7) : corps du livrable, adresses `connaissance://` rendues à la tâche,
   * versions des documents cités, date de la porte. Absente : la règle ne s'applique pas.
   */
  connaissances?: { livrable: string; passagesRendus: string[]; versions: VersionPourValidite[]; date: string };
}

export interface ResultatPorte {
  decision: DecisionPorte;
  motifs: MotifPorte[];
  revisionId: string | null;
  empreinte: string;
  cyclesEpuises: boolean;
  /** Cycles consommés si cette évaluation est un refus. */
  cyclesApres: number;
}

/** Comparaison tolérante des éléments attendus (casse, accents, espaces, tirets). */
export function normaliserElement(valeur: string): string {
  return valeur
    .normalize("NFD")
    .replace(/[̀-ͯ]/gu, "")
    .toLowerCase()
    .replace(/[\s\-_'’.]+/gu, " ")
    .trim();
}

const BLOQUANTS: ReadonlySet<CodeMotifPorte> = new Set(["information_manquante", "revue_bloquee_information"]);

/**
 * M5 (revue indépendante) : motifs qui ne disent rien du FOND du livrable (revue pas encore
 * faite sur cette révision, cycles épuisés). Un refus composé de ces seuls motifs ne consomme
 * pas de cycle de correction : une évaluation prématurée ne pénalise pas le producteur.
 */
export const MOTIFS_SANS_CYCLE: ReadonlySet<CodeMotifPorte> = new Set(["revue_requise_absente", "revue_sur_ancienne_version", "cycles_epuises"]);

/** Un refus de porte consomme-t-il un cycle ? Seulement s'il porte au moins un motif de fond. */
export function refusDeFond(motifs: ReadonlyArray<{ code: string }>): boolean {
  return motifs.some((m) => !MOTIFS_SANS_CYCLE.has(m.code as CodeMotifPorte));
}

function motif(code: CodeMotifPorte, message: string, extra: Partial<Omit<MotifPorte, "code" | "message">> = {}): MotifPorte {
  return { code, message, exigence: null, element: null, role: null, findingId: null, emplacement: null, sourceId: null, ...extra };
}

function plusRecent<T extends { creeLe: string }>(liste: T[]): T | undefined {
  return [...liste].sort((a, b) => (a.creeLe < b.creeLe ? 1 : a.creeLe > b.creeLe ? -1 : 0))[0];
}

/** JSON canonique (clés triées) pour l'empreinte. */
export function canonique(valeur: unknown): string {
  if (Array.isArray(valeur)) return `[${valeur.map(canonique).join(",")}]`;
  if (valeur && typeof valeur === "object") {
    const entrees = Object.entries(valeur as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entrees.map(([k, v]) => `${JSON.stringify(k)}:${canonique(v)}`).join(",")}}`;
  }
  return JSON.stringify(valeur ?? null);
}

export function evaluerPorte(e: EntreesPorte): ResultatPorte {
  const motifs: MotifPorte[] = [];
  const revision = e.livrable?.revisionId ?? null;

  if (!revision) {
    motifs.push(motif("livrable_absent", "Aucune révision du livrable n'existe."));
  }

  const exigencesParCode = new Map(e.exigences.map((x) => [x.code, x]));
  const verdictsCourants = e.verdicts.filter((v) => v.revisionId === revision);
  const verdictExigences = plusRecent(verdictsCourants.filter((v) => v.role === "exigences"));
  const controleExigencesRequis = e.porte.revuesRequises.some((r) => r.role === "exigences");

  if (revision) {
    for (const code of e.porte.exigencesCiblees) {
      const exigence = exigencesParCode.get(code);
      if (!exigence) {
        motifs.push(motif("exigence_inconnue", `${code} est ciblée mais n'existe pas dans la campagne.`, { exigence: code }));
        continue;
      }
      if (exigence.exclusionEtat === "autorisee") continue;

      const couverture = plusRecent(e.couvertures.filter((c) => c.code === code && c.revisionId === revision));
      if (!couverture) {
        if (exigence.obligatoire) {
          motifs.push(motif("exigence_obligatoire_non_couverte", `${code} : aucune couverture déclarée pour la révision courante.`, { exigence: code }));
        }
        continue;
      }

      switch (couverture.etat) {
        case "non_traite":
          if (exigence.obligatoire) motifs.push(motif("exigence_obligatoire_non_couverte", `${code} : non traitée.`, { exigence: code }));
          break;
        case "partiel":
          if (exigence.obligatoire) motifs.push(motif("exigence_partielle", `${code} : couverture partielle.`, { exigence: code }));
          break;
        case "bloque":
          motifs.push(
            motif("information_manquante", `${code} : information manquante${couverture.question ? ` (question : ${couverture.question})` : ""}.`, { exigence: code }),
          );
          break;
        case "na_justifie":
          motifs.push(
            motif("exclusion_non_autorisee", `${code} : déclarée non applicable sans autorisation humaine.`, { exigence: code }),
          );
          break;
        case "couvert": {
          if (couverture.preuves.length === 0) {
            motifs.push(motif("preuve_absente", `${code} : annoncée couverte sans preuve localisable.`, { exigence: code }));
            break;
          }
          if (couverture.preuves.some((p) => p.revisionId !== revision)) {
            motifs.push(motif("preuve_sur_autre_revision", `${code} : une preuve vise une autre révision du livrable.`, { exigence: code }));
          }
          const elementsProuves = new Set(couverture.preuves.map((p) => (p.element ? normaliserElement(p.element) : "")));
          for (const element of exigence.elementsAttendus) {
            if (!elementsProuves.has(normaliserElement(element))) {
              motifs.push(motif("element_attendu_sans_preuve", `${code} : « ${element} » n'a pas de preuve dans le livrable.`, { exigence: code, element }));
            }
          }
          break;
        }
      }

      // Le contrôleur des exigences doit avoir examiné l'exigence, et vérifié chaque élément attendu.
      if (controleExigencesRequis && verdictExigences?.verdict === "PASS") {
        if (!verdictExigences.exigencesExaminees.includes(code)) {
          motifs.push(motif("exigence_non_examinee", `${code} : non examinée par le contrôleur des exigences.`, { exigence: code, role: "exigences" }));
        }
        const verifies = new Set(
          verdictExigences.preuvesVerifiees.filter((p) => p.revisionId === revision && p.element).map((p) => normaliserElement(p.element ?? "")),
        );
        for (const element of exigence.obligatoire ? exigence.elementsAttendus : []) {
          if (!verifies.has(normaliserElement(element))) {
            motifs.push(
              motif("exigence_non_examinee", `${code} : le contrôleur n'a pas apporté de preuve pour « ${element} ».`, { exigence: code, element, role: "exigences" }),
            );
          }
        }
      }
    }

    for (const requise of e.porte.revuesRequises) {
      const tousRole = e.verdicts.filter((v) => v.role === requise.role);
      const dernier = plusRecent(tousRole);
      if (!dernier) {
        motifs.push(motif("revue_requise_absente", `Revue « ${requise.role} » requise : aucun verdict.`, { role: requise.role }));
        continue;
      }
      if (dernier.revisionId !== revision) {
        motifs.push(motif("revue_sur_ancienne_version", `Revue « ${requise.role} » faite sur une ancienne révision du livrable.`, { role: requise.role }));
        continue;
      }
      switch (dernier.verdict) {
        case "PASS":
          break;
        case "CHANGES_REQUESTED":
          motifs.push(motif("revue_non_reussie", `Revue « ${requise.role} » : corrections demandées.`, { role: requise.role }));
          break;
        case "BLOCKED_INFORMATION":
          motifs.push(motif("revue_bloquee_information", `Revue « ${requise.role} » : information manquante.`, { role: requise.role }));
          break;
        case "NOT_APPLICABLE_JUSTIFIED":
          if (requise.role === "exigences" || !dernier.justification?.trim()) {
            motifs.push(
              motif("revue_na_non_justifiee", `Revue « ${requise.role} » déclarée non applicable sans justification recevable.`, { role: requise.role }),
            );
          }
          break;
      }
    }
  }

  for (const c of e.constats) {
    if (c.statutResolution === "ouvert" && GRAVITES_BLOQUANTES.includes(c.gravite)) {
      motifs.push(motif("constat_bloquant_ouvert", `Constat ${c.gravite} ${c.findingId} encore ouvert.`, { findingId: c.findingId, role: c.role }));
    }
  }

  if (e.donneesDemo) motifs.push(...verifierDonneesDemo(e.donneesDemo));
  if (e.connaissances) {
    const k = e.connaissances;
    for (const c of controlerCitationsConnaissances(k.livrable, k.passagesRendus, k.versions, k.date)) {
      motifs.push(motif(c.code, c.message, { emplacement: c.emplacement, element: c.adresse ?? c.extrait }));
    }
  }

  // M4 : cycles déjà épuisés AVANT cette révision (aucune relance humaine ne les a relevés) :
  // la révision courante n'a pas droit à une évaluation, l'escalade humaine est obligatoire.
  const dejaEpuises = revision !== null && new Set(e.revisionsDejaRefusees).size >= e.porte.maxCycles;
  if (dejaEpuises) {
    motifs.push(
      motif("cycles_epuises", `${new Set(e.revisionsDejaRefusees).size} cycle(s) de correction déjà consommés sur ${e.porte.maxCycles} : aucune nouvelle révision n'est évaluée sans relance humaine (atelier.correction.relancer).`),
    );
  }

  const bloque = dejaEpuises || motifs.some((m) => BLOQUANTS.has(m.code));
  let decision: DecisionPorte = bloque ? "BLOQUE_INFORMATION" : motifs.length > 0 ? "REFUS" : "PASS";

  const refusees = new Set(e.revisionsDejaRefusees);
  // M5 : seul un refus de fond consomme un cycle.
  if (decision === "REFUS" && revision && refusDeFond(motifs)) refusees.add(revision);
  const cyclesApres = refusees.size;
  const cyclesEpuises = dejaEpuises || (decision === "REFUS" && cyclesApres >= e.porte.maxCycles);
  if (cyclesEpuises && !dejaEpuises) {
    motifs.push(motif("cycles_epuises", `${cyclesApres} cycle(s) de correction consommés sur ${e.porte.maxCycles} : escalade vers l'humain.`));
  }

  const empreinte = createHash("sha256")
    .update(
      canonique({
        revision,
        porte: e.porte,
        exigences: [...e.exigences].sort((a, b) => a.code.localeCompare(b.code)),
        couvertures: e.couvertures.filter((c) => c.revisionId === revision).map((c) => ({ id: c.id, etat: c.etat, preuves: c.preuves })),
        verdicts: verdictsCourants.map((v) => ({ id: v.id, verdict: v.verdict })),
        constats: [...e.constats].sort((a, b) => a.findingId.localeCompare(b.findingId)),
        // Clé ajoutée seulement s'il existe des sources : les empreintes antérieures restent identiques.
        donneesDemo:
          e.donneesDemo && e.donneesDemo.sources.length > 0
            ? {
                modeEffectif: e.donneesDemo.modeEffectif,
                sources: e.donneesDemo.sources.map((s) => ({ id: s.id, mode: s.mode, provenance: s.provenance })).sort((a, b) => a.id.localeCompare(b.id)),
                preuves: e.donneesDemo.preuves.filter((p) => p.sourceIds.length > 0).map((p) => ({ extrait: p.extrait, sourceIds: [...p.sourceIds].sort() })),
              }
            : undefined,
        // Lot R7 : clé ajoutée seulement quand la règle des connaissances s'applique.
        connaissances: e.connaissances
          ? {
              date: e.connaissances.date,
              passagesRendus: [...e.connaissances.passagesRendus].map((a) => a.toLowerCase()).sort(),
              versions: e.connaissances.versions.map((v) => ({ d: v.documentId, v: v.version, s: v.statut, du: v.valideDu, au: v.valideAu })).sort((a, b) => `${a.d}/${a.v}`.localeCompare(`${b.d}/${b.v}`)),
            }
          : undefined,
      }),
    )
    .digest("hex");

  return { decision, motifs, revisionId: revision, empreinte, cyclesEpuises, cyclesApres };
}
