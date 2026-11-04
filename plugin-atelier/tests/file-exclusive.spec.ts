/**
 * Revue de sécurité finale du 30/10/2026, constat B4 : une tâche de la file `exclusif` qui ne se termine jamais
 * (appel à l'hôte suspendu) bloquait toute la file de l'entreprise (décisions, diffusions, dépôts) jusqu'au
 * redémarrage du worker. L'appelant reçoit une erreur à 30 s.
 * Audit du 29/10/2026, SR2-B-1 : la file n'est libérée qu'à la vraie fin de la tâche, ou à un plafond de 10 min
 * (avec alerte), pour ne pas perdre l'exclusion mutuelle quand une tâche lente a déjà reçu son délai.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActeurHote } from "../src/serveur/atelier.js";
import { creerServices } from "../src/serveur/services.js";
import { SOC, creerBanc } from "./outils-base.js";

const humain: ActeurHote = { type: "humain", id: "local-board", agentId: null, userId: "local-board", runId: null };
const P1 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1";
const P2 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2";

afterEach(() => vi.useRealTimers());

describe("B4 + SR2-B-1 : file exclusive", () => {
  function banc(lireProspect: (c: string, id: string) => Promise<null>) {
    const b = creerBanc();
    (b.base as unknown as { lireProspect: typeof lireProspect }).lireProspect = lireProspect;
    const services = creerServices(b.ctx, { base: b.base, modeDeploiement: () => "local_trusted" });
    const alertes = vi.spyOn(b.ctx.logger, "warn");
    const exclure = (prospectId: string) => {
      const etat: { fini: boolean; erreur?: { code?: string; message?: string } } = { fini: false };
      services.routes["prospects.exclure"]!({ cle: "prospects.exclure", params: { prospectId }, query: {}, companyId: SOC, acteur: humain, corps: { companyId: SOC, prospectId, motif: "hors_zone", detail: "Hors du périmètre" } })
        .catch((err: { code?: string; message?: string }) => void (etat.erreur = err))
        .finally(() => void (etat.fini = true));
      return etat;
    };
    return { exclure, alertes };
  }

  it("une tâche suspendue : son appelant reçoit l'erreur à 30 s, la suivante ne passe qu'au plafond de 10 min, avec alerte", async () => {
    vi.useFakeTimers();
    const { exclure, alertes } = banc((_c, id) => (id === P1 ? new Promise<null>(() => undefined) : Promise.resolve(null)));
    const premiere = exclure(P1);
    const seconde = exclure(P2);
    await vi.advanceTimersByTimeAsync(29_000);
    expect([premiere.fini, seconde.fini]).toEqual([false, false]);
    await vi.advanceTimersByTimeAsync(1_001);
    expect(premiere.fini).toBe(true);
    expect(premiere.erreur).toMatchObject({ code: "erreur_interne" });
    expect(premiere.erreur?.message).toMatch(/30 s/u);
    expect(seconde.fini).toBe(false);
    await vi.advanceTimersByTimeAsync(560_000);
    expect(seconde.fini).toBe(false);
    expect(alertes).not.toHaveBeenCalledWith(expect.stringMatching(/plafond/u), expect.anything());
    await vi.advanceTimersByTimeAsync(10_000);
    expect(seconde.fini).toBe(true);
    expect(seconde.erreur).toMatchObject({ code: "introuvable" });
    expect(alertes).toHaveBeenCalledWith(expect.stringMatching(/plafond/u), expect.objectContaining({ plafondMs: 600_000 }));
  });

  it("une tâche de 31 s : son appelant reçoit l'erreur à 30 s, la suivante ne démarre qu'à la vraie fin", async () => {
    vi.useFakeTimers();
    const demarrees: string[] = [];
    const { exclure, alertes } = banc((_c, id) => {
      demarrees.push(id);
      return id === P1 ? new Promise<null>((ok) => setTimeout(() => ok(null), 31_000)) : Promise.resolve(null);
    });
    const premiere = exclure(P1);
    const seconde = exclure(P2);
    await vi.advanceTimersByTimeAsync(30_500);
    expect(premiere.fini).toBe(true);
    expect(premiere.erreur?.message).toMatch(/30 s/u);
    expect(demarrees).toEqual([P1]);
    expect(seconde.fini).toBe(false);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(demarrees).toEqual([P1, P2]);
    expect(seconde.fini).toBe(true);
    expect(seconde.erreur).toMatchObject({ code: "introuvable" });
    expect(alertes).not.toHaveBeenCalledWith(expect.stringMatching(/plafond/u), expect.anything());
  });
});
