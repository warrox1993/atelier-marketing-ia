/**
 * Interprétation des messages texte de l'opérateur.
 *
 * Commandes (premier mot, sans tenir compte des majuscules ni des accents) ; tout autre texte part au coordinateur
 * général par la route de l'onglet Discussion :
 *   aide · attente · voir N · approuver N [appel K] [motif] · refuser N motif · corriger N motif
 *   agents · pause agent N · reprendre agent N · services · pause service N · reprendre service N · annuler
 *   <code à 6 chiffres> : confirme la décision en attente.
 *
 * Règle : toute décision qui approuve, refuse, publie, envoie, dépense ou relance (reprise d'un agent ou d'un
 * service, qui recommence à consommer) passe par un code de confirmation à usage unique, lié à la décision et à sa
 * version ; la version est recalculée sur une lecture fraîche juste avant l'exécution. Seule la MISE EN PAUSE,
 * frein d'urgence qui n'engage rien, s'exécute sans code. Les décisions passent par les routes existantes : la garde
 * `decider` du plugin (acteur humain) s'applique exactement comme depuis l'écran.
 */
import { createHash } from "node:crypto";
import type { Agent, AppelPropose, ClientAtelier, Departement, Dossier, ElementAccueil } from "./atelier.js";
import { CodesConfirmation, VALIDITE_CODE_MS, type DecisionEnAttente } from "./codes.js";
import type { Registre } from "./journal.js";
import { estServiceSensible, LONGUEUR_RAISON_MAX, nettoyerTexteAgent, TEXTE_CONTENU_SENSIBLE } from "./nettoyage.js";

const MAX_MOTIF = 1000;
const MAX_TEXTE_DISCUSSION = 4000;
const EXTRAIT_LIVRABLE = 1500;

type ActionContenu = "approuver" | "demander_correction" | "rejeter";

export type Charge =
  | { kind: "contenu"; issueId: string; action: ActionContenu; revisionId: string; appelId: string | null; motif: string | null }
  | { kind: "approbation"; companyId: string; elementId: string; approbationId: string; accepter: boolean; motif: string | null }
  | { kind: "interaction"; companyId: string; elementId: string; issueId: string; interactionId: string; accepter: boolean; motif: string | null }
  | { kind: "liaison"; companyId: string; elementId: string; liaisonId: string; accepter: boolean; motif: string | null }
  | { kind: "agent"; agentId: string; nom: string }
  | { kind: "service"; companyId: string; nom: string };

interface ElementListe {
  companyId: string;
  service: string;
  /** Identifiant court du service (sert à reconnaître un service sensible). */
  slug: string;
  element: ElementAccueil;
}

interface Session {
  elements: ElementListe[];
  agents: Array<Agent & { service: string }>;
  services: Departement[];
}

export const normaliser = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

const empreinte = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 32);

export const AIDE = [
  "Commandes de l'atelier :",
  "• attente : ce qui attend une décision (numéroté)",
  "• voir N : le détail de l'élément N",
  "• approuver N [appel K] [motif] : approuver (avec l'appel K proposé pour une publication ou un envoi)",
  "• refuser N motif : refuser, motif obligatoire",
  "• corriger N motif : demander une correction d'un contenu",
  "• agents · pause agent N · reprendre agent N",
  "• services · pause service N · reprendre service N",
  "• annuler : abandonner la décision en attente de code",
  "Chaque décision demande un code à 6 chiffres que je vous renvoie (valable 5 min) : retapez-le pour confirmer.",
  "Tout autre message est transmis au coordinateur général.",
].join("\n");

export interface DependancesPilote {
  atelier: ClientAtelier;
  codes: CodesConfirmation<Charge>;
  registre: Registre;
  /** Entreprise Direction (repli si le client n'a pas de services déclarés). */
  entreprise: string;
  /** Vrai : le contenu des services sensibles part aussi vers Meta (WHATSAPP_CONTENU_SENSIBLE=oui). */
  contenuSensible: boolean;
}

