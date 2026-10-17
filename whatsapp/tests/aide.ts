import type { AddressInfo } from "node:net";
import { creerApplication } from "../src/application.js";
import { lireConfig, type Config } from "../src/config.js";
import { Etat } from "../src/etat.js";
import type { EntreeRegistre } from "../src/journal.js";
import { signer } from "../src/signature.js";
import { DIRECTION, fauxAtelier, fauxMeta, type FauxAtelier, type FauxMeta } from "./faux.js";

export const SECRET = "secret-application-de-test";
export const JETON = "jeton-acces-de-test";
export const VERIF = "jeton-verification-de-test";
export const ID_NUMERO = "109876543210";
export const JB = "32470000001";
export const INCONNU = "32470999999";

export interface Banc {
  meta: FauxMeta;
  atelier: FauxAtelier;
  config: Config;
  app: ReturnType<typeof creerApplication>;
  url: string;
  journal: Array<{ evenement: string; champs: Record<string, unknown> }>;
  registre: EntreeRegistre[];
  horloge: { t: number };
  codes: number[];
  envoyer(texte: string | null, o?: { de?: string; id?: string; signature?: string | null; numeroId?: string; corpsBrut?: Buffer; horodatage?: number | string }): Promise<Response>;
  dernierTexte(): string;
  fermer(): Promise<void>;
}

let compteur = 0;

export async function banc(env: Record<string, string> = {}, etat?: Etat): Promise<Banc> {
  const meta = await fauxMeta(JETON);
  const atelier = await fauxAtelier();
  const config = lireConfig({
    WHATSAPP_JETON_ACCES: JETON,
    WHATSAPP_SECRET_APPLICATION: SECRET,
    WHATSAPP_JETON_VERIFICATION: VERIF,
    WHATSAPP_ID_NUMERO: ID_NUMERO,
    WHATSAPP_NUMEROS_AUTORISES: `+${JB}`,
    WHATSAPP_GRAPH_URL: meta.url,
    ATELIER_API: `${atelier.url}/api`,
    ATELIER_ENTREPRISE: DIRECTION,
    WHATSAPP_MODELE_NOM: "alerte_atelier",
    ...env,
  });
  const horloge = { t: Date.UTC(2026, 9, 17, 12, 0, 0) };
  const codes = [123456, 654321, 111222, 333444, 555666, 777888];
  let i = 0;
  const journal: Banc["journal"] = [];
  const registre: EntreeRegistre[] = [];
  const app = creerApplication({
    config,
    etat: etat ?? new Etat(null),
    journal: (evenement, champs = {}) => journal.push({ evenement, champs }),
    registre: (e) => registre.push(e),
    horloge: () => horloge.t,
    tirageCode: () => codes[i++ % codes.length]!,
  });
  await new Promise<void>((r) => app.serveur.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${(app.serveur.address() as AddressInfo).port}`;

  const b: Banc = {
    meta, atelier, config, app, url, journal, registre, horloge, codes,
    async envoyer(texte, o = {}) {
      const charge = {
        object: "whatsapp_business_account",
        entry: [{ id: "WABA", changes: [{ field: "messages", value: {
          messaging_product: "whatsapp",
          metadata: { display_phone_number: "3200000000", phone_number_id: o.numeroId ?? ID_NUMERO },
          contacts: [{ wa_id: o.de ?? JB }],
          messages: [texte === null
            ? { from: o.de ?? JB, id: o.id ?? `wamid.${++compteur}`, timestamp: String(o.horodatage ?? Math.floor(horloge.t / 1000)), type: "image", image: { id: "x" } }
            : { from: o.de ?? JB, id: o.id ?? `wamid.${++compteur}`, timestamp: String(o.horodatage ?? Math.floor(horloge.t / 1000)), type: "text", text: { body: texte } }],
        } }] }],
      };
      const corps = o.corpsBrut ?? Buffer.from(JSON.stringify(charge));
      const signature = o.signature === undefined ? signer(corps, SECRET) : o.signature;
      const r = await fetch(`${url}/webhook`, { method: "POST", headers: { "content-type": "application/json", ...(signature ? { "x-hub-signature-256": signature } : {}) }, body: corps });
      await app.attendre();
      return r;
    },
    dernierTexte() {
      const t = meta.textes();
      return t[t.length - 1] ?? "";
    },
    async fermer() {
      app.arreter();
      await Promise.all([meta.fermer(), atelier.fermer()]);
    },
  };
  return b;
}
