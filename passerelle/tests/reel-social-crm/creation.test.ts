// Outils de création de contacts (crm_creer_contact, pipedrive_creer_personne, teamleader_creer_contact, odoo_creer_lead) :
// jamais sans preuve d'approbation, une seule fois avec preuve, aucun doublon après un arrêt au milieu d'un lot,
// et la coordonnée réelle ne sort jamais dans la réponse ni dans un message d'erreur.

import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appeler, clientMcp, connecter, listeRevocations, monter, preuve, type Montage } from "./aide.js";
import { CLE_API_ODOO } from "./faux-plateformes.js";

// Identifiant de connexion de l'instance Odoo 17 du faux serveur (repli execute_kw).
const IDENTIFIANT_ODOO17 = "jean@exemple.invalid";

type Contact = { reference: string; denomination: string | null; numero_bce: string | null; code_postal: string | null; commune: string | null; canal: string; coordonnee: string | null; entite: string | null };
type Injection = "passe" | "coupure" | "coupure_apres_effet";

interface Cas {
  nom: string;
  service: string;
  outil: string;
  client: () => Client;
  /** Enregistrements créés, tels que le faux serveur les a reçus. */
  creations: () => Record<string, unknown>[];
  appelsCreation: () => number;
  appelsTotal: () => number;
  /** Courriel déjà présent dans le faux serveur. */
  courrielExistant: string;
  attendu: (c: Contact) => Record<string, unknown>;
  attenduTelephone: (c: Contact) => Record<string, unknown>;
  injecterCreation: (...r: Injection[]) => void;
  injecterRechercheEnPanne: () => void;
  /** Refus de la création par la plateforme, dont le message répète ce qu'elle a reçu (`echo`). */
  injecterRefusCreation: (echo: string) => void;
  /** Limite de débit (429) sur la prochaine création, avec un Retry-After de `secondes`. */
  injecterLimiteCreation: (secondes: number) => void;
  /** La prochaine recherche répond 200 sans le champ attendu (`{}`). */
  injecterRechercheVide: () => void;
}

let m: Montage;
const clients = new Map<string, Client>();
beforeAll(async () => {
  m = await monter();
  for (const [service, options] of [
    ["crm", {}],
    ["pipedrive", { oauthDepuisPage: true }],
    ["odoo", { formulaire: { instance: m.odoo19.base, cle: CLE_API_ODOO, base: "", identifiant: "" } }],
    ["teamleader", {}],
  ] as const) {
    const { jetons } = await connecter(m, service, options);
    clients.set(service, await clientMcp(m, service, jetons.access_token));
  }
  const { jetons } = await connecter(m, "odoo", { formulaire: { instance: m.odoo17.base, cle: CLE_API_ODOO, base: "demo17", identifiant: IDENTIFIANT_ODOO17 } });
  clients.set("odoo17", await clientMcp(m, "odoo", jetons.access_token));
});
afterAll(async () => {
  for (const c of clients.values()) await c.close();
  await m.arreter();
});

const HS = "/hubspot-api/crm/v3/objects/contacts";
const PD = "/pipedrive-societe/acme/api/v2/persons";
const effetsFaux = (type: string): Record<string, unknown>[] => m.faux.effets.filter((e) => e.type === type).map((e) => e.donnees);
const creationsOdoo = (o: Montage["odoo19"]): Record<string, unknown>[] => o.effets.filter((e) => "creation" in e).map((e) => e["creation"] as Record<string, unknown>);
const appelsOdoo17Create = (): number => m.odoo17.appels.filter((a) => a.chemin === "/jsonrpc" && (JSON.parse(a.corps) as { params: { args: unknown[] } }).params.args[4] === "create").length;

