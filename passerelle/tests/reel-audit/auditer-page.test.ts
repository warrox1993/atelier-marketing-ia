// Service réel « audit » (outil auditer_page) : essais avec un lanceur Lighthouse factice (aucun Chrome) ; le filtre
// d'adresses de production est contrôlé séparément (adresses privées refusées, y compris après résolution DNS).

import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { argumentsChrome, auditerPage, cheminScriptChrome, extraireProblemes, outilsAudit, MAX_PROBLEMES, type LanceurLighthouse, type RapportLh } from "../../src/reel/audit/auditer-page.js";

const publique = { resoudre: async () => ["93.184.216.34"] };

function rapport(scorePerf: number, finale = "https://exemple.be/"): RapportLh {
  const audits: RapportLh["audits"] = {};
  const refs: { id: string; weight: number }[] = [];
  for (let i = 0; i < 14; i++) {
    audits[`a${i}`] = { title: `Problème ${i}`, score: 0.1 + i / 100, scoreDisplayMode: "numeric", displayValue: `${i} s` };
    refs.push({ id: `a${i}`, weight: i });
  }
  audits["ok"] = { title: "Réussi", score: 1, scoreDisplayMode: "binary" };
  audits["info"] = { title: "Info", score: 0, scoreDisplayMode: "informative" };
  refs.push({ id: "ok", weight: 99 }, { id: "info", weight: 98 });
  return {
    finalDisplayedUrl: finale,
    categories: {
      performance: { score: scorePerf, auditRefs: refs },
      accessibility: { score: 0.9, auditRefs: [] },
      "best-practices": { score: 1, auditRefs: [] },
      seo: { score: null, auditRefs: [] },
    },
    audits,
  };
}

