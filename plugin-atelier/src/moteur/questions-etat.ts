/**
 * Chat sans modèle (#50, tâche 2) : reconnaissance stricte des questions d'état et des demandes de contenu, et réponses
 * d'état tirées de la base. Aucun modèle, aucune invention : en cas de doute, `null` et le message part vers le modèle.
 */
import type { BaseAtelier, Mission } from "../serveur/base.js";

export type QuestionEtat = "avancement" | "en_attente" | "cout";

/** Minuscules, sans accents, apostrophes droites, tirets et ponctuation retirés : les motifs ne voient qu'une forme. */
function normaliser(texte: string): string {
  return texte
    .normalize("NFD").replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[‘’ʼ`]/g, "'")
    .replace(/[-‐-―]/g, " ")
    .replace(/[^a-z0-9' ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const DET = "(?:la |les |ma |mes |notre |nos |cette |ces |l')";
const MOTIFS: Array<[QuestionEtat, RegExp]> = [
  ["avancement", new RegExp(`^ou en (?:(?:est on|sommes nous)|(?:est|sont) ${DET}?missions?)$`)],
  ["avancement", new RegExp(`^(?:quel est )?l'?(?:etat|avancement) (?:de |des |d')?${DET}?missions?$`)],
  ["en_attente", /^qu'?est ce qui (?:attend|est en attente)(?: de moi)?$/],
  ["en_attente", /^qu'attend on$/],
  ["cout", /^combien (?:ca|cela) (?:a )?coute(?: jusqu'ici| pour l'instant)?$/],
  ["cout", new RegExp(`^combien a coute ${DET}?missions?$`)],
  ["cout", new RegExp(`^quel est le cout (?:de |des |d')?${DET}?missions?$`)],
];

/** Type de la question d'état posée, ou `null` : seules les phrases courtes qui épousent un motif sont reconnues. */
export function reconnaitreQuestionEtat(texte: string): QuestionEtat | null {
  const t = normaliser(texte);
  return MOTIFS.find(([, m]) => m.test(t))?.[0] ?? null;
}

export type TypeLivrable = "post" | "article" | "newsletter";
const CANAUX = ["linkedin", "instagram", "facebook", "tiktok"] as const;

/** Demande « écris, rédige, prépare » un post, un article ou une newsletter ; seuls le type et le canal NOMMÉS sont déduits. */
export function reconnaitreDemandeContenu(texte: string): { typeLivrable: TypeLivrable; canal?: string } | null {
  const t = normaliser(texte);
  // Le type suit directement le verbe (et un éventuel « moi » ou article) : « écris à Marie que l'article… » n'en est pas une.
  const type = /^(?:(?:peux tu|pourrais tu|tu peux|veux tu) )?(?:m')?(?:ecris|ecrire|redige|rediger|prepare|preparer)(?: moi)? (?:un |une |le |la |l')?(post|article|newsletter)\b/.exec(t)?.[1] as TypeLivrable | undefined;
  if (!type) return null;
  const canal = CANAUX.find((c) => new RegExp(`\\b${c}\\b`).test(t));
  return { typeLivrable: type, ...(canal ? { canal } : {}) };
}

type BaseEtat = Pick<BaseAtelier, "missionsActives" | "lireEtapes" | "coutsEntreprise">;

const LIBELLE_ETAT: Record<Mission["etat"], string> = {
  prete: "prête à démarrer", en_cours: "en cours", en_revue: "en revue", attente_autorisation: "attend une autorisation", en_execution: "en exécution",
  resultat_confirme: "résultat confirmé", attente_information: "attend une information", blocage: "bloquée", pause: "en pause",
  cloturee: "clôturée", annulee: "annulée", echec: "en échec",
};
const ATTENDENT: Array<Mission["etat"]> = ["attente_information", "attente_autorisation", "en_revue", "blocage"];
const euros = (cents: number) => `${(cents / 100).toFixed(2).replace(".", ",")} €`;
const extrait = (m: string) => (m.length > 80 ? `${m.slice(0, 80).trimEnd()}…` : m);

async function ligne(base: BaseEtat, m: Mission): Promise<string> {
  const etape = (await base.lireEtapes(m.companyId, m.id)).filter((e) => e.rang === Math.max(1, m.rangCourant)).at(-1);
  return `- « ${extrait(m.mandat)} » : ${LIBELLE_ETAT[m.etat]}${etape ? ` (étape ${etape.rang}, ${etape.role})` : ""}`;
}

/** Réponse à une question d'état, lue dans la base : jamais d'invention, une limite est dite plutôt qu'un zéro. */
export async function repondreEtat(type: QuestionEtat, base: BaseEtat, companyId: string): Promise<string> {
  const actives = await base.missionsActives(companyId);
  if (type === "cout") {
    const { totalCents, evenements } = await base.coutsEntreprise(companyId);
    if (evenements === 0) return "Aucun coût n'est enregistré pour cette entreprise : je ne peux pas le chiffrer.";
    return `Coût enregistré pour l'entreprise : ${euros(totalCents)} sur ${evenements} événement(s) de coût. Le coût propre à chaque mission n'est pas enregistré séparément : je ne peux pas le détailler par mission.`;
  }
  if (actives.length === 0) return "Aucune mission n'est en cours pour cette entreprise.";
  const retenues = type === "avancement" ? actives : actives.filter((m) => ATTENDENT.includes(m.etat));
  if (retenues.length === 0) return `Aucune mission n'attend quoi que ce soit parmi les ${actives.length} en cours.`;
  const lignes = await Promise.all(retenues.map((m) => ligne(base, m)));
  return `${type === "avancement" ? "Missions en cours" : "Missions qui attendent"} (${retenues.length}) :\n${lignes.join("\n")}`;
}
