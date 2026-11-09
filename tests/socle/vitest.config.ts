// Configuration vitest des tests de câblage du socle (#39). Lancée depuis paperclip/server :
//   cd paperclip/server && npx vitest run --config <ce fichier>
// Elle reprend celle du serveur, remplace (sans fusionner) la liste des fichiers collectés, et fait
// résoudre les paquets importés par ces tests comme s'ils étaient dans paperclip/server
// (le dépôt n'a pas de node_modules à cet endroit).
import { fileURLToPath } from "node:url";
import configServeur from "../../paperclip/server/vitest.config.ts";

const ici = fileURLToPath(new URL("./", import.meta.url));
const depuisServeur = fileURLToPath(new URL("../../paperclip/server/src/__tests__/_resolution.ts", import.meta.url));

export default {
  ...configServeur,
  test: { ...configServeur.test, include: [`${ici}*.test.ts`] },
  server: { fs: { strict: false } },
  plugins: [
    {
      name: "socle-resolution-paquets",
      enforce: "pre" as const,
      async resolveId(this: any, source: string, importer: string | undefined, options: object) {
        if (!importer?.startsWith(ici) || source.startsWith(".") || source.startsWith("/")) return null;
        return this.resolve(source, depuisServeur, { ...options, skipSelf: true });
      },
    },
  ],
};