const CAS: Cas[] = [
  {
    nom: "HubSpot", service: "crm", outil: "crm_creer_contact", client: () => clients.get("crm")!,
    creations: () => effetsFaux("hubspot_creation"),
    appelsCreation: () => m.faux.appelsVers(`POST ${HS}`).filter((a) => a.chemin === HS).length,
    appelsTotal: () => m.faux.appels.length,
    courrielExistant: "client1@exemple.invalid",
    attendu: (c) => ({ email: c.coordonnee, lastname: c.denomination, city: c.commune, zip: c.code_postal }),
    attenduTelephone: (c) => ({ phone: c.coordonnee, lastname: c.denomination }),
    injecterCreation: (...r) => m.faux.injecter(`POST ${HS}$`, ...r),
    injecterRechercheEnPanne: () => m.faux.injecter(`POST ${HS}/search`, { statut: 500, corps: { status: "error", message: "panne" } }),
    injecterRefusCreation: (echo) => m.faux.injecter(`POST ${HS}$`, { statut: 400, corps: { status: "error", message: `Valeur refusée : ${echo}` } }),
    injecterLimiteCreation: (s) => m.faux.injecter(`POST ${HS}$`, { statut: 429, entetes: { "retry-after": String(s) }, corps: { status: "error", message: "Limite atteinte", policyName: "TEN_SECONDLY_ROLLING" } }),
    injecterRechercheVide: () => m.faux.injecter(`POST ${HS}/search`, { statut: 200, corps: {} }),
  },
  {
    nom: "Pipedrive", service: "pipedrive", outil: "pipedrive_creer_personne", client: () => clients.get("pipedrive")!,
    creations: () => effetsFaux("pipedrive_creation"),
    appelsCreation: () => m.faux.appels.filter((a) => a.methode === "POST" && a.chemin === PD).length,
    appelsTotal: () => m.faux.appels.length,
    courrielExistant: "alice@exemple.invalid",
    attendu: (c) => ({ name: c.denomination, emails: [{ value: c.coordonnee, primary: true }] }),
    attenduTelephone: (c) => ({ name: c.denomination, phones: [{ value: c.coordonnee, primary: true }] }),
    injecterCreation: (...r) => m.faux.injecter(`POST ${PD}$`, ...r),
    injecterRechercheEnPanne: () => m.faux.injecter(`GET ${PD}/search`, { statut: 500, corps: { success: false, error: "panne" } }),
    injecterRefusCreation: (echo) => m.faux.injecter(`POST ${PD}$`, { statut: 400, corps: { success: false, error: `Valeur refusée : ${echo}` } }),
    injecterLimiteCreation: (s) => m.faux.injecter(`POST ${PD}$`, { statut: 429, entetes: { "retry-after": String(s) }, corps: { success: false, error: "Limite atteinte" } }),
    injecterRechercheVide: () => m.faux.injecter(`GET ${PD}/search`, { statut: 200, corps: {} }),
  },
  {
    nom: "Teamleader", service: "teamleader", outil: "teamleader_creer_contact", client: () => clients.get("teamleader")!,
    creations: () => effetsFaux("teamleader_creation"),
    appelsCreation: () => m.faux.appelsVers("POST /teamleader-api/contacts.add").length,
    appelsTotal: () => m.faux.appels.length,
    courrielExistant: "tl1@exemple.invalid",
    attendu: (c) => ({ last_name: c.denomination, emails: [{ type: "primary", email: c.coordonnee }] }),
    attenduTelephone: (c) => ({ last_name: c.denomination, telephones: [{ type: "phone", number: c.coordonnee }] }),
    injecterCreation: (...r) => m.faux.injecter("POST /teamleader-api/contacts.add", ...r),
    injecterRechercheEnPanne: () => m.faux.injecter("POST /teamleader-api/contacts.list", { statut: 500, corps: { errors: [{ title: "panne", status: 500 }] } }),
    injecterRefusCreation: (echo) => m.faux.injecter("POST /teamleader-api/contacts.add", { statut: 400, corps: { errors: [{ title: `Valeur refusée : ${echo}`, status: 400 }] } }),
    injecterLimiteCreation: (s) => m.faux.injecter("POST /teamleader-api/contacts.add", { statut: 429, entetes: { "retry-after": String(s) }, corps: { errors: [{ title: "Too Many Requests", status: 429 }] } }),
    injecterRechercheVide: () => m.faux.injecter("POST /teamleader-api/contacts.list", { statut: 200, corps: {} }),
  },
  {
    nom: "Odoo 19 (JSON-2)", service: "odoo", outil: "odoo_creer_lead", client: () => clients.get("odoo")!,
    creations: () => creationsOdoo(m.odoo19),
    appelsCreation: () => m.odoo19.appels.filter((a) => a.chemin === "/json/2/crm.lead/create").length,
    appelsTotal: () => m.odoo19.appels.length,
    courrielExistant: "alice@exemple.invalid",
    attendu: (c) => ({ name: c.denomination, partner_name: c.denomination, email_from: c.coordonnee, zip: c.code_postal, city: c.commune }),
    attenduTelephone: (c) => ({ name: c.denomination, phone: c.coordonnee }),
    injecterCreation: (...r) => m.odoo19.injecter("create", ...r),
    injecterRechercheEnPanne: () => m.odoo19.injecter("search_read", "erreur"),
    injecterRefusCreation: () => m.odoo19.injecter("create", "refus"),
    injecterLimiteCreation: (s) => m.odoo19.injecter("create", `limite_${s}`),
    injecterRechercheVide: () => m.odoo19.injecter("search_read", "vide"),
  },
  {
    nom: "Odoo 17 (repli execute_kw)", service: "odoo", outil: "odoo_creer_lead", client: () => clients.get("odoo17")!,
    creations: () => creationsOdoo(m.odoo17),
    appelsCreation: appelsOdoo17Create,
    appelsTotal: () => m.odoo17.appels.length,
    courrielExistant: "alice@exemple.invalid",
    attendu: (c) => ({ name: c.denomination, partner_name: c.denomination, email_from: c.coordonnee, zip: c.code_postal, city: c.commune }),
    attenduTelephone: (c) => ({ name: c.denomination, phone: c.coordonnee }),
    injecterCreation: (...r) => m.odoo17.injecter("create", ...r),
    injecterRechercheEnPanne: () => m.odoo17.injecter("search_read", "erreur"),
    injecterRefusCreation: () => m.odoo17.injecter("create", "refus"),
    injecterLimiteCreation: (s) => m.odoo17.injecter("create", `limite_${s}`),
    injecterRechercheVide: () => m.odoo17.injecter("search_read", "vide"),
  },
];

