// Lecture d'un fichier ZIP en flux (yauzl 3.4.0) : aucun fichier n'est jamais extrait sur le disque. Seuls les membres
// demandés par leur nom sont ouverts, et leur nom est comparé à la casse près sur le dernier segment du chemin (un
// chemin du type « ../x » ne peut donc rien écrire nulle part : on ne fait que LIRE).

import { basename } from "node:path";
import type { Readable } from "node:stream";
import yauzl from "yauzl";

export interface ArchiveZip {
  /** Noms de base (minuscules) des membres, sans les dossiers. */
  noms: string[];
  /** Ouvre un membre en lecture ; erreur claire si le fichier est absent. */
  ouvrir(nom: string): Promise<Readable>;
  fermer(): void;
}

export function ouvrirZip(chemin: string): Promise<ArchiveZip> {
  return new Promise((resoudre, rejeter) => {
    yauzl.open(chemin, { lazyEntries: true, autoClose: false }, (erreur, zip) => {
      if (erreur || !zip) {
        rejeter(new Error(`Archive ZIP illisible (${chemin}) : ${erreur?.message ?? "erreur inconnue"}`));
        return;
      }
      const entrees = new Map<string, yauzl.Entry>();
      zip.on("entry", (entree: yauzl.Entry) => {
        if (!/\/$/.test(entree.fileName)) {
          const nom = basename(entree.fileName).toLowerCase();
          if (entrees.has(nom)) {
            zip.close();
            rejeter(new Error(`Archive ZIP ambiguë (${chemin}) : deux membres portent le nom ${nom}.`));
            return;
          }
          entrees.set(nom, entree);
        }
        zip.readEntry();
      });
      zip.on("error", (e: Error) => rejeter(new Error(`Archive ZIP illisible (${chemin}) : ${e.message}`)));
      zip.on("end", () => {
        resoudre({
          noms: [...entrees.keys()],
          ouvrir: (nom) =>
            new Promise<Readable>((ok, ko) => {
              const entree = entrees.get(nom.toLowerCase());
              if (!entree) {
                ko(new Error(`Le fichier ${nom} est absent de l'archive ${basename(chemin)}.`));
                return;
              }
              zip.openReadStream(entree, (e, flux) => (e || !flux ? ko(new Error(`Lecture de ${nom} impossible : ${e?.message ?? "flux vide"}`)) : ok(flux)));
            }),
          fermer: () => zip.close(),
        });
      });
      zip.readEntry();
    });
  });
}
