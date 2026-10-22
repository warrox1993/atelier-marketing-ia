// Contrôles purs du contenu d'une campagne e-mail (aucun accès réseau sauf la résolution DNS des liens, injectable) :
//   - balises de gabarit listmonk : liste blanche (un agent ne fait pas exécuter d'autres fonctions de gabarit) ;
//   - pas de script, de cadre, de formulaire ni de gestionnaire d'événement ;
//   - chaque lien http(s) doit viser une adresse PUBLIQUE (même filtre anti-SSRF que la vérification de liens) ;
//   - lien de désinscription obligatoire : ajouté en pied de page s'il manque, puis revérifié.

import { exigerUrlPublique, type OptionsVerification } from "../liens/verifier-url.js";

export const BALISE_DESINSCRIPTION = "{{ UnsubscribeURL }}";
/** Balises de gabarit permises dans le contenu (comparées sans espaces superflus). */
export const BALISES_PERMISES: ReadonlySet<string> = new Set(["UnsubscribeURL", "MessageURL", ".Subscriber.Name", ".Subscriber.FirstName", ".Subscriber.LastName", ".Subscriber.Email"]);
export const LIENS_MAX = 50;

const RE_BALISE = /\{\{([\s\S]*?)\}\}/g;
const RE_DESINSCRIPTION = /\{\{\s*UnsubscribeURL\s*\}\}/;
const RE_ATTRIBUT_LIEN = /\b(?:href|src|action|background|poster)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
const RE_URL_TEXTE = /\bhttps?:\/\/[^\s<>"'`)\]]+/gi;
const RE_ELEMENT_INTERDIT = /<\s*(script|iframe|frame|frameset|object|embed|form|applet|meta|base)\b/i;
const RE_EVENEMENT = /<[^>]+\s(on[a-z]+)\s*=/i;

export class ErreurContenu extends Error {}

export function contientDesinscription(texte: string): boolean {
  return RE_DESINSCRIPTION.test(texte);
}

/** Refuse toute balise de gabarit hors liste blanche. */
export function verifierBalises(texte: string, quoi: string): void {
  for (const m of texte.matchAll(RE_BALISE)) {
    const interieur = (m[1] ?? "").trim();
    if (!BALISES_PERMISES.has(interieur)) {
      throw new ErreurContenu(`${quoi} : balise de gabarit « {{ ${interieur.slice(0, 40)} }} » refusée (permises : ${[...BALISES_PERMISES].map((b) => `{{ ${b} }}`).join(", ")}).`);
    }
  }
}

/** Ajoute le pied de page de désinscription s'il manque, dans les deux versions (HTML et texte). */
export function avecDesinscription(html: string, texte: string): { html: string; texte: string; ajoute: boolean } {
  let h = html;
  let t = texte;
  let ajoute = false;
  if (!contientDesinscription(h)) {
    h = `${h}\n<hr>\n<p style="font-size:12px;color:#666">Vous recevez ce message parce que vous avez accepté de recevoir nos communications. <a href="${BALISE_DESINSCRIPTION}">Se désinscrire</a>.</p>`;
    ajoute = true;
  }
  if (!contientDesinscription(t)) {
    t = `${t}\n\n--\nPour ne plus recevoir nos messages, désinscrivez-vous : ${BALISE_DESINSCRIPTION}`;
    ajoute = true;
  }
  return { html: h, texte: t, ajoute };
}

/** Adresses http(s) citées dans le contenu (liens des attributs et adresses nues du texte), sans doublon. */
export function liensDuContenu(html: string, texte: string): { urls: string[]; relatifs: string[]; interdits: string[] } {
  const urls = new Set<string>();
  const relatifs: string[] = [];
  const interdits: string[] = [];
  for (const m of html.matchAll(RE_ATTRIBUT_LIEN)) {
    const valeur = (m[1] ?? m[2] ?? m[3] ?? "").trim();
    if (valeur === "" || valeur.startsWith("{{") || valeur.startsWith("#") || /^(mailto|tel):/i.test(valeur)) continue;
    if (/^https?:\/\//i.test(valeur)) urls.add(valeur);
    else if (valeur.startsWith("//")) urls.add(`https:${valeur}`);
    else if (/^[a-z][a-z0-9+.-]*:/i.test(valeur)) interdits.push(valeur.slice(0, 60));
    else relatifs.push(valeur.slice(0, 60));
  }
  for (const contenu of [html, texte]) for (const m of contenu.matchAll(RE_URL_TEXTE)) urls.add(m[0].replace(/[.,;:!?]+$/, ""));
  return { urls: [...urls], relatifs, interdits };
}

/**
 * Contrôle complet du contenu : renvoie le HTML et le texte à enregistrer (pied de désinscription compris) ou lève une erreur claire.
 */
export async function controlerContenu(html: string, texte: string, options: Pick<OptionsVerification, "adresseAutorisee" | "resoudre"> = {}): Promise<{ html: string; texte: string; desinscriptionAjoutee: boolean; liens: number }> {
  if (RE_ELEMENT_INTERDIT.test(html)) throw new ErreurContenu("Contenu HTML refusé : script, cadre, objet, formulaire ou balise <meta>/<base> non permis dans un e-mail.");
  if (RE_EVENEMENT.test(html)) throw new ErreurContenu("Contenu HTML refusé : gestionnaire d'événement (onclick, onload...) non permis.");
  verifierBalises(html, "Contenu HTML");
  verifierBalises(texte, "Contenu texte");
  const fin = avecDesinscription(html, texte);
  const { urls, relatifs, interdits } = liensDuContenu(fin.html, fin.texte);
  if (interdits.length > 0) throw new ErreurContenu(`Lien refusé (schéma non permis) : ${interdits[0]}. Seuls http, https, mailto et tel sont permis.`);
  if (relatifs.length > 0) throw new ErreurContenu(`Lien relatif refusé (« ${relatifs[0]} ») : un e-mail n'a pas de site de base, donner l'adresse complète.`);
  if (urls.length > LIENS_MAX) throw new ErreurContenu(`Trop de liens distincts (${urls.length}, ${LIENS_MAX} au plus).`);
  for (const u of urls) {
    try {
      await exigerUrlPublique(u, options);
    } catch (e) {
      throw new ErreurContenu(`Lien refusé (${u.slice(0, 80)}) : ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (!contientDesinscription(fin.html) || !contientDesinscription(fin.texte)) throw new ErreurContenu("Lien de désinscription absent (contrôle final) : campagne refusée.");
  return { html: fin.html, texte: fin.texte, desinscriptionAjoutee: fin.ajoute, liens: urls.length };
}
