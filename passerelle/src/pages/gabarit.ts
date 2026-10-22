// Gabarit HTML et CSS des pages de destination : sobre, accessible (WCAG 2.2 AA visé), mobile d'abord, sans dépendance
// externe, sans script en ligne ni style en ligne (la CSP interdit les deux). TOUT contenu venu d'un agent ou d'un
// visiteur passe par `echapper` : il n'existe aucune insertion de HTML brut.

import { CRENEAUX, type CodeCreneau } from "./contenu.js";
import type { PageDestination } from "./magasin.js";

const ECHAPPEMENTS: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" };

/** Échappe un texte pour le HTML (contenu d'élément ET valeur d'attribut entre guillemets). */
export function echapper(texte: string): string {
  return texte.replace(/[&<>"'`]/gu, (c) => ECHAPPEMENTS[c] as string);
}

function paragraphes(texte: string): string {
  return texte
    .split(/\n{2,}/u)
    .map((p) => `<p>${echapper(p).replace(/\n/gu, "<br>")}</p>`)
    .join("\n      ");
}

export interface ValeursFormulaire {
  nom: string;
  telephone: string;
  courriel: string;
  creneau: string;
}

export interface OptionsRendu {
  /** Identifiant du site Umami ; null = pas de suivi (Umami indisponible). */
  siteUmami: string | null;
  /** Champ caché anti-CSRF. */
  jeton: string;
  erreurs?: Partial<Record<"nom" | "telephone" | "courriel" | "creneau" | "consentement" | "formulaire", string>>;
  valeurs?: Partial<ValeursFormulaire>;
  indexable: boolean;
}

const VALEURS_VIDES: ValeursFormulaire = { nom: "", telephone: "", courriel: "", creneau: "peu_importe" };

function entete(titre: string, description: string, o: { siteUmami: string | null; indexable: boolean }): string {
  const suivi = o.siteUmami
    ? `\n  <script defer src="/_s/script.js" data-website-id="${echapper(o.siteUmami)}" data-do-not-track="true"></script>`
    : "";
  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">${o.indexable ? "" : '\n  <meta name="robots" content="noindex, nofollow">'}
  <meta name="referrer" content="no-referrer">
  <title>${echapper(titre)}</title>
  <meta name="description" content="${echapper(description)}">
  <link rel="stylesheet" href="/_a/page.css">${suivi}
</head>`;
}

function champ(id: string, etiquette: string, o: { type: string; valeur: string; erreur: string | undefined; requis: boolean; autocomplete: string; aide?: string; inputmode?: string; maxlength: number }): string {
  const decrit = [o.aide ? `${id}-aide` : "", o.erreur ? `${id}-erreur` : ""].filter(Boolean).join(" ");
  return `
      <div class="champ${o.erreur ? " en-erreur" : ""}">
        <label for="${id}">${echapper(etiquette)}${o.requis ? "" : ' <span class="facultatif">(facultatif)</span>'}</label>
        ${o.aide ? `<p class="aide" id="${id}-aide">${echapper(o.aide)}</p>` : ""}
        <input id="${id}" name="${id}" type="${o.type}" value="${echapper(o.valeur)}" autocomplete="${o.autocomplete}"${o.inputmode ? ` inputmode="${o.inputmode}"` : ""} maxlength="${o.maxlength}"${o.requis ? " required" : ""}${o.erreur ? ' aria-invalid="true"' : ""}${decrit ? ` aria-describedby="${decrit}"` : ""}>
        ${o.erreur ? `<p class="erreur" id="${id}-erreur">${echapper(o.erreur)}</p>` : ""}
      </div>`;
}

/** Page de destination avec son formulaire « On vous rappelle ». */
export function rendrePage(page: PageDestination, o: OptionsRendu): string {
  const v = { ...VALEURS_VIDES, ...o.valeurs };
  const e = o.erreurs ?? {};
  const liste = (["nom", "telephone", "courriel", "creneau", "consentement"] as const).filter((k) => e[k]);
  const synthese =
    liste.length > 0 || e.formulaire
      ? `
    <div class="synthese" role="alert">
      <h2>${e.formulaire ? "Envoi impossible" : "Le formulaire contient des erreurs"}</h2>
      ${e.formulaire ? `<p>${echapper(e.formulaire)}</p>` : ""}${
        liste.length > 0
          ? `<ul>${liste.map((k) => `<li><a href="#${k === "consentement" ? "consentement" : k}">${echapper(e[k] as string)}</a></li>`).join("")}</ul>`
          : ""
      }
    </div>`
      : "";
  const creneaux = CRENEAUX.map((c) => `<option value="${c.code}"${v.creneau === c.code ? " selected" : ""}>${echapper(c.libelle)}</option>`).join("");
  return `${entete(page.titre, page.accroche, o)}
<body>
  <a class="saut" href="#formulaire">Aller au formulaire</a>
  <main>
    <header>
      <p class="marque">${echapper(page.responsable)}</p>
      <h1>${echapper(page.titre)}</h1>
      <p class="accroche">${echapper(page.accroche)}</p>
    </header>
    <section class="offre" aria-labelledby="offre-titre">
      <h2 id="offre-titre">${echapper(page.offreIntitule)}</h2>
      ${paragraphes(page.offreDescription)}
    </section>
    <section class="rappel" aria-labelledby="formulaire-titre">
      <h2 id="formulaire-titre">On vous rappelle</h2>${synthese}
      <form id="formulaire" method="post" action="/p/${echapper(page.slug)}" accept-charset="utf-8">
        ${champ("nom", "Votre nom", { type: "text", valeur: v.nom, erreur: e.nom, requis: true, autocomplete: "name", maxlength: 100 })}${champ("telephone", "Votre numéro de téléphone", { type: "tel", valeur: v.telephone, erreur: e.telephone, requis: true, autocomplete: "tel", inputmode: "tel", maxlength: 30, aide: "Exemple : 0470 12 34 56 ou +32 470 12 34 56." })}${champ("courriel", "Votre adresse e-mail", { type: "email", valeur: v.courriel, erreur: e.courriel, requis: false, autocomplete: "email", inputmode: "email", maxlength: 254 })}
        <div class="champ${e.creneau ? " en-erreur" : ""}">
          <label for="creneau">Créneau préféré pour le rappel</label>
          <select id="creneau" name="creneau"${e.creneau ? ' aria-invalid="true" aria-describedby="creneau-erreur"' : ""}>${creneaux}</select>
          ${e.creneau ? `<p class="erreur" id="creneau-erreur">${echapper(e.creneau)}</p>` : ""}
        </div>
        <div class="champ consentement${e.consentement ? " en-erreur" : ""}">
          <div class="case">
            <input id="consentement" name="consentement" type="checkbox" value="oui" required${e.consentement ? ' aria-invalid="true" aria-describedby="consentement-erreur"' : ""}>
            <label for="consentement">${echapper(page.texteConsentement)}</label>
          </div>
          ${e.consentement ? `<p class="erreur" id="consentement-erreur">${echapper(e.consentement)}</p>` : ""}
        </div>
        <div class="piege" aria-hidden="true">
          <label for="site_web">Ne pas remplir ce champ</label>
          <input id="site_web" name="site_web" type="text" tabindex="-1" autocomplete="off" value="">
        </div>
        <input type="hidden" name="jeton" value="${echapper(o.jeton)}">
        <button type="submit">Être rappelé(e)</button>
      </form>
    </section>
  </main>
  <footer>
    <p>Responsable du traitement : ${echapper(page.responsable)}. Pour exercer vos droits ou retirer votre consentement : ${echapper(page.contactConfidentialite)}.</p>
  </footer>
</body>
</html>
`;
}

/** Page de remerciement (aussi la page comptée par Umami comme « envoi du formulaire »). */
export function rendreMerci(page: PageDestination, o: { siteUmami: string | null; indexable: boolean }): string {
  return `${entete(`Merci : ${page.titre}`, "Votre demande est bien reçue.", o)}
<body>
  <main>
    <header>
      <p class="marque">${echapper(page.responsable)}</p>
      <h1>Merci, votre demande est bien reçue</h1>
      <p class="accroche">Un conseiller vous rappelle sous 24 h, sur le créneau que vous avez choisi dans la mesure du possible.</p>
    </header>
    <p><a class="lien" href="/p/${echapper(page.slug)}">Retour à la page</a></p>
  </main>
  <footer>
    <p>Pour retirer votre consentement ou exercer vos droits : ${echapper(page.contactConfidentialite)}.</p>
  </footer>
</body>
</html>
`;
}

/** Page d'erreur simple (404, 403, 429...). Aucun contenu du visiteur n'y figure. */
export function rendreErreur(titre: string, message: string): string {
  return `${entete(titre, message, { siteUmami: null, indexable: false })}
<body>
  <main>
    <header>
      <h1>${echapper(titre)}</h1>
      <p class="accroche">${echapper(message)}</p>
    </header>
  </main>
</body>
</html>
`;
}

export type { CodeCreneau };

export const CSS_PAGE = `/* Pages de destination de l'atelier : sobre, lisible, mobile d'abord. */
:root {
  --fond: #fbfaf6;
  --encre: #1c2024;
  --encre-douce: #4a5058;
  --trait: #b9b4a6;
  --carte: #ffffff;
  --accent: #1d5b47;
  --accent-texte: #ffffff;
  --erreur: #9c2517;
  --focus: #0b57d0;
}
@media (prefers-color-scheme: dark) {
  :root {
    --fond: #16181b;
    --encre: #eceae4;
    --encre-douce: #b4b1a8;
    --trait: #5b5f66;
    --carte: #1f2226;
    --accent: #7fcfb0;
    --accent-texte: #0f1f19;
    --erreur: #ff9d8e;
    --focus: #8ab4ff;
  }
}
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  background: var(--fond);
  color: var(--encre);
  font: 1.0625rem/1.6 system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}
main, footer { width: min(100% - 2.5rem, 40rem); margin-inline: auto; }
main { padding-block: 2.5rem 1.5rem; }
header { margin-bottom: 2rem; }
.marque { margin: 0 0 .75rem; font-size: .9375rem; font-weight: 600; letter-spacing: .02em; color: var(--encre-douce); }
h1 { margin: 0 0 .75rem; font-size: clamp(1.75rem, 6vw, 2.5rem); line-height: 1.15; font-weight: 700; text-wrap: balance; }
h2 { margin: 0 0 .75rem; font-size: 1.375rem; line-height: 1.25; }
p { margin: 0 0 1rem; max-width: 65ch; }
.accroche { font-size: 1.1875rem; color: var(--encre-douce); }
.offre { margin-bottom: 2rem; padding-bottom: 1.5rem; border-bottom: 1px solid var(--trait); }
.rappel { padding: 1.5rem 1.25rem; background: var(--carte); border: 1px solid var(--trait); border-radius: .5rem; }
.champ { margin-bottom: 1.25rem; }
label { display: block; margin-bottom: .375rem; font-weight: 600; }
.facultatif { font-weight: 400; color: var(--encre-douce); }
.aide { margin: 0 0 .375rem; font-size: .9375rem; color: var(--encre-douce); }
input[type="text"], input[type="tel"], input[type="email"], select {
  display: block; width: 100%; min-height: 3rem; padding: .625rem .75rem;
  font: inherit; color: var(--encre); background: var(--fond);
  border: 1.5px solid var(--encre-douce); border-radius: .375rem;
}
.en-erreur input:not([type="checkbox"]), .en-erreur select { border-color: var(--erreur); }
:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
.case { display: flex; gap: .75rem; align-items: flex-start; }
.case input { flex: none; width: 1.5rem; height: 1.5rem; margin: .2rem 0 0; accent-color: var(--accent); }
.case label { margin: 0; font-weight: 400; }
.erreur { margin: .375rem 0 0; font-size: .9375rem; font-weight: 600; color: var(--erreur); }
.synthese { margin-bottom: 1.25rem; padding: .875rem 1rem; border: 2px solid var(--erreur); border-radius: .375rem; }
.synthese h2 { margin-bottom: .5rem; font-size: 1.0625rem; color: var(--erreur); }
.synthese ul { margin: 0; padding-left: 1.25rem; }
.synthese a { color: var(--encre); }
button {
  display: block; width: 100%; min-height: 3.25rem; padding: .75rem 1.25rem;
  font: inherit; font-weight: 700; color: var(--accent-texte); background: var(--accent);
  border: 2px solid var(--accent); border-radius: .375rem; cursor: pointer;
}
button:hover { filter: brightness(1.08); }
.lien { color: var(--accent); font-weight: 600; }
footer { padding-block: 1rem 3rem; font-size: .9375rem; color: var(--encre-douce); }
.saut { position: absolute; left: -999px; top: 0; padding: .75rem 1rem; background: var(--accent); color: var(--accent-texte); }
.saut:focus { left: 0; z-index: 10; }
.piege { position: absolute; left: -10000px; width: 1px; height: 1px; overflow: hidden; }
@media (min-width: 40rem) {
  main { padding-block: 4rem 2rem; }
  .rappel { padding: 2rem; }
  button { display: inline-block; width: auto; min-width: 14rem; }
}
`;