describe("auditer_page", () => {
  it("rend scores sur 100 et au plus 10 problèmes, sans les audits réussis ni informatifs", async () => {
    const lanceur: LanceurLighthouse = async () => rapport(0.567);
    const r = await auditerPage("https://exemple.be/", 1, 30_000, { ...publique, lanceur });
    expect(r.erreur).toBeUndefined();
    expect(r.scores).toEqual({ performance: 57, accessibility: 90, "best-practices": 100, seo: null });
    expect(r.problemes).toHaveLength(MAX_PROBLEMES);
    expect(r.problemes[0]?.audit).toBe("a13");
    expect(r.problemes.map((p) => p.audit)).not.toContain("ok");
    expect(r.problemes.map((p) => p.audit)).not.toContain("info");
    expect(extraireProblemes(rapport(1))).toHaveLength(10);
  });

  it("plusieurs passes : médiane des scores", async () => {
    const valeurs = [0.2, 0.9, 0.5];
    let i = 0;
    const r = await auditerPage("https://exemple.be/", 3, 30_000, { ...publique, lanceur: async () => rapport(valeurs[i++] as number) });
    expect(r.passes).toBe(3);
    expect(r.scores.performance).toBe(50);
  });

  it("le nombre de passes est plafonné à 3", async () => {
    let appels = 0;
    const r = await auditerPage("https://exemple.be/", 99, 30_000, { ...publique, lanceur: async () => { appels++; return rapport(1); } });
    expect(appels).toBe(3);
    expect(r.passes).toBe(3);
  });

  it.each(["http://127.0.0.1/", "http://127.1.2.3/", "http://10.1.2.3/", "http://169.254.169.254/", "http://[::1]/", "http://localhost/", "ftp://exemple.be/", "file:///etc/passwd", "pas une url"])(
    "adresse privée, locale ou schéma interdit refusé sans lancer Chrome : %s", async (u) => {
      let lance = false;
      const r = await auditerPage(u, 1, 30_000, { lanceur: async () => { lance = true; return rapport(1); } });
      expect(r.erreur).toMatch(/refusée|refusé|invalide/);
      expect(lance).toBe(false);
    });

  it("nom public qui pointe vers une adresse interne refusé après résolution DNS", async () => {
    const r = await auditerPage("https://pirate.example/", 1, 30_000, { resoudre: async () => ["10.0.0.5"], lanceur: async () => rapport(1) });
    expect(r.erreur).toMatch(/pointe vers 10\.0\.0\.5/);
  });

  it("adresse finale interne (redirection) : rapport écarté", async () => {
    const r = await auditerPage("https://exemple.be/", 1, 30_000, { resoudre: async (h) => (h === "exemple.be" ? ["93.184.216.34"] : ["10.0.0.5"]), lanceur: async () => rapport(1, "http://interne.exemple/") });
    expect(r.erreur).toMatch(/Adresse finale refusée/);
    expect(r.scores.performance).toBeNull();
  });

  it("échec du lanceur : erreur claire, pas d'exception", async () => {
    const r = await auditerPage("https://exemple.be/", 1, 30_000, { ...publique, lanceur: async () => { throw new Error("Chrome introuvable"); } });
    expect(r.erreur).toMatch(/Chrome introuvable/);
  });

  it("l'outil est en lecture seule et ne s'appelle pas d'autre façon", () => {
    const [outil] = outilsAudit();
    expect(outil?.nom).toBe("auditer_page");
    expect(outil?.annotations?.readOnlyHint).toBe(true);
  });

  it("saturation : un audit en cours + deux en attente, le quatrième reçoit « occupé » sans lancer Chrome", async () => {
    let liberer: () => void = () => undefined;
    const bloque = new Promise<void>((r) => { liberer = r; });
    let lancements = 0;
    const lanceur: LanceurLighthouse = async () => { lancements++; await bloque; return rapport(1); };
    const demandes = [1, 2, 3, 4].map((n) => auditerPage(`https://exemple.be/${n}`, 1, 30_000, { ...publique, lanceur }));
    const quatrieme = await demandes[3];
    expect(quatrieme?.erreur).toMatch(/Occupé/);
    expect(quatrieme?.scores.performance).toBeNull();
    liberer();
    const autres = await Promise.all(demandes.slice(0, 3));
    expect(autres.every((r) => r.erreur === undefined)).toBe(true);
    expect(lancements).toBe(3);
    // La place est rendue : un nouvel audit passe.
    const apres = await auditerPage("https://exemple.be/5", 1, 30_000, { ...publique, lanceur: async () => rapport(1) });
    expect(apres.erreur).toBeUndefined();
  });

  it("saturation : un audit qui échoue rend sa place", async () => {
    for (let i = 0; i < 6; i++) {
      const r = await auditerPage("https://exemple.be/", 1, 30_000, { ...publique, lanceur: async () => { throw new Error("Chrome introuvable"); } });
      expect(r.erreur).toMatch(/Chrome introuvable/);
    }
  });

  it("le filtre et le résolveur injectés sont transmis au lanceur (donc au mandataire)", async () => {
    let recu: unknown;
    const filtre = (): boolean => true;
    await auditerPage("https://exemple.be/", 1, 30_000, { ...publique, adresseAutorisee: filtre, lanceur: async (_u, _d, o) => { recu = o; return rapport(1); } });
    expect((recu as { adresseAutorisee?: unknown }).adresseAutorisee).toBe(filtre);
    expect((recu as { resoudre?: unknown }).resoudre).toBe(publique.resoudre);
  });

  it("options de Chrome : mandataire local, boucle locale incluse, WebRTC limité au mandataire", () => {
    const a = argumentsChrome(43210);
    expect(a).toContain("--proxy-server=http://127.0.0.1:43210");
    expect(a).toContain("--proxy-bypass-list=<-loopback>");
    expect(a).toContain("--force-webrtc-ip-handling-policy=disable_non_proxied_udp");
    expect(a.some((x) => x.startsWith("--remote-debugging-port"))).toBe(false);
  });

  it("script de lancement : exécutable, scope systemd limité à 2 Go", () => {
    const chemin = cheminScriptChrome();
    expect(statSync(chemin).mode & 0o111).not.toBe(0);
    const texte = readFileSync(chemin, "utf8");
    expect(texte).toMatch(/systemd-run --user --scope/);
    expect(texte).toMatch(/MemoryMax=2G/);
  });
});