export function creerPilote(d: DependancesPilote) {
  const sessions = new Map<string, Session>();
  const session = (numero: string): Session => {
    let s = sessions.get(numero);
    if (!s) {
      s = { elements: [], agents: [], services: [] };
      sessions.set(numero, s);
    }
    return s;
  };

  async function services(): Promise<Departement[]> {
    const deps = await d.atelier.departements().catch(() => [] as Departement[]);
    return deps.length > 0 ? deps : [{ companyId: d.entreprise, slug: "direction", nom: "Direction", estDirection: true }];
  }

  async function lireElements(): Promise<ElementListe[]> {
    const sortie: ElementListe[] = [];
    for (const s of await services()) {
      const elements = await d.atelier.accueil(s.companyId);
      for (const element of elements) sortie.push({ companyId: s.companyId, service: s.nom, slug: s.slug, element });
    }
    return sortie;
  }

  /* ---------------- versions : ce que l'opérateur a vu, recalculé avant d'exécuter ---------------- */

  const versionDossier = (dos: Dossier, appel: AppelPropose | null) =>
    empreinte({
      revisionId: dos.livrable?.revisionId ?? null,
      statut: dos.statut.statut,
      porte: dos.evaluationPorte ? [dos.evaluationPorte.decision, dos.evaluationPorte.perimee, dos.evaluationPorte.revisionId] : null,
      appel: appel ? [appel.id, appel.empreinte, appel.revisionId, appel.revisionCourante, appel.compte, appel.service, appel.outil] : null,
    });

  const versionElement = (e: ElementAccueil) =>
    empreinte({ id: e.id, type: e.type, issueId: e.issueId ?? null, approbation: e.approbation ?? null, approbationId: e.approbationId ?? null, interaction: e.interaction ?? null, liaison: e.liaison ?? null });

  const versionAgent = (a: Agent) => empreinte({ id: a.id, status: a.status });
  const versionService = (s: { id: string; status: string }) => empreinte({ id: s.id, status: s.status });

  /* ---------------- affichage ---------------- */

  const titre = (e: ElementAccueil) => nettoyerTexteAgent(e.titre);

  /** Contenu retenu : jamais envoyé à Meta pour un service sensible, sauf décision du client. */
  function masquer(l: ElementListe): boolean {
    if (d.contenuSensible) return false;
    const e = l.element;
    return estServiceSensible(l.slug) || Boolean(e.liaison && (estServiceSensible(e.liaison.serviceSource) || estServiceSensible(e.liaison.serviceCible)));
  }

  function ligneElement(i: number, e: ElementListe): string {
    const decidable = decidableSurWhatsApp(e.element) ? "" : " (à traiter dans l'atelier)";
    return `${i + 1}. [${nettoyerTexteAgent(e.service, 60)}] ${titre(e.element)} : ${nettoyerTexteAgent(e.element.raison, LONGUEUR_RAISON_MAX)}${decidable}`;
  }

  function decidableSurWhatsApp(e: ElementAccueil): boolean {
    if (e.liaison) return true;
    if (e.interaction) return e.interaction.kind === "request_confirmation" && !e.interaction.natifSeulement;
    if (e.approbationId) return e.approbation?.surPlace === true;
    return e.type === "contenu_a_valider" && Boolean(e.issueId);
  }

  async function attente(numero: string): Promise<string> {
    const elements = await lireElements();
    session(numero).elements = elements;
    if (elements.length === 0) return "Rien n'attend de décision pour le moment.";
    return [`${elements.length} élément(s) en attente :`, ...elements.map((e, i) => ligneElement(i, e)), "Détail : voir N."].join("\n");
  }

  function elementNumero(numero: string, n: number): ElementListe {
    const e = session(numero).elements[n - 1];
    if (!e) throw new ErreurPilote("Numéro inconnu : envoyez d'abord « attente » pour obtenir la liste à jour.");
    return e;
  }

  async function voir(numero: string, n: number): Promise<string> {
    const l = elementNumero(numero, n);
    const { element: e, service } = l;
    const cache = masquer(l);
    const lignes = [`${n}. [${nettoyerTexteAgent(service, 60)}] ${titre(e)}`, nettoyerTexteAgent(e.raison, LONGUEUR_RAISON_MAX)];
    if (e.type === "contenu_a_valider" && e.issueId) {
      const dos = await d.atelier.dossier(e.issueId);
      if (dos.mode === "demonstration") lignes.push("Mode démonstration.");
      lignes.push(`Statut : ${dos.statut.statut} (${nettoyerTexteAgent(dos.statut.motif, LONGUEUR_RAISON_MAX)})`);
      if (dos.livrable) {
        if (cache) lignes.push(`Révision ${dos.livrable.revisionNumber} : ${TEXTE_CONTENU_SENSIBLE}`);
        else {
          lignes.push(`Révision ${dos.livrable.revisionNumber}${dos.livrable.titre ? ` : ${dos.livrable.titre}` : ""}`);
          const corps = dos.livrable.corps;
          lignes.push("---", corps.length > EXTRAIT_LIVRABLE ? `${corps.slice(0, EXTRAIT_LIVRABLE)}… (suite dans l'atelier)` : corps, "---");
        }
      }
      const appels = (dos.appelsProposes ?? []).filter((a) => a.revisionCourante);
      if (appels.length > 0) {
        lignes.push("Appels proposés (action externe exacte) :");
        appels.forEach((a, i) => lignes.push(`  appel ${i + 1} : ${a.action} via ${nettoyerTexteAgent(a.service, 40)} (${nettoyerTexteAgent(a.outil, 40)}), compte ${nettoyerTexteAgent(a.compte, 40)}${cache ? "" : ` : ${nettoyerTexteAgent(a.apercu.resume, LONGUEUR_RAISON_MAX)}`}`));
        lignes.push("Sans « appel K », l'approbation n'autorise aucune action externe.");
      }
    } else if (cache) {
      if (e.liaison) lignes.push(`De ${nettoyerTexteAgent(e.liaison.serviceSource, 40)} vers ${nettoyerTexteAgent(e.liaison.serviceCible, 40)}`);
      lignes.push(TEXTE_CONTENU_SENSIBLE);
    } else if (e.approbation) {
      lignes.push(`Type : ${e.approbation.type} · demandeur : ${e.approbation.demandeur}`);
      e.approbation.lignes.forEach((l) => lignes.push(`${l.libelle} : ${l.valeur}`));
    } else if (e.interaction) {
      if (e.interaction.invite) lignes.push(e.interaction.invite);
      if (e.interaction.details) lignes.push(e.interaction.details);
    } else if (e.liaison) {
      lignes.push(`De ${e.liaison.serviceSource} vers ${e.liaison.serviceCible} : ${e.liaison.objet}`, e.liaison.question);
      e.liaison.extraits.forEach((x) => lignes.push(`--- ${x.titre} ---`, x.texte));
    }
    lignes.push(decidableSurWhatsApp(e) ? "Décision : approuver N, refuser N motif" + (e.type === "contenu_a_valider" ? ", corriger N motif." : ".") : "Cet élément se traite dans l'atelier (lien : " + e.lien + ").");
    return lignes.join("\n");
  }

  /* ---------------- demande de décision : prépare la charge, émet le code ---------------- */

  async function preparerDecision(numero: string, verbe: "approuver" | "refuser" | "corriger", n: number, reste: string): Promise<string> {
    const { element: e, companyId, service: serviceBrut } = elementNumero(numero, n);
    const service = nettoyerTexteAgent(serviceBrut, 60);
    const sujet = `« ${titre(e)} » [${service}]`;
    if (!decidableSurWhatsApp(e)) throw new ErreurPilote(`Cet élément se traite dans l'atelier (lien : ${e.lien}).`);
    let appelK: number | null = null;
    let motifBrut = reste;
    const m = /^appel\s+(\d{1,2})\b\s*(.*)$/is.exec(reste);
    if (m) {
      appelK = Number(m[1]);
      motifBrut = m[2] ?? "";
    }
    const motif = motifBrut.replace(/^[:\-–\s]+/, "").trim().slice(0, MAX_MOTIF) || null;
    if ((verbe === "refuser" || verbe === "corriger") && !motif) throw new ErreurPilote(`Motif obligatoire : ${verbe} ${n} <motif>.`);
    if (appelK !== null && (verbe !== "approuver" || e.type !== "contenu_a_valider")) throw new ErreurPilote("« appel K » ne s'emploie qu'avec « approuver » sur un contenu.");

    let decision: DecisionEnAttente<Charge>;
    if (e.type === "contenu_a_valider" && e.issueId) {
      const dos = await d.atelier.dossier(e.issueId);
      if (!dos.livrable) throw new ErreurPilote("Aucun livrable : rien à décider.");
      if (dos.statut.statut !== "ready_for_human") throw new ErreurPilote("Le livrable n'est pas prêt pour une validation humaine.");
      let appel: AppelPropose | null = null;
      if (appelK !== null) {
        appel = (dos.appelsProposes ?? []).filter((a) => a.revisionCourante)[appelK - 1] ?? null;
        if (!appel) throw new ErreurPilote(`Appel ${appelK} inconnu : voir ${n} liste les appels proposés.`);
      }
      const action: ActionContenu = verbe === "approuver" ? "approuver" : verbe === "corriger" ? "demander_correction" : "rejeter";
      const rev = dos.livrable.revisionNumber;
      const entete =
        action === "approuver"
          ? appel
            ? `APPROUVER ET AUTORISER : ${appel.action} via ${nettoyerTexteAgent(appel.service, 40)}, compte ${nettoyerTexteAgent(appel.compte, 40)} (appel ${appelK})`
            : "APPROUVER sans action externe"
          : action === "rejeter"
            ? "REFUSER ET REJETER (la tâche sera annulée)"
            : "DEMANDER UNE CORRECTION";
      decision = {
        cle: `contenu:${e.issueId}:${action}${appel ? `:appel:${appel.id}` : ""}`,
        version: versionDossier(dos, appel),
        entete,
        objet: `${sujet}, révision ${rev}`,
        resume: `${entete} : ${sujet} (révision ${rev})`,
        charge: { kind: "contenu", issueId: e.issueId, action, revisionId: dos.livrable.revisionId, appelId: appel?.id ?? null, motif },
      };
    } else if (verbe === "corriger") {
      throw new ErreurPilote("« corriger » ne s'emploie que pour un contenu à valider.");
    } else {
      const accepter = verbe === "approuver";
      if (!accepter && e.interaction?.refusRaisonObligatoire && !motif) throw new ErreurPilote("Motif obligatoire pour ce refus.");
      const base = { companyId, elementId: e.id, accepter, motif };
      let charge: Charge;
      if (e.liaison) charge = { kind: "liaison", ...base, liaisonId: e.liaison.liaisonId };
      else if (e.interaction && e.issueId) charge = { kind: "interaction", ...base, issueId: e.issueId, interactionId: e.interaction.id };
      else if (e.approbationId) charge = { kind: "approbation", ...base, approbationId: e.approbationId };
      else throw new ErreurPilote(`Cet élément n'a pas d'identifiant d'approbation exploitable : il se traite dans l'atelier (lien : ${e.lien}).`);
      const entete = accepter ? "APPROUVER" : "REFUSER";
      decision = { cle: `${charge.kind}:${e.id}:${accepter ? "accepter" : "refuser"}`, version: versionElement(e), entete, objet: sujet, resume: `${entete} ${sujet}`, charge };
    }
    return emettre(numero, decision);
  }

  function emettre(numero: string, decision: DecisionEnAttente<Charge>): string {
    const code = d.codes.emettre(numero, decision);
    d.registre({ type: "demande", cle: decision.cle, version: decision.version });
    return `${decision.entete}\nObjet : ${decision.objet}\nPour confirmer, renvoyez ce code : ${code}\n(valable ${VALIDITE_CODE_MS / 60000} minutes, une seule fois ; « annuler » pour abandonner)`;
  }

  /* ---------------- confirmation : relecture fraîche, version identique, exécution ---------------- */

  async function confirmer(numero: string, code: string): Promise<string> {
    const r = d.codes.verifier(numero, code);
    if (!r.ok) {
      const raisons = {
        aucune: "Aucune décision n'attend de code.",
        expire: "Code expiré : la décision est annulée, redemandez-la.",
        faux: "Code incorrect.",
        trop_essais: "Trois codes incorrects : la décision est annulée.",
      } as const;
      d.registre({ type: "refusee", cle: "code", version: null, detail: r.raison });
      return raisons[r.raison];
    }
    const dec = r.decision;
    d.registre({ type: "confirmee", cle: dec.cle, version: dec.version });
    try {
      const fait = await executer(dec);
      d.registre({ type: "executee", cle: dec.cle, version: dec.version, resultatId: fait.id ?? null });
      return fait.message;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      d.registre({ type: "echec", cle: dec.cle, version: dec.version, detail: msg.slice(0, 300) });
      return `Décision NON enregistrée : ${msg}`;
    }
  }

  const commentaire = (motif: string | null) => `Décision prise par WhatsApp (origine : whatsapp, code de confirmation vérifié)${motif ? ` : ${motif}` : "."}`;

  async function retrouverElement(companyId: string, elementId: string): Promise<ElementAccueil> {
    const e = (await d.atelier.accueil(companyId)).find((x) => x.id === elementId);
    if (!e) throw new ErreurPilote("l'élément n'attend plus de décision (déjà traité ailleurs ?).");
    return e;
  }

  async function executer(dec: DecisionEnAttente<Charge>): Promise<{ message: string; id?: string | null }> {
    const c = dec.charge;
    const changee = () => {
      throw new ErreurPilote("l'élément a changé depuis l'envoi du code (nouvelle révision ou nouvel état) : relisez-le avec « voir » puis redemandez.");
    };
    switch (c.kind) {
      case "contenu": {
        const dos = await d.atelier.dossier(c.issueId);
        const appel = c.appelId ? (dos.appelsProposes ?? []).find((a) => a.id === c.appelId) ?? null : null;
        if (c.appelId && !appel) changee();
        if (versionDossier(dos, appel) !== dec.version || dos.livrable?.revisionId !== c.revisionId) changee();
        const portee =
          c.action !== "approuver"
            ? null
            : appel
              ? {
                  // Canal = premier canal du service, comme l'écran (CANAUX_DU_SERVICE, plugin-atelier/src/ui/vues/appels.tsx :
                  // le premier canal de chaque service porte son nom) ; le plugin revérifie SERVICE_DU_CANAL.
                  revisionId: appel.revisionId, action: appel.action, canal: appel.service, compte: appel.compte, audience: null, montantMaxCents: null, dureeJours: null,
                  appel: { ...appel.approbation },
                }
              : { revisionId: c.revisionId, action: "aucune_action_externe", canal: null, compte: null, audience: null, montantMaxCents: null, dureeJours: null };
        const enregistree = await d.atelier.decider(c.issueId, { revisionId: c.revisionId, action: c.action, commentaire: commentaire(c.motif), portee });
        // Même suite que l'écran (plugin-atelier/src/ui/decision-livrable.tsx) : transition native de la tâche.
        let suite = "";
        try {
          if (c.action === "approuver") {
            await d.atelier.transitionTache(c.issueId, "done", `Approuvé dans l'atelier (WhatsApp) : ${c.motif ?? "sans commentaire"}`);
            suite = " Tâche passée à « done ».";
          } else if (c.action === "demander_correction") {
            if (enregistree?.transmission?.transmission === "coordinateur") suite = " La correction est transmise au Coordinateur.";
            else {
              await d.atelier.transitionTache(c.issueId, "in_progress", `Correction demandée dans l'atelier (WhatsApp) : ${c.motif ?? ""}`);
              suite = " La tâche repart en production.";
            }
          } else suite = " La tâche est annulée.";
        } catch (err) {
          suite = ` (Décision enregistrée, mais transition de la tâche impossible : ${err instanceof Error ? err.message : String(err)})`;
        }
        return { message: `Décision enregistrée : ${dec.resume}.${suite}`, id: enregistree?.id ?? null };
      }
      case "approbation": {
        const e = await retrouverElement(c.companyId, c.elementId);
        if (versionElement(e) !== dec.version) changee();
        await d.atelier.deciderApprobation(c.approbationId, c.accepter ? "approve" : "reject", c.motif ? commentaire(c.motif) : commentaire(null));
        return { message: `Fait : ${dec.resume}.` };
      }
      case "interaction": {
        const e = await retrouverElement(c.companyId, c.elementId);
        if (versionElement(e) !== dec.version) changee();
        await d.atelier.deciderInteraction(c.issueId, c.interactionId, c.accepter ? "accept" : "reject", c.motif);
        return { message: `Fait : ${dec.resume}.` };
      }
      case "liaison": {
        const e = await retrouverElement(c.companyId, c.elementId);
        if (versionElement(e) !== dec.version) changee();
        await d.atelier.deciderLiaison(c.companyId, c.liaisonId, c.accepter ? "approuver" : "refuser", c.motif);
        return { message: `Fait : ${dec.resume}.` };
      }
      case "agent": {
        const a = await d.atelier.agent(c.agentId);
        if (versionAgent(a) !== dec.version) changee();
        await d.atelier.pauseAgent(c.agentId, false);
        return { message: `Agent « ${c.nom} » relancé.` };
      }
      case "service": {
        const s = await d.atelier.entreprise(c.companyId);
        if (versionService(s) !== dec.version) changee();
        await d.atelier.statutEntreprise(c.companyId, "active");
        return { message: `Service « ${c.nom} » relancé.` };
      }
    }
  }

  /* ---------------- agents et services ---------------- */

  async function listerAgents(numero: string): Promise<string> {
    const liste: Array<Agent & { service: string }> = [];
    for (const s of await services()) for (const a of await d.atelier.agents(s.companyId)) if (a.status !== "terminated") liste.push({ ...a, service: s.nom });
    session(numero).agents = liste;
    if (liste.length === 0) return "Aucun agent.";
    return ["Agents :", ...liste.map((a, i) => `${i + 1}. [${a.service}] ${a.name} : ${a.status}`), "pause agent N · reprendre agent N"].join("\n");
  }

  async function listerServices(numero: string): Promise<string> {
    const liste = await services();
    session(numero).services = liste;
    const lignes: string[] = [];
    for (const [i, s] of liste.entries()) {
      const ent = await d.atelier.entreprise(s.companyId).catch(() => null);
      lignes.push(`${i + 1}. ${s.nom}${s.estDirection ? " (Direction)" : ""} : ${ent?.status ?? "état illisible"}`);
    }
    return ["Services :", ...lignes, "pause service N · reprendre service N"].join("\n");
  }

  async function pauseOuReprise(numero: string, pause: boolean, quoi: "agent" | "service", n: number): Promise<string> {
    const s = session(numero);
    if (quoi === "agent") {
      const a = s.agents[n - 1];
      if (!a) throw new ErreurPilote("Numéro inconnu : envoyez d'abord « agents ».");
      if (pause) {
        await d.atelier.pauseAgent(a.id, true);
        d.registre({ type: "executee", cle: `agent:${a.id}:pause`, version: null });
        return `Agent « ${a.name} » mis en pause.`;
      }
      const frais = await d.atelier.agent(a.id);
      if (frais.status !== "paused") throw new ErreurPilote(`L'agent « ${a.name} » n'est pas en pause (${frais.status}).`);
      return emettre(numero, { cle: `agent:${a.id}:reprendre`, version: versionAgent(frais), entete: "RELANCER L'AGENT", objet: `« ${nettoyerTexteAgent(a.name, 60)} » [${nettoyerTexteAgent(a.service, 60)}]`, resume: `relancer l'agent « ${nettoyerTexteAgent(a.name, 60)} » [${nettoyerTexteAgent(a.service, 60)}]`, charge: { kind: "agent", agentId: a.id, nom: a.name } });
    }
    const svc = s.services[n - 1];
    if (!svc) throw new ErreurPilote("Numéro inconnu : envoyez d'abord « services ».");
    if (pause) {
      await d.atelier.statutEntreprise(svc.companyId, "paused");
      d.registre({ type: "executee", cle: `service:${svc.companyId}:pause`, version: null });
      return `Service « ${svc.nom} » mis en pause (ses agents ne sont plus réveillés).`;
    }
    const frais = await d.atelier.entreprise(svc.companyId);
    if (frais.status !== "paused") throw new ErreurPilote(`Le service « ${svc.nom} » n'est pas en pause (${frais.status}).`);
    return emettre(numero, { cle: `service:${svc.companyId}:reprendre`, version: versionService(frais), entete: "RELANCER LE SERVICE", objet: `« ${nettoyerTexteAgent(svc.nom, 60)} »`, resume: `relancer le service « ${nettoyerTexteAgent(svc.nom, 60)} »`, charge: { kind: "service", companyId: svc.companyId, nom: svc.nom } });
  }

  /* ---------------- aiguillage ---------------- */

  async function traiter(numero: string, texteBrut: string): Promise<string> {
    const texte = texteBrut.trim();
    if (!texte) return AIDE;
    const n = normaliser(texte);
    try {
      if (/^\d{6}$/.test(n)) return await confirmer(numero, n);
      if (n === "aide" || n === "?" || n === "menu") return AIDE;
      if (n === "annuler") return d.codes.annuler(numero) ? "Décision en attente annulée." : "Aucune décision en attente.";
      if (n === "attente" || n === "a faire" || n === "liste") return await attente(numero);
      if (n === "agents") return await listerAgents(numero);
      if (n === "services") return await listerServices(numero);
      let m = /^voir\s+(\d{1,3})$/.exec(n);
      if (m) return await voir(numero, Number(m[1]));
      m = /^(pause|reprendre)\s+(agent|service)\s+(\d{1,3})$/.exec(n);
      if (m) return await pauseOuReprise(numero, m[1] === "pause", m[2] as "agent" | "service", Number(m[3]));
      // Le motif garde la casse et les accents d'origine : seul le début est reconnu sur la forme normalisée.
      m = /^(approuver|refuser|corriger)\s+(\d{1,3})\b/.exec(n);
      if (m) {
        const apres = texte.replace(/^\S+\s+\d{1,3}/u, "").trim();
        return await preparerDecision(numero, m[1] as "approuver" | "refuser" | "corriger", Number(m[2]), apres);
      }
      if (/^(approuver|refuser|corriger|voir|pause|reprendre)\b/.test(n)) return `Commande incomplète.\n${AIDE}`;
    } catch (err) {
      if (err instanceof ErreurPilote) return err.message;
      return `Impossible pour le moment : ${err instanceof Error ? err.message : String(err)}`;
    }
    // Conversation : même chemin que l'onglet Discussion (route `discussion.envoyer`).
    if (texte.length > MAX_TEXTE_DISCUSSION) return `Message trop long pour le coordinateur (${MAX_TEXTE_DISCUSSION} caractères au plus).`;
    try {
      await d.atelier.envoyerDiscussion(texte);
      return "Transmis au coordinateur général.";
    } catch (err) {
      return `Message non transmis au coordinateur : ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  return { traiter };
}

export class ErreurPilote extends Error {}
