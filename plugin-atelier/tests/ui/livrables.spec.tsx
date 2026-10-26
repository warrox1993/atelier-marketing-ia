// @vitest-environment jsdom
/**
 * Page « Livrables » : liste des travaux de l'entreprise, téléchargement par morceaux, vérification de l'empreinte,
 * progression et message en cas d'empreinte différente. Les routes du plugin sont servies par un `fetch` simulé.
 */
import { createHash, randomBytes, webcrypto } from "node:crypto";
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VueLivrables } from "../../src/ui/vues/livrables.js";
import { MESSAGE_EMPREINTE, recupererLivrable } from "../../src/ui/livrables-telechargement.js";
import { lireRoute } from "../../src/ui/route.js";
import { cliquer, installerPont, parTexte, rendre, type Rendu } from "./pont.js";

const MIO = 1024 * 1024;
const T1 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const T2 = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const CONTENU = randomBytes(9 * MIO);
const SHA = createHash("sha256").update(CONTENU).digest("hex");

let rendu: Rendu | null = null;
let urls: string[] = [];
let shaAnnonce = SHA;
let travaux: Array<Record<string, unknown>> = [];
let liensCrees: Array<{ nom: string; taille: number }> = [];
let revoquees = 0;

const travail = (o: Record<string, unknown>) => ({ travail: T1, etat: "termine", type: "mp4", debut: "2026-10-24T10:00:00Z", fin: "2026-10-24T10:05:00Z", message: null, fichiers: [{ fichier: "film.mp4", typeMime: "video/mp4", taille: CONTENU.length, telechargeable: true }], ...o });

