// Intégration RÉELLE sur Umami 3.4.0 local (127.0.0.1:3196) : une page est créée par l'outil d'agent, chargée par le vrai serveur de
// pages, le script de suivi est relayé, une visite est collectée par le relais /_s/api/send, le formulaire est soumis (dépôt dans un
// faux hôte de l'atelier : le dépôt réel dans le plugin est vérifié par plugin-atelier/tests/captation-formulaire.spec.ts), puis
// l'outil statistiques_page lit la visite dans Umami. Ne tourne que si ~/.config/atelier/umami-admin.env existe ; sinon ignoré.
// Les pages d'essai ont un slug unique : leurs statistiques (filtrées par chemin) ne se mélangent à aucune autre.

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { appelerOutil, construireCatalogue } from "../../src/outils.js";
import { FICHE_CAPTATION } from "../../src/services.js";
import { fournisseurCaptationReel } from "../../src/reel/captation/outils.js";
import { MagasinPages } from "../../src/pages/magasin.js";
import { creerServeurPages } from "../../src/pages/serveur.js";
import { ClientUmami, lireReglagesUmami } from "../../src/pages/umami.js";

const FICHIER = join(homedir(), ".config", "atelier", "umami-admin.env");
const disponible = existsSync(FICHIER);
if (!disponible) console.warn("integration-reelle captation : umami-admin.env absent (installeur Umami jamais lancé), test ignoré.");

const ENTREPRISE = "123e4567-e89b-42d3-a456-426614174000";
const NAVIGATEUR = "Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0";

describe.skipIf(!disponible)("pile réelle : page, visite Umami, envoi du formulaire, statistiques", () => {
  it("la visite relayée est lue par statistiques_page et l'envoi du formulaire est compté", async () => {
    const r = await fetch("http://127.0.0.1:3196/api/heartbeat", { signal: AbortSignal.timeout(15_000) }).catch(() => null);
    expect(r?.ok === true, "Umami ne répond pas (systemctl --user status atelier-umami atelier-umami-db)").toBe(true);

    const umami = new ClientUmami(lireReglagesUmami(FICHIER));
    const magasin = new MagasinPages(":memory:");
    const horloge = { t: Date.now() };
    const depots: unknown[] = [];
    const serveur = creerServeurPages({
      hote: "127.0.0.1", port: 0, magasin, secret: Buffer.from("secret-de-test-0123456789abcdef0123456789"), umami,
      depot: { deposer: async (_p, e) => { depots.push(e); return { prospectId: "p1", nouveau: true, tacheId: null, tacheErreur: null }; } },
      maintenant: () => horloge.t,
    });
    const base = `http://127.0.0.1:${(await serveur.ecouter()).port}`;
    try {
      const catalogue = construireCatalogue(FICHE_CAPTATION, "reel", fournisseurCaptationReel({ magasin, umami, urlPages: base }));
      const ctx = { service: "captation", mode: "reel" as const, identite: { compte: "Poste local", propriete: { id: "pages/local", libelle: "Pages locales" } }, jetonPorteur: null };
      const appeler = async (outil: string, args: unknown) => {
        const rep = await appelerOutil(catalogue, outil, args, ctx);
        expect(rep.isError, JSON.stringify(rep.structuredContent)).not.toBe(true);
        return rep.structuredContent as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
      };
      const cree = await appeler("creer_page_destination", {
        entreprise_id: ENTREPRISE, titre: "Essai d'intégration captation", accroche: "Page créée par le test d'intégration réelle.", offre_type: "rappel_conseiller",
        offre_intitule: "Rappel d'essai", offre_description: "Page d'essai, sans suite.", responsable: "Société d'essai", contact_confidentialite: "essai@exemple.test",
      });
      const slug = cree["page"].slug as string;

      // 1. Chargement de la page : le script de suivi y figure, avec l'identifiant du site Umami, et il est relayé par le serveur de pages.
      const page = await fetch(`${base}/p/${slug}`);
      const html = await page.text();
      const site = /data-website-id="([^"]+)"/u.exec(html)?.[1];
      expect(site, "le script Umami doit figurer dans la page").toBeTruthy();
      const script = await fetch(`${base}/_s/script.js`);
      expect(script.status).toBe(200);
      expect(await script.text()).toContain("umami");
      const jeton = /name="jeton" value="([^"]+)"/u.exec(html)![1]!;
      const cookie = (page.headers.get("set-cookie") ?? "").split(";")[0]!;

      // 2. Collecte de la visite comme le ferait le script (relais /_s/api/send). Un autre site est refusé.
      const collecte = (website: string, url: string) =>
        fetch(`${base}/_s/api/send`, {
          method: "POST", headers: { "content-type": "application/json", "user-agent": NAVIGATEUR, origin: base },
          body: JSON.stringify({ type: "event", payload: { website, hostname: "127.0.0.1", language: "fr-BE", screen: "1920x1080", title: "Essai", url, referrer: "" } }),
        });
      expect((await collecte("00000000-0000-4000-8000-000000000000", `/p/${slug}`)).status).toBe(403);
      expect((await collecte(site!, `/p/${slug}`)).status).toBe(200);

      // 3. Envoi du formulaire puis visite de la page de remerciement.
      horloge.t += 3000;
      const envoi = await fetch(`${base}/p/${slug}`, {
        method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", cookie, origin: base },
        body: new URLSearchParams({ nom: "Personne d'essai", telephone: "0470 12 34 56", courriel: "", creneau: "peu_importe", consentement: "oui", site_web: "", jeton }).toString(),
      });
      expect(envoi.status).toBe(303);
      expect(depots).toHaveLength(1);
      expect((await collecte(site!, `/p/${slug}/merci`)).status).toBe(200);

      // 4. Statistiques lues dans Umami (traitement asynchrone : quelques essais).
      let stats: Record<string, any> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
      for (let i = 0; i < 15; i++) {
        stats = await appeler("statistiques_page", { slug, jours: 1 });
        if (stats["visites"]?.vues >= 1 && stats["visites"]?.vues_page_merci >= 1) break;
        await new Promise((ok) => setTimeout(ok, 1000));
      }
      expect(stats["visites"], JSON.stringify(stats)).toMatchObject({ vues: 1, visiteurs: 1, vues_page_merci: 1 });
      expect(stats["envois"]).toBe(1);
      expect(stats["taux_envoi_pour_cent"]).toBe(100);
    } finally {
      await serveur.arreter();
      magasin.fermer();
    }
  }, 60_000);
});
