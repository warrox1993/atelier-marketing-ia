/**
 * Action `atelier.marque.enregistrer` : conserve le référentiel étendu du client (entités, segments,
 * cibles de prospection, modules de conformité, champs ajoutés aux offres et établissements), relit
 * une ancienne marque telle quelle et refuse un code croisé inconnu. Client fictif : le courtier.
 */
import { describe, expect, it } from "vitest";
import { ACTIONS_UI, ReferentielClient } from "../src/contrats/index.js";
import { REFERENTIEL_COURTIER } from "../src/contrats/exemples/prospection.js";
import type { BaseAtelier } from "../src/serveur/base.js";
import { creerServices } from "../src/serveur/services.js";
import { SOC, creerBanc } from "./outils-base.js";

type Ligne = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const HUMAIN = { type: "humain", id: "local-board", agentId: null, userId: "local-board", runId: null } as const;
const copie = <T>(v: T): T => structuredClone(v);

/** Saisie du courtier fictif : le référentiel sans les champs que le serveur ajoute (id, entreprise, version, date). */
function saisieCourtier(): Ligne {
  const { id: _i, companyId: _c, version: _v, creeLe: _d, ...saisie } = copie(REFERENTIEL_COURTIER) as Ligne;
  return saisie;
}

function banc() {
  const b = creerBanc({ modeEntreprise: "demonstration" });
  // Base en mémoire de la marque : reprend la forme des colonnes de `base.ts` (jsonb relues telles quelles).
  const lignes: Ligne[] = [];
  const base = new Proxy(b.base as unknown as Ligne, {
    get: (cible, cle) => {
      if (cle === "insererMarque") {
        return async (m: Ligne) => {
          const version = lignes.filter((l) => l.companyId === m.companyId).length + 1;
          lignes.push({ ...structuredClone(m), version });
          return { id: `a0000000-0000-4000-8000-00000000000${version}`, version };
        };
      }
      if (cle === "marques") {
        return async (companyId: string) =>
          lignes.filter((l) => l.companyId === companyId).sort((a, c) => c.version - a.version).map((l) => ({
            id: `a0000000-0000-4000-8000-00000000000${l.version}`, companyId, version: l.version, identite: l.identite, ton: l.ton, offres: l.offres, zones: l.zones, etablissements: l.etablissements,
            affirmationsAutorisees: l.affirmations, informationsManquantes: l.manquantes,
            entites: l.entites ?? [], segments: l.segments ?? [], ciblesProspection: l.ciblesProspection ?? [], modulesConformite: l.modulesConformite ?? [],
            creeLe: "2026-10-15T10:00:00.000Z",
          }));
      }
      if (cle === "listerSources" || cle === "listerImports") return async () => [];
      return cible[cle as string];
    },
  }) as unknown as BaseAtelier;
  const services = creerServices(b.ctx, { base });
  /** Même chaîne que l'aiguillage : validation par le contrat de l'action, puis gestionnaire. */
  async function enregistrer(entree: unknown) {
    const analyse = ACTIONS_UI["atelier.marque.enregistrer"].params.safeParse(entree);
    if (!analyse.success) return { refus: analyse.error.issues.map((i) => `${i.path.join(".")} : ${i.message}`) };
    return { marque: await services.actions["atelier.marque.enregistrer"]!(analyse.data as Record<string, unknown>, SOC, HUMAIN) };
  }
  return { enregistrer, lire: () => services.donnees["atelier.marque"]!({}, SOC) as Promise<Ligne> };
}

describe("atelier.marque.enregistrer : référentiel étendu", () => {
  it("enregistre puis relit un référentiel étendu (entités, segments, cibles, module, champs d'offres et d'établissements)", async () => {
    const b = banc();
    const saisie = saisieCourtier();
    const r = await b.enregistrer(saisie);
    expect(r.refus).toBeUndefined();
    const m = r.marque as Ligne;
    expect(m.version).toBe(1);
    expect(ReferentielClient.safeParse(m).success).toBe(true);
    expect(m.entites.map((e: Ligne) => e.code)).toEqual(["non-vie", "vie", "devis-en-ligne"]);
    expect(m.segments).toEqual(saisie.segments);
    expect(m.ciblesProspection).toEqual(saisie.ciblesProspection);
    expect(m.modulesConformite.map((x: Ligne) => x.code)).toEqual(["intermediaire_assurance"]);
    expect(m.offres[0]).toMatchObject({ code: "auto", entite: "non-vie", segments: ["jeunes-conducteurs", "proprietaires"], fournisseur: "Compagnie partenaire A (démonstration)" });
    expect(m.etablissements[0]).toMatchObject({ code: "bureau-liege", codesPostaux: ["4000", "4020", "4030"], entites: ["non-vie", "vie"] });
    // La vue de la rubrique relit la même marque, étendue.
    expect(((await b.lire()).marque as Ligne).entites).toHaveLength(3);
  });

  it("une ancienne marque, sans les champs étendus, se relit inchangée (listes vides, aucun module)", async () => {
    const b = banc();
    const ancienne = {
      identite: "Rénovations (entreprise fictive)", ton: "Clair",
      offres: [{ nom: "Diagnostic", description: "Visite", confirmee: false }], zones: ["Liège"],
      etablissements: [{ nom: "Atelier", adresse: null, confirme: true }],
      affirmationsAutorisees: [{ texte: "Devis gratuit", sourceId: null }], informationsManquantes: ["Prix à confirmer"],
    };
    const m = (await b.enregistrer(ancienne)).marque as Ligne;
    expect(m).toMatchObject(ancienne);
    expect(m.entites).toEqual([]);
    expect(m.segments).toEqual([]);
    expect(m.ciblesProspection).toEqual([]);
    expect(m.modulesConformite).toEqual([]);
  });

  it("refuse un code croisé invalide (offre qui renvoie à une entité inconnue)", async () => {
    const b = banc();
    const saisie = saisieCourtier();
    saisie.offres[0].entite = "entite-fantome";
    const r = await b.enregistrer(saisie);
    expect(r.marque).toBeUndefined();
    expect(r.refus?.join(" ")).toContain("Entité inconnue : entite-fantome");
    expect((await b.lire()).marque).toBeNull();
  });
});