let serie = 0;
/** `n` contacts neufs (courriel par défaut), uniques dans tout le fichier. */
function lot(n: number, extra: Partial<Contact> = {}): Contact[] {
  serie++;
  return Array.from({ length: n }, (_, i) => ({
    reference: `ref-${serie}-${i}`, denomination: `Société ${serie} ${i}`, numero_bce: "0123.456.789", code_postal: "4000", commune: "Liège",
    canal: "courriel", coordonnee: `prospect${serie}x${i}@exemple.invalid`, entite: "entreprise", ...extra,
  }));
}

const appelerCreation = (cas: Cas, contacts: Contact[], p?: string, args: Record<string, unknown> = { contacts }) =>
  appeler(cas.client(), cas.outil, { ...args, ...(p === undefined ? {} : { preuve_approbation: p, revocations_approbation: listeRevocations(m) }) });
const signer = (cas: Cas, contacts: Contact[]): string => preuve(m, cas.service, cas.outil, { contacts });

describe.each(CAS)("$nom : création de contacts", (cas) => {
  it("sans preuve : préparée, aucun appel au faux CRM, parametres sans coordonnée", async () => {
    const contacts = lot(2);
    const avant = cas.appelsTotal();
    const r = await appelerCreation(cas, contacts);
    expect(r.erreur, r.texte).toBe(false);
    expect(r.donnees).toMatchObject({ etat: "preparee", executee: false, approbation_humaine_requise: true, action: { service: cas.service, outil: cas.outil, parametres: { contacts: 2 } } });
    expect(JSON.stringify(r.donnees)).not.toContain("exemple.invalid");
    expect(cas.appelsTotal()).toBe(avant);
  });

  it("avec preuve : contact créé avec sa vraie coordonnée, réponse sans coordonnée", async () => {
    const contacts = lot(1);
    const avant = cas.creations().length;
    const r = await appelerCreation(cas, contacts, signer(cas, contacts));
    expect(r.erreur, r.texte).toBe(false);
    expect(r.donnees).toMatchObject({
      etat: "executee", executee: true, rejeu: false,
      action: { parametres: { contacts: 1 } },
      resultat: { crees: [{ reference: contacts[0]!.reference, id: expect.any(String) }], existants: [] },
    });
    expect(cas.creations()).toHaveLength(avant + 1);
    expect(cas.creations().at(-1)).toMatchObject(cas.attendu(contacts[0]!));
    expect(r.texte).not.toContain(contacts[0]!.coordonnee!);
  });

  it("canal téléphone : la coordonnée part dans le champ téléphone", async () => {
    const contacts = lot(1, { canal: "telephone" }).map((c) => ({ ...c, coordonnee: `+32 4 000 ${String(serie).padStart(2, "0")} 01` }));
    const r = await appelerCreation(cas, contacts, signer(cas, contacts));
    expect(r.donnees, r.texte).toMatchObject({ etat: "executee" });
    expect(cas.creations().at(-1)).toMatchObject(cas.attenduTelephone(contacts[0]!));
    expect(JSON.stringify(cas.creations().at(-1))).not.toContain("@");
  });

  it("rejeu de la même clé : aucun nouvel appel", async () => {
    const contacts = lot(2);
    const p = signer(cas, contacts);
    const r1 = await appelerCreation(cas, contacts, p);
    expect(r1.donnees.etat).toBe("executee");
    const avant = cas.appelsTotal();
    const r2 = await appelerCreation(cas, contacts, p);
    expect(r2.donnees).toMatchObject({ etat: "executee", rejeu: true, resultat: r1.donnees.resultat });
    expect(cas.appelsTotal()).toBe(avant);
  });

  it("contact déjà présent (même coordonnée) : dans existants, pas de création", async () => {
    const [neuf] = lot(1);
    const present = { ...lot(1)[0]!, coordonnee: cas.courrielExistant };
    const contacts = [present, neuf!];
    const avantCreations = cas.creations().length;
    const r = await appelerCreation(cas, contacts, signer(cas, contacts));
    expect(r.donnees, r.texte).toMatchObject({ etat: "executee", resultat: { crees: [{ reference: neuf!.reference }], existants: [{ reference: present.reference, id: expect.any(String) }] } });
    expect(cas.creations()).toHaveLength(avantCreations + 1);
  });

  it("sans coordonnée : recherche par dénomination et code postal, pas de doublon au second passage", async () => {
    const contacts = lot(1, { coordonnee: null });
    const r1 = await appelerCreation(cas, contacts, signer(cas, contacts));
    expect(r1.donnees, r1.texte).toMatchObject({ etat: "executee", resultat: { crees: [{ reference: contacts[0]!.reference }], existants: [] } });
    const avant = cas.creations().length;
    const r2 = await appelerCreation(cas, contacts, signer(cas, contacts)); // autre clé d'approbation, mêmes contacts
    expect(r2.donnees, r2.texte).toMatchObject({ etat: "executee", rejeu: false, resultat: { crees: [], existants: [{ reference: contacts[0]!.reference }] } });
    expect(cas.creations()).toHaveLength(avant);
  });

  it("arrêt au milieu d'un lot (2e création : effet puis connexion perdue) puis nouvel essai : aucun doublon", async () => {
    const contacts = lot(3);
    const p = signer(cas, contacts);
    const avant = cas.creations().length;
    cas.injecterCreation("passe", "coupure_apres_effet");
    const r1 = await appelerCreation(cas, contacts, p);
    expect(r1.donnees.etat).toBe("ambigue_a_reconcilier");
    expect(cas.creations()).toHaveLength(avant + 2);
    const r2 = await appelerCreation(cas, contacts, p);
    expect(r2.donnees, r2.texte).toMatchObject({ etat: "executee", rejeu: false });
    const resultat = r2.donnees["resultat"] as { crees: { reference: string }[]; existants: { reference: string }[] };
    expect([...resultat.crees, ...resultat.existants].map((x) => x.reference).sort()).toEqual(contacts.map((c) => c.reference).sort());
    expect(cas.creations()).toHaveLength(avant + 3);
    const courriels = cas.creations().slice(avant).map((e) => JSON.stringify(e));
    for (const c of contacts) expect(courriels.filter((j) => j.includes(c.coordonnee!))).toHaveLength(1);
  });

  it("réponse incertaine puis recherche impossible : ambigue_a_reconcilier, rien n'est renvoyé", async () => {
    const contacts = lot(1);
    const p = signer(cas, contacts);
    const avant = cas.appelsCreation();
    cas.injecterCreation("coupure");
    expect((await appelerCreation(cas, contacts, p)).donnees.etat).toBe("ambigue_a_reconcilier");
    cas.injecterRechercheEnPanne();
    const r2 = await appelerCreation(cas, contacts, p);
    expect(r2.donnees.etat).toBe("ambigue_a_reconcilier");
    expect(r2.donnees["message"]).toMatch(/Vérifier à la main/);
    expect(cas.appelsCreation()).toBe(avant + 1);
  });

  it("preuve signée pour une autre coordonnée : refus, rien d'écrit", async () => {
    const [signe] = lot(1);
    const demande = { ...signe!, coordonnee: "autre.personne@exemple.invalid" };
    const avant = cas.appelsTotal();
    const r = await appelerCreation(cas, [demande], signer(cas, [signe!]));
    expect(r.donnees).toMatchObject({ etat: "preparee", executee: false });
    expect(r.donnees["message"]).toMatch(/contenu demandé diffère/);
    expect(cas.appelsTotal()).toBe(avant);
  });

  it("refus de la plateforme qui répète la coordonnée : jamais dans le message renvoyé ni dans le journal", async () => {
    const contacts = lot(1);
    cas.injecterRefusCreation(contacts[0]!.coordonnee!);
    const r = await appelerCreation(cas, contacts, signer(cas, contacts));
    expect(r.erreur || r.donnees.etat === "ambigue_a_reconcilier", r.texte).toBe(true);
    expect(r.texte).not.toContain("outil_inconnu");
    expect(r.texte).not.toContain(contacts[0]!.coordonnee!);
    expect(m.journal.join("\n")).not.toContain(contacts[0]!.coordonnee!);
  });

  it("lot partiellement créé puis 2e contact refusé (400) : ambigu et non échoué, le nouvel essai ne crée que le reste", async () => {
    const contacts = lot(3);
    const p = signer(cas, contacts);
    const avant = cas.creations().length;
    cas.injecterCreation("passe");
    cas.injecterRefusCreation("x");
    const r1 = await appelerCreation(cas, contacts, p);
    expect(r1.erreur, r1.texte).toBe(false);
    expect(r1.donnees.etat).toBe("ambigue_a_reconcilier");
    expect(cas.creations()).toHaveLength(avant + 1);
    const r2 = await appelerCreation(cas, contacts, p);
    expect(r2.donnees, r2.texte).toMatchObject({ etat: "executee" });
    expect(cas.creations()).toHaveLength(avant + 3);
  });

  it("lot partiellement créé puis 429 trop long au 2e contact : ambigu, même chemin", async () => {
    const contacts = lot(3);
    const avant = cas.creations().length;
    cas.injecterCreation("passe");
    cas.injecterLimiteCreation(3600);
    const r = await appelerCreation(cas, contacts, signer(cas, contacts));
    expect(r.erreur, r.texte).toBe(false);
    expect(r.donnees.etat).toBe("ambigue_a_reconcilier");
    expect(cas.creations()).toHaveLength(avant + 1);
  });

  it("429 court au 2e contact : attente sous le plafond, même contact renvoyé, aucun doublon", async () => {
    const contacts = lot(3);
    const avant = cas.creations().length;
    const appelsAvant = cas.appelsCreation();
    const attentesAvant = m.attentes.length;
    cas.injecterCreation("passe");
    cas.injecterLimiteCreation(2);
    const r = await appelerCreation(cas, contacts, signer(cas, contacts));
    expect(r.donnees, r.texte).toMatchObject({ etat: "executee" });
    expect(m.attentes.slice(attentesAvant)).toEqual([2000]);
    expect(cas.creations()).toHaveLength(avant + 3);
    expect(cas.appelsCreation()).toBe(appelsAvant + 4);
  });

  it("refus qui répète nom et courriel en casse différente : ni l'un ni l'autre dans le message, la référence y est", async () => {
    const [c] = lot(1, { denomination: "Camille Particuliere", coordonnee: "CAMILLE@exemple.test" });
    cas.injecterRefusCreation("Camille Particuliere <camille@exemple.test>");
    const r = await appelerCreation(cas, [c!], signer(cas, [c!]));
    expect(r.erreur, r.texte).toBe(true);
    const minuscules = r.texte.toLowerCase();
    expect(minuscules).not.toContain("camille");
    expect(minuscules).not.toContain("exemple.test");
    expect(r.texte).toContain(c!.reference);
    expect(m.journal.join("\n").toLowerCase()).not.toContain("camille");
  });

  it("recherche en 200 sans le champ attendu : aucune création (résultat incertain, pas « absent »)", async () => {
    const contacts = lot(1, { coordonnee: cas.courrielExistant });
    const avant = cas.appelsCreation();
    cas.injecterRechercheVide();
    const r = await appelerCreation(cas, contacts, signer(cas, contacts));
    expect(r.donnees.etat, r.texte).not.toBe("executee");
    expect(cas.appelsCreation()).toBe(avant);
  });

  it("deux contacts du lot au même critère : une seule recherche et une seule création", async () => {
    const contacts = lot(2);
    contacts[1] = { ...contacts[1]!, coordonnee: contacts[0]!.coordonnee };
    const avantAppels = cas.appelsTotal();
    const avant = cas.creations().length;
    const r = await appelerCreation(cas, contacts, signer(cas, contacts));
    expect(r.donnees, r.texte).toMatchObject({ etat: "executee" });
    expect(cas.creations()).toHaveLength(avant + 1);
    expect(cas.appelsTotal()).toBe(avantAppels + 2);
  });

  it("canal inconnu avec une coordonnée : refus avant tout appel", async () => {
    const contacts = lot(1, { canal: "courrier" });
    const avant = cas.appelsTotal();
    const r = await appelerCreation(cas, contacts, signer(cas, contacts));
    expect(r.erreur).toBe(true);
    expect(r.texte).toMatch(/canal/);
    expect(r.texte).not.toContain(contacts[0]!.coordonnee!);
    expect(cas.appelsTotal()).toBe(avant);
  });
});