beforeEach(() => {
  installerPont("/RNO/atelier/livrables");
  urls = [];
  shaAnnonce = SHA;
  liensCrees = [];
  revoquees = 0;
  travaux = [travail({}), travail({ travail: T2, etat: "echec", type: "pdf", message: "délai dépassé", fichiers: [] })];
  if (!globalThis.crypto?.subtle) vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      urls.push(url);
      if (url.includes("/livrables?")) return new Response(JSON.stringify({ travaux }), { status: 200 });
      const n = Number(/morceau=(\d+)/u.exec(url)![1]);
      const tranche = CONTENU.subarray(n * 8 * MIO, (n + 1) * 8 * MIO);
      return new Response(JSON.stringify({ fichier: "film.mp4", typeMime: "video/mp4", taille: CONTENU.length, sha256: shaAnnonce, morceau: n, morceaux: 2, contenuBase64: tranche.toString("base64") }), { status: 200 });
    }),
  );
  // jsdom ne produit pas de téléchargement : on observe le lien `download` et la révocation de l'URL.
  URL.createObjectURL = vi.fn((b: Blob) => {
    liensCrees.push({ nom: "", taille: b.size });
    return "blob:test";
  });
  URL.revokeObjectURL = vi.fn(() => {
    revoquees += 1;
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    liensCrees[liensCrees.length - 1]!.nom = this.download;
  });
});
afterEach(() => {
  rendu?.demonter();
  rendu = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Attend (jusqu'à 10 s) qu'une condition soit vraie, en laissant React appliquer ses mises à jour. */
async function attendre(condition: () => boolean) {
  for (let i = 0; i < 200 && !condition(); i += 1) await act(async () => new Promise((ok) => setTimeout(ok, 50)));
  expect(condition()).toBe(true);
}

async function ouvrir(id: string | null = null) {
  rendu = await rendre(createElement(VueLivrables, { id }));
  return rendu.conteneur;
}

describe("page Livrables", () => {
  it("est reconnue par l'adresse /atelier/livrables/<travail>", () => {
    expect(lireRoute(`/RNO/atelier/livrables/${T1}`)).toEqual({ vue: "livrables", id: T1 });
  });

  it("liste les travaux de l'entreprise avec état, type et fichiers, sans tiret cadratin", async () => {
    const c = await ouvrir();
    expect(urls[0]).toContain("/livrables?companyId=11111111-1111-4111-8111-111111111111");
    const lignes = c.querySelectorAll("tbody tr");
    expect(lignes).toHaveLength(2);
    expect(lignes[0]!.textContent).toContain("film.mp4");
    expect(lignes[0]!.textContent).toContain("Terminé");
    expect(lignes[1]!.textContent).toContain("Échec");
    expect(lignes[1]!.textContent).toContain("délai dépassé");
    expect(c.textContent).not.toContain("—");
  });

  it("affiche un libellé lisible pour un travail en attente de la carte graphique", async () => {
    travaux = [travail({ etat: "en_attente_gpu", fichiers: [] })];
    const c = await ouvrir();
    expect(c.querySelector("tbody tr")!.textContent).toContain("En attente de la carte graphique");
    expect(c.textContent).not.toContain("en_attente_gpu");
  });

  it("met en avant le travail désigné par l'adresse", async () => {
    const c = await ouvrir(T2);
    const lignes = c.querySelectorAll("tbody tr");
    expect(lignes[0]!.getAttribute("data-choisi")).toBe("false");
    expect(lignes[1]!.getAttribute("data-choisi")).toBe("true");
  });

  it("état vide clair", async () => {
    travaux = [];
    const c = await ouvrir();
    expect(c.textContent).toContain("Aucun livrable pour le moment.");
  });

  it("« Télécharger » récupère les morceaux à la suite, vérifie l'empreinte, remet le fichier et révoque l'URL", async () => {
    const c = await ouvrir();
    await cliquer(parTexte(c, "button", "Télécharger"));
    await attendre(() => revoquees === 1);
    const morceaux = urls.filter((u) => u.includes("morceau="));
    expect(morceaux.map((u) => /morceau=(\d+)/u.exec(u)![1])).toEqual(["0", "1"]);
    expect(morceaux[0]).toContain(`/livrables/${T1}/film.mp4?companyId=`);
    expect(liensCrees).toEqual([{ nom: "film.mp4", taille: CONTENU.length }]);
    expect(revoquees).toBe(1);
    expect(c.querySelector('[role="status"]')?.textContent).toContain("empreinte est vérifiée");
  });

  it("empreinte différente : message clair, aucun fichier remis", async () => {
    shaAnnonce = "0".repeat(64);
    const c = await ouvrir();
    await cliquer(parTexte(c, "button", "Télécharger"));
    await attendre(() => c.querySelector('[role="alert"]') !== null);
    expect(c.querySelector('[role="alert"]')?.textContent).toContain(MESSAGE_EMPREINTE);
    expect(liensCrees).toHaveLength(0);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});

describe("recupererLivrable", () => {
  it("rend la progression morceau par morceau et le contenu exact", async () => {
    installerPont();
    const progres: Array<[number, number]> = [];
    const { blob, nom } = await recupererLivrable("11111111-1111-4111-8111-111111111111", T1, "film.mp4", (p) => progres.push([p.recus, p.morceaux]));
    expect(progres).toEqual([[1, 2], [2, 2]]);
    expect(nom).toBe("film.mp4");
    expect(blob.size).toBe(CONTENU.length);
    const lu = await new Promise<ArrayBuffer>((ok, ko) => {
      const lecteur = new FileReader();
      lecteur.onload = () => ok(lecteur.result as ArrayBuffer);
      lecteur.onerror = () => ko(lecteur.error);
      lecteur.readAsArrayBuffer(blob);
    });
    expect(Buffer.from(lu).equals(CONTENU)).toBe(true);
  });

  it("abandonne si un morceau n'a pas la taille attendue", async () => {
    installerPont();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const n = Number(/morceau=(\d+)/u.exec(url)![1]);
        return new Response(JSON.stringify({ fichier: "film.mp4", typeMime: "video/mp4", taille: CONTENU.length, sha256: SHA, morceau: n, morceaux: 2, contenuBase64: Buffer.from("trop court").toString("base64") }), { status: 200 });
      }),
    );
    await expect(recupererLivrable("11111111-1111-4111-8111-111111111111", T1, "film.mp4")).rejects.toMatchObject({ code: "reponse" });
  });
});
