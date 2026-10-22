// Intégration RÉELLE : l'index Statbel construit par scripts/statbel-mise-a-jour.sh à partir des vrais fichiers de Statbel.
// Ne tourne que si l'index existe ; sinon ignoré (avertissement). Les ordres de grandeur sont ceux publiés par Statbel
// pour Liège (code INS 62063) : population de 190 000 à 205 000 habitants, plus de 60 % de Belges, revenu moyen par déclaration entre 25 000 et 31 000 EUR.

import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cheminIndexStatbel, IndexStatbel } from "../../src/reel/statbel/index.js";
import { outilsStatbel } from "../../src/reel/statbel/outils.js";

const chemin = cheminIndexStatbel(process.env);
const disponible = existsSync(chemin);
if (!disponible) console.warn(`integration-reelle statbel : index absent (${chemin}), test ignoré. Lancer scripts/statbel-mise-a-jour.sh.`);

type Obj = Record<string, any>;

describe.skipIf(!disponible)("index Statbel réel : profil de Liège", () => {
  const index = new IndexStatbel(chemin);
  const [profil, comparer] = outilsStatbel(() => index);
  const appeler = async (o: NonNullable<typeof profil>, args: Record<string, unknown>): Promise<Obj> => (await o.executer(args, {} as never)) as Obj;

  it("Liège par nom, par code postal et par code INS : même commune, chiffres cohérents avec Statbel", async () => {
    const parNom = await appeler(profil!, { commune: "Liège" });
    expect((await appeler(profil!, { commune: "4000" }))["commune"].code_ins).toBe("62063");
    expect((await appeler(profil!, { commune: "62063" }))["commune"].nom_fr).toBe("Liège");
    expect((await appeler(profil!, { commune: "Luik" }))["commune"].code_ins).toBe("62063");
    expect(parNom["commune"]).toMatchObject({ code_ins: "62063", province: "Province de Liège", region: "Région wallonne" });
    const pop = parNom["population"];
    expect(pop.total.valeur).toBeGreaterThan(190_000);
    expect(pop.total.valeur).toBeLessThan(205_000);
    expect(pop.hommes.valeur + pop.femmes.valeur).toBe(pop.total.valeur);
    expect(pop.belges.valeur + pop.etrangers.valeur).toBe(pop.total.valeur);
    expect(pop.total.annee).toBeGreaterThanOrEqual(2025);
    const sommeTranches = (parNom["tranches_age"] as Obj[]).reduce((s, t) => s + t["effectif"].valeur, 0);
    expect(sommeTranches).toBe(pop.total.valeur);
    const rev = parNom["revenus"].revenu_moyen_par_declaration_eur;
    expect(rev.valeur).toBeGreaterThan(25_000);
    expect(rev.valeur).toBeLessThan(31_000);
    expect(rev.annee).toBeGreaterThanOrEqual(2022);
    expect(parNom["entreprises_tva"].total_assujettis.valeur).toBeGreaterThan(10_000);
  });

  it("comparer_communes : Liège, Namur et Seraing", async () => {
    const r = await appeler(comparer!, { communes: ["Liège", "Namur", "Seraing"] });
    expect((r["communes"] as Obj[]).map((c) => c["commune"].code_ins)).toEqual(["62063", "92094", "62096"]);
    expect(r["non_resolues"]).toEqual([]);
  });
});
