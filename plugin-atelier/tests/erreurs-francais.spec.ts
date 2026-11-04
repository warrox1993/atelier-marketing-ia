/** LANG-L7 (audit du 29/10/2026) : les erreurs de validation rendues aux agents sont en français. */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ErreurAtelier, erreurValidation } from "../src/serveur/erreurs.js";

describe("erreurs de validation en français", () => {
  it("les messages de Zod sont traduits", () => {
    const r = z.object({ titre: z.string(), cycles: z.number().min(1) }).safeParse({ cycles: 0 });
    expect(r.success).toBe(false);
    try {
      erreurValidation("tache.porte", r.success ? [] : r.error.issues);
    } catch (e) {
      const details = (e as ErreurAtelier).details as Array<{ chemin: string; message: string }>;
      expect(details.map((d) => d.chemin)).toEqual(["titre", "cycles"]);
      for (const d of details) expect(d.message).not.toMatch(/Invalid|expected|Too small/u);
      expect(details[0]?.message).toMatch(/^Entrée invalide/u);
      return;
    }
    throw new Error("erreurValidation doit lever une erreur");
  });
});
