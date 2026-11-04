/** Garde du module Observatoire : refus hors de l'entreprise dont le service est « observatoire » (FR-035). */
import { describe, expect, it } from "vitest";
import { ErreurAtelier } from "../src/serveur/erreurs.js";
import { SERVICE_OBSERVATOIRE, exigerObservatoire } from "../src/serveur/observatoire/garde.js";

const MESSAGE = "module Observatoire désactivé pour cette entreprise";

const stockAvec = (service: string | null) => ({
  serviceDeEntreprise: async () => (service === null ? null : ({ serviceSlug: service } as never)),
});

async function refus(p: Promise<unknown>): Promise<ErreurAtelier> {
  try {
    await p;
  } catch (e) {
    return e as ErreurAtelier;
  }
  throw new Error("refus attendu");
}

describe("exigerObservatoire", () => {
  it("refuse une entreprise sans companyId", async () => {
    const e = await refus(exigerObservatoire(stockAvec(SERVICE_OBSERVATOIRE), undefined));
    expect(e.code).toBe("acces_refuse");
    expect(e.message).toBe(MESSAGE);
  });
  it("refuse une entreprise du service marketing", async () => {
    const e = await refus(exigerObservatoire(stockAvec("marketing"), "c1"));
    expect(e.code).toBe("acces_refuse");
    expect(e.message).toBe(MESSAGE);
  });
  it("refuse une entreprise sans service déclaré", async () => {
    const e = await refus(exigerObservatoire(stockAvec(null), "c1"));
    expect(e.message).toBe(MESSAGE);
  });
  it("accepte l'entreprise du service observatoire", async () => {
    await expect(exigerObservatoire(stockAvec(SERVICE_OBSERVATOIRE), "c1")).resolves.toBe("c1");
  });
});
