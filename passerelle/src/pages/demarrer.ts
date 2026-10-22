// Point d'entrée du serveur de pages de destination : « node dist/src/pages/demarrer.js » (unité atelier-pages.service).
// N'écoute que sur la boucle locale (127.0.0.1 ou ::1). La publication publique passe par un tunnel ou un proxy inverse
// qui vise ce port : voir docs/captation.md.

import { randomBytes } from "node:crypto";
import { ClientUmami, lireReglagesUmami } from "./umami.js";
import { DepotAtelier } from "./depot-atelier.js";
import { lireConfigPages } from "./config.js";
import { MagasinPages } from "./magasin.js";
import { creerServeurPages } from "./serveur.js";

function principal(): void {
  let c;
  try {
    c = lireConfigPages(process.env, () => randomBytes(32));
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(2);
  }
  if (c.secretEphemere) console.log("AVERTISSEMENT : PAGES_SECRET_FICHIER absent, secret anti-CSRF éphémère (les formulaires ouverts avant un redémarrage seront à recharger).");
  let umami: ClientUmami | null = null;
  if (c.fichierUmami) {
    try {
      umami = new ClientUmami(lireReglagesUmami(c.fichierUmami));
    } catch (e) {
      console.error(`Umami non branché : ${e instanceof Error ? e.message : String(e)}`);
    }
  } else console.log("Umami non configuré (PAGES_UMAMI_FICHIER) : les pages sont servies sans suivi.");
  const magasin = new MagasinPages(c.base);
  const depot = new DepotAtelier({ api: c.atelierApi, plugin: c.atelierPlugin, cleBoard: c.cleBoard, urlPages: c.urlPages });
  const serveur = creerServeurPages({
    hote: c.hote, port: c.port, magasin, secret: c.secret, umami, depot, hotesAutorises: c.hotesAutorises, indexable: c.indexable,
    cookieSecurise: c.cookieSecurise, confianceProxy: c.confianceProxy, sautsProxy: c.sautsProxy, journal: (m) => console.log(m),
  });
  serveur.ecouter().then(
    (a) => console.log(`pages de destination sur http://${a.address}:${a.port} (base ${c.base}, suivi Umami ${umami ? "branché" : "absent"})`),
    (e: unknown) => {
      console.error(`Démarrage impossible : ${e instanceof Error ? e.message : String(e)}`);
      process.exit(1);
    },
  );
  const arret = (): void => {
    serveur.arreter().finally(() => { magasin.fermer(); process.exit(0); });
  };
  process.on("SIGTERM", arret);
  process.on("SIGINT", arret);
}

principal();