describe("schéma strict", () => {
  it("dénomination de 300 caractères acceptée (plafond du contrat du plugin), 301 refusée", async () => {
    const c = lot(1)[0]!;
    const essai = async (denomination: string): Promise<boolean> => {
      const r = await clients.get("crm")!.callTool({ name: "crm_creer_contact", arguments: { contacts: [{ ...c, denomination }] } }).catch(() => ({ isError: true }));
      return r["isError"] === true;
    };
    expect(await essai("é".repeat(300))).toBe(false);
    expect(await essai("é".repeat(301))).toBe(true);
  });

  it("champ inconnu ou plus de 200 contacts : refusé avant toute exécution", async () => {
    const c = lot(1)[0]!;
    const refus = async (contacts: unknown[]): Promise<boolean> => {
      const r = await clients.get("crm")!.callTool({ name: "crm_creer_contact", arguments: { contacts } }).catch(() => ({ isError: true }));
      return r["isError"] === true;
    };
    const avant = m.faux.appels.length;
    expect((await appeler(clients.get("crm")!, "crm_creer_contact", { contacts: [c] })).donnees.etat).toBe("preparee"); // le schéma accepte un contact valide
    expect(await refus([{ ...c, champ_inconnu: "x" }])).toBe(true);
    expect(await refus(Array.from({ length: 201 }, () => c))).toBe(true);
    expect(m.faux.appels.length).toBe(avant);
  });
});
