// Dépôt d'un envoi de formulaire dans l'atelier : prospect créé par la route EXISTANTE du plugin
// (POST /prospects/particuliers, origine « formulaire_entrant », preuve de consentement jointe), puis tâche
// « Rappeler sous 24 h » pour l'agent Prospection par l'API native de Paperclip.
// Identité : en mode local_trusted, une requête sans jeton est le « board » humain local ; sinon ATELIER_CLE_BOARD.

import type { PageDestination } from "./magasin.js";

export interface ReglagesAtelier {
  api: string;
  plugin: string;
  cleBoard: string | null;
  /** Adresse publique de base des pages (pour la source de la preuve de consentement). */
  urlPages: string;
}

export interface EnvoiVisiteur {
  nom: string;
  telephone: string;
  courriel: string | null;
  creneau: string;
  libelleCreneau: string;
  envoiId: string;
  ipTronquee: string;
  recuLe: Date;
}

export interface ResultatDepot {
  prospectId: string;
  nouveau: boolean;
  tacheId: string | null;
  tacheErreur: string | null;
}

export class ErreurDepot extends Error {
  constructor(message: string, readonly statut: number | null) {
    super(message);
  }
}

type Appel = typeof fetch;

export class DepotAtelier {
  private agentProspection = new Map<string, string | null>();

  constructor(
    private readonly r: ReglagesAtelier,
    private readonly f: Appel = fetch,
  ) {}

  private async appel<T>(methode: string, url: string, corps?: unknown): Promise<{ statut: number; json: T }> {
    const entetes: Record<string, string> = { accept: "application/json" };
    if (corps !== undefined) entetes["content-type"] = "application/json";
    if (this.r.cleBoard) entetes["authorization"] = `Bearer ${this.r.cleBoard}`;
    const rep = await this.f(url, { method: methode, headers: entetes, ...(corps !== undefined ? { body: JSON.stringify(corps) } : {}), signal: AbortSignal.timeout(30_000), redirect: "error" });
    const texte = await rep.text();
    let json: unknown = null;
    try {
      json = texte ? JSON.parse(texte) : null;
    } catch {
      json = null;
    }
    if (!rep.ok) {
      const detail = typeof json === "object" && json !== null ? String((json as Record<string, unknown>)["message"] ?? (json as Record<string, unknown>)["erreur"] ?? "") : "";
      throw new ErreurDepot(`Atelier : HTTP ${rep.status}${detail ? ` : ${detail.slice(0, 200)}` : ""}`, rep.status);
    }
    return { statut: rep.status, json: json as T };
  }

  /** Corps envoyé à `prospects.particuliers.enregistrer` (exposé pour les tests). */
  corpsProspect(page: PageDestination, e: EnvoiVisiteur): Record<string, unknown> {
    const canaux = e.courriel ? ["telephone", "courriel"] : ["telephone"];
    return {
      companyId: page.entrepriseId,
      referentiel: { version: 1 },
      coordonnees: { nom: e.nom, courriel: e.courriel, telephone: e.telephone, adresse: null },
      zone: { codePostal: null, commune: null, province: null, region: null, pays: "BE" },
      origine: "formulaire_entrant",
      consentements: [
        {
          date: e.recuLe.toISOString(),
          texteAccepte: page.texteConsentement,
          source: `${this.r.urlPages.replace(/\/+$/u, "")}/p/${page.slug}`,
          canauxAutorises: canaux,
          responsableNomme: page.responsable,
          // Preuve : envoi, page, adresse IP tronquée et nature du numéro (donné par la personne elle-même dans ce formulaire).
          reference: `envoi ${e.envoiId} · page ${page.slug} · IP ${e.ipTronquee} · numéro de téléphone donné par la personne`,
          retireLe: null,
          // Champs structurés du registre des consentements (l'adresse « inconnue » n'est pas transmise).
          pageCaptation: `${this.r.urlPages.replace(/\/+$/u, "")}/p/${page.slug}`,
          ...(e.ipTronquee === "inconnue" ? {} : { adresseIpTronquee: e.ipTronquee }),
        },
      ],
    };
  }

  private async idAgentProspection(companyId: string): Promise<string | null> {
    if (this.agentProspection.has(companyId)) return this.agentProspection.get(companyId) ?? null;
    const { json } = await this.appel<Array<{ id: string; name: string; status: string }>>("GET", `${this.r.api}/companies/${encodeURIComponent(companyId)}/agents`);
    const agent = (Array.isArray(json) ? json : []).find((a) => a.name === "Prospection" && a.status !== "terminated");
    this.agentProspection.set(companyId, agent?.id ?? null);
    return agent?.id ?? null;
  }

  async deposer(page: PageDestination, e: EnvoiVisiteur): Promise<ResultatDepot> {
    const url = `${this.r.api}/plugins/${encodeURIComponent(this.r.plugin)}/api/prospects/particuliers`;
    const { statut, json } = await this.appel<{ id?: string }>("POST", url, this.corpsProspect(page, e));
    const prospectId = json?.id;
    if (typeof prospectId !== "string") throw new ErreurDepot("Atelier : réponse sans identifiant de prospect.", statut);
    // Tâche pour la Prospection. Un échec ici ne perd pas le prospect (déjà créé) : il est signalé à l'appelant.
    let tacheId: string | null = null;
    let tacheErreur: string | null = null;
    try {
      const agentId = await this.idAgentProspection(page.entrepriseId);
      const echeance = new Date(e.recuLe.getTime() + 24 * 3600 * 1000);
      const description = [
        `Une personne a demandé à être rappelée depuis la page de destination « ${page.titre} » (offre : ${page.offreIntitule}).`,
        "",
        `- À faire : rappeler sous 24 h, avant le ${echeance.toISOString()}.`,
        `- Créneau préféré : ${e.libelleCreneau}.`,
        `- Fiche : prospect ${prospectId} (origine « formulaire », consentement prouvé, numéro donné par la personne elle-même).`,
        "- Les coordonnées sont chiffrées dans la fiche du prospect ; ne les recopie dans aucune tâche ni aucun commentaire.",
        `- Page : ${page.slug}. Responsable du traitement : ${page.responsable}.`,
      ].join("\n");
      const tache = await this.appel<{ id?: string }>("POST", `${this.r.api}/companies/${encodeURIComponent(page.entrepriseId)}/issues`, {
        title: `Rappeler sous 24 h : prospect de la page « ${page.titre} »`,
        description,
        status: "todo",
        priority: "high",
        ...(agentId ? { assigneeAgentId: agentId } : {}),
      });
      tacheId = typeof tache.json?.id === "string" ? tache.json.id : null;
    } catch (err) {
      tacheErreur = err instanceof Error ? err.message : String(err);
    }
    return { prospectId, nouveau: statut === 201, tacheId, tacheErreur };
  }
}
