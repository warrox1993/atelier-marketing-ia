/**
 * Base de clients (lot P11) : import guidé en trois étapes (fichier, correspondance des colonnes avec
 * aperçu, résultat), suppression totale avec confirmation saisie, ajout d'une opposition.
 * L'usine ne contacte personne : cet écran ne sert qu'à charger, effacer et protéger des données.
 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useHostContext } from "@paperclipai/plugin-sdk/ui";
import {
  ColonneCible,
  CorrespondanceColonnes,
  ImporterBaseClientsEntree,
  LIMITES_PROSPECTION,
  MOTS_COLONNES_SENSIBLES,
  type AjouterOppositionEntree,
  type ImportBaseClients,
} from "../contrats/prospection.js";
import { Bouton, BoutonAller, Champ, EtatErreur, Horodatage, Section, Vide } from "./composants.js";
import { nombre } from "./format.js";
import { appelRoute } from "./routes-prospection.js";

const CONFIRMATION_SUPPRESSION = "SUPPRIMER LA BASE CLIENTS";

export const LIBELLES_COLONNES: Readonly<Record<ColonneCible, string>> = {
  identifiant_client: "Identifiant client",
  type_client: "Type de client",
  nom: "Nom",
  prenom: "Prénom",
  entreprise: "Entreprise",
  numero_bce: "Numéro BCE",
  courriel: "Courriel",
  telephone: "Téléphone",
  adresse: "Adresse",
  code_postal: "Code postal",
  commune: "Commune",
  produits_detenus: "Produits détenus",
  debut_contrat: "Début de contrat",
  statut_client: "Statut du client",
  consentement_courriel: "Consentement courriel",
  consentement_sms: "Consentement SMS",
  consentement_telephone: "Consentement téléphone",
  ignorer: "Ne pas importer",
};

/** Sans accents ni casse, pour comparer des noms de colonnes. */
function normaliser(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

/** Une colonne dont le nom évoque une donnée de santé, de sinistre ou bancaire n'est jamais importée (§4.3). */
export function colonneSensible(nom: string): boolean {
  const n = normaliser(nom);
  return MOTS_COLONNES_SENSIBLES.some((m) => new RegExp(`(^|[^a-z])${m}([^a-z]|$)`, "u").test(n));
}

const SYNONYMES: ReadonlyArray<[ColonneCible, RegExp]> = [
  ["numero_bce", /bce|tva|entreprise.*num|numero.*entreprise/u],
  ["code_postal", /code.?postal|^cp$|postcode/u],
  ["courriel", /mail|courriel/u],
  ["telephone", /tel|gsm|mobile/u],
  ["prenom", /prenom|firstname/u],
  ["nom", /^nom|lastname|^name/u],
  ["commune", /commune|ville|localite|city/u],
  ["adresse", /adresse|rue|address/u],
  ["identifiant_client", /^id|identifiant|reference|numero.?client/u],
  ["produits_detenus", /produit|contrat|police/u],
  ["entreprise", /societe|entreprise|denomination/u],
];

/** Proposition de départ pour une colonne : l'humain la corrige toujours. */
export function proposerCible(nom: string): ColonneCible {
  if (colonneSensible(nom)) return "ignorer";
  const n = normaliser(nom);
  return SYNONYMES.find(([, re]) => re.test(n))?.[0] ?? "ignorer";
}

/** Découpe une ligne CSV (guillemets doubles pris en charge). */
export function decouperLigne(ligne: string, sep: string): string[] {
  const champs: string[] = [];
  let cur = "";
  let guillemets = false;
  for (let i = 0; i < ligne.length; i += 1) {
    const c = ligne[i]!;
    if (c === '"') {
      if (guillemets && ligne[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else guillemets = !guillemets;
    } else if (c === sep && !guillemets) {
      champs.push(cur);
      cur = "";
    } else cur += c;
  }
  champs.push(cur);
  return champs.map((x) => x.trim());
}

export function detecterSeparateur(entete: string): ";" | "," | "\t" {
  const n = (s: string) => entete.split(s).length;
  const candidats: Array<";" | "," | "\t"> = [";", ",", "\t"];
  return candidats.reduce((m, s) => (n(s) > n(m) ? s : m), ";" as ";" | "," | "\t");
}

function lireTexte(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const l = new FileReader();
    l.onload = () => res(String(l.result ?? ""));
    l.onerror = () => rej(l.error);
    l.readAsText(blob);
  });
}

export function lireBase64(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const l = new FileReader();
    l.onload = () => res(String(l.result ?? "").replace(/^data:[^,]*,/u, ""));
    l.onerror = () => rej(l.error);
    l.readAsDataURL(blob);
  });
}

type Format = "csv" | "xlsx";

interface Fichier {
  nom: string;
  format: Format;
  base64: string;
  separateur: ";" | "," | "\t" | undefined;
}

/** Réponse de `base-clients.apercu` : colonnes et premières lignes lues par le serveur (CSV comme XLSX). */
interface ApercuFichier {
  colonnes: string[];
  apercu: string[][];
  lignes: number;
  colonnesSensiblesRefusees: string[];
  formulesNeutralisees: number;
  injectionsSignalees: number;
}

/** Réponse de `base-clients.etat` : ce que la base clients contient en ce moment. */
export interface EtatBase {
  existe: boolean;
  clients: number;
  actifs: number;
  nomFichier: string | null;
  format: string | null;
  importeLe: string | null;
  importePar: string | null;
  purgeLe: string | null;
  finalite: string | null;
  dureeConservationMois: number | null;
  mode: "demonstration" | "reel" | null;
  aPurger: boolean;
}

const ETAPES = ["Choisir le fichier", "Associer les colonnes", "Résultat"] as const;

function Etapes({ courante }: { courante: 0 | 1 | 2 }) {
  return (
    <ol className="atl-etapes" aria-label="Étapes de l'import">
      {ETAPES.map((e, i) => (
        <li key={e} aria-current={i === courante ? "step" : undefined} data-fait={i < courante || undefined}>
          <span className="atl-etape-num">{i + 1}</span> {e}
        </li>
      ))}
    </ol>
  );
}

function ImportGuide({ etatBase, onChange }: { etatBase: EtatBase | null; onChange(): void }) {
  const { companyId } = useHostContext();
  const [etape, setEtape] = useState<0 | 1 | 2>(0);
  const [fichier, setFichier] = useState<Fichier | null>(null);
  const [erreurFichier, setErreurFichier] = useState<string | null>(null);
  const [apercuFichier, setApercuFichier] = useState<ApercuFichier | null>(null);
  const [enApercu, setEnApercu] = useState(false);
  const [cibles, setCibles] = useState<Record<string, ColonneCible>>({});
  const [finalite, setFinalite] = useState("");
  const [duree, setDuree] = useState(String(LIMITES_PROSPECTION.conservationMoisDefaut));
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<unknown>(null);
  const [resultat, setResultat] = useState<ImportBaseClients | null>(null);

  const colonnes = Array.isArray(apercuFichier?.colonnes) ? apercuFichier.colonnes : [];
  const refusees = new Set(apercuFichier?.colonnesSensiblesRefusees ?? []);
  const estSensible = (c: string) => colonneSensible(c) || refusees.has(c);
  const correspondance = colonnes.map((colonne) => ({ colonne, cible: estSensible(colonne) ? ("ignorer" as const) : (cibles[colonne] ?? proposerCible(colonne)) }));
  const analyse = CorrespondanceColonnes.safeParse(correspondance);
  const raisonCorrespondance = colonnes.length === 0 ? "Aucune colonne à associer." : analyse.success ? null : (analyse.error.issues[0]?.message ?? "Correspondance invalide.");
  const dureeMois = Number(duree);
  const dureeValide = Number.isInteger(dureeMois) && dureeMois >= 1 && dureeMois <= LIMITES_PROSPECTION.conservationMoisMax;

  async function choisir(f: File | undefined) {
    setErreurFichier(null);
    setFichier(null);
    setApercuFichier(null);
    if (!f) return;
    const nom = f.name;
    if (/\.xls[mb]$/iu.test(nom)) return setErreurFichier("Les fichiers à macros ou binaires (.xlsm, .xlsb) sont refusés. Enregistrez le fichier en .xlsx ou en .csv.");
    const format: Format | null = /\.csv$/iu.test(nom) ? "csv" : /\.xlsx$/iu.test(nom) ? "xlsx" : null;
    if (!format) return setErreurFichier("Format non pris en charge : choisissez un fichier .csv ou .xlsx.");
    if (f.size > LIMITES_PROSPECTION.baseClientsTailleMaxOctets) return setErreurFichier(`Fichier trop volumineux : ${nombre(Math.round(f.size / 1024 / 1024))} Mo, le maximum est ${LIMITES_PROSPECTION.baseClientsTailleMaxOctets / 1024 / 1024} Mo.`);
    try {
      const base64 = await lireBase64(f);
      let separateur: Fichier["separateur"];
      if (format === "csv") {
        // Seul le séparateur est deviné ici ; les colonnes et l'aperçu viennent du serveur (route d'aperçu).
        const debut = (await lireTexte(f.slice(0, 65536))).replace(/^﻿/u, "");
        const lignes = debut.split(/\r?\n/u).filter((l) => l.trim() !== "");
        separateur = detecterSeparateur(lignes[0] ?? "");
        if (decouperLigne(lignes[0] ?? "", separateur).filter(Boolean).length === 0) return setErreurFichier("Le fichier est vide : la première ligne doit contenir les noms des colonnes.");
      }
      setFichier({ nom, format, base64, separateur });
      setCibles({});
    } catch {
      setErreurFichier("Le fichier n'a pas pu être lu par le navigateur. Réessayez avec un autre fichier.");
    }
  }

  const finaliteOk = finalite.trim().length >= 10;
  const raisonEtape1 = !fichier ? "Choisissez d'abord un fichier." : !finaliteOk ? "Indiquez la finalité (10 caractères au moins)." : !dureeValide ? `Durée de conservation : un nombre entier de mois, de 1 à ${LIMITES_PROSPECTION.conservationMoisMax}.` : null;

  /** Étape 1 vers 2 : le serveur lit le fichier (CSV ou XLSX) et renvoie colonnes et aperçu, sans rien stocker. */
  async function lireApercu() {
    if (!fichier || !companyId) return;
    setEnApercu(true);
    setErreur(null);
    try {
      const r = await appelRoute<ApercuFichier>("POST", "/base-clients/apercu", {
        companyId,
        nomFichier: fichier.nom,
        format: fichier.format,
        contenuBase64: fichier.base64,
        ...(fichier.format === "csv" && fichier.separateur ? { separateur: fichier.separateur } : {}),
      });
      if (!Array.isArray(r?.colonnes) || r.colonnes.length === 0) throw { code: "APERCU_VIDE", message: "Le serveur n'a trouvé aucune colonne dans ce fichier : la première ligne doit contenir leurs noms." };
      setApercuFichier(r);
      setCibles({});
      setEtape(1);
    } catch (e) {
      setErreur(e);
    } finally {
      setEnApercu(false);
    }
  }

  async function importer() {
    if (!fichier || !companyId) return;
    const entree = {
      companyId,
      nomFichier: fichier.nom,
      format: fichier.format,
      contenuBase64: fichier.base64,
      correspondance,
      ...(fichier.format === "csv" && fichier.separateur ? { separateur: fichier.separateur } : {}),
      finalite: finalite.trim(),
      dureeConservationMois: dureeMois,
    };
    const verif = ImporterBaseClientsEntree.safeParse(entree);
    if (!verif.success) {
      setErreur({ code: "ENTREE_INVALIDE", message: verif.error.issues[0]?.message ?? "Import invalide." });
      return;
    }
    setEnCours(true);
    setErreur(null);
    try {
      setResultat(await appelRoute<ImportBaseClients>("POST", "/base-clients/imports", verif.data));
      setEtape(2);
      onChange();
    } catch (e) {
      setErreur(e);
    } finally {
      setEnCours(false);
    }
  }

  function recommencer() {
    setEtape(0);
    setFichier(null);
    setResultat(null);
    setErreur(null);
    setApercuFichier(null);
    setCibles({});
  }

  return (
    <Section titre="Importer la base de clients" id="atl-import-base-clients" aide="Le fichier n'est pas conservé : seuls ses comptes et une empreinte le sont. Les identifiants directs sont chiffrés, rien n'est envoyé à personne.">
      <Etapes courante={etape} />
      {etape === 0 ? (
        <div className="atl-formulaire">
          <Champ libelle="Fichier de la base clients (.csv ou .xlsx)" aide={`${LIMITES_PROSPECTION.baseClientsTailleMaxOctets / 1024 / 1024} Mo au maximum. Première feuille seulement pour un .xlsx.`}>
            <ChoixFichier accept=".csv,.xlsx" nom={fichier?.nom ?? null} onChoisir={(f) => void choisir(f)} />
          </Champ>
          {erreurFichier ? (
            <p className="atl-texte-danger" role="alert">
              {erreurFichier}
            </p>
          ) : null}
          <Champ libelle="Finalité du traitement" aide="Pourquoi cette base est chargée (obligation d'information, 10 caractères au moins).">
            <input value={finalite} onChange={(e) => setFinalite(e.target.value)} maxLength={500} autoComplete="off" />
          </Champ>
          <Champ libelle="Durée de conservation (mois)" aide={`Au terme de cette durée sans nouvel import, la base est purgée. Défaut : ${LIMITES_PROSPECTION.conservationMoisDefaut} mois.`}>
            <input value={duree} onChange={(e) => setDuree(e.target.value)} inputMode="numeric" autoComplete="off" />
          </Champ>
          {erreur ? <EtatErreur erreur={erreur} contexte="lecture du fichier" /> : null}
          <div className="atl-actions">
            <Bouton variante="principal" raisonDesactive={raisonEtape1} enCours={enApercu} onClick={() => void lireApercu()}>
              Continuer : associer les colonnes
            </Bouton>
          </div>
        </div>
      ) : null}
      {etape === 1 && fichier ? (
        <div className="atl-formulaire">
          <p>
            Fichier <strong>{fichier.nom}</strong>. Pour chaque colonne, choisissez ce qu'elle contient. Les colonnes de santé, de sinistre ou bancaires sont toujours refusées.
          </p>
          <p className="atl-sous">
            {nombre(apercuFichier?.lignes ?? 0)} lignes lues par le serveur
            {fichier.format === "xlsx" ? " (première feuille)" : ""}.
          </p>
          {(apercuFichier?.formulesNeutralisees ?? 0) > 0 ? <p className="atl-sous">{nombre(apercuFichier!.formulesNeutralisees)} formules neutralisées : elles sont lues comme du texte, jamais calculées.</p> : null}
          {(apercuFichier?.injectionsSignalees ?? 0) > 0 ? <p className="atl-sous">{nombre(apercuFichier!.injectionsSignalees)} cellules suspectes signalées (début de formule ou commande) : elles seront neutralisées à l'import.</p> : null}
          <div className="atl-encart" data-ton="attention">
            <p className="atl-encart-titre">Un nouvel import remplace la base clients actuelle</p>
            <p>
              {etatBase?.existe ? (
                <>
                  La base actuelle ({nombre(etatBase.clients)} clients, fichier {etatBase.nomFichier ?? "inconnu"}) sera effacée au profit de ce fichier. Les oppositions sont gardées.
                </>
              ) : (
                "Aucune base n'est chargée pour l'instant : ce fichier deviendra la base clients. Un import ultérieur la remplacera entièrement."
              )}
            </p>
          </div>
          {colonnes.length > 0 ? (
            <div className="atl-table-cadre">
              <table className="atl-table">
                <thead>
                  <tr>
                    <th scope="col">Colonne du fichier</th>
                    <th scope="col">Aperçu</th>
                    <th scope="col">Contenu</th>
                  </tr>
                </thead>
                <tbody>
                  {colonnes.map((c, i) => {
                    const sensible = estSensible(c);
                    const valeur = correspondance[i]!.cible;
                    return (
                      <tr key={c}>
                        <th scope="row">{c}</th>
                        <td data-libelle="Aperçu" className="atl-attenue">
                          {(apercuFichier?.apercu ?? []).slice(0, 3).map((l) => l[i] ?? "").filter(Boolean).join(" · ") || "vide"}
                        </td>
                        <td data-libelle="Contenu">
                          <select aria-label={`Contenu de la colonne ${c}`} value={valeur} disabled={sensible} onChange={(e) => setCibles({ ...cibles, [c]: e.target.value as ColonneCible })}>
                            {ColonneCible.options.map((o) => (
                              <option key={o} value={o}>
                                {LIBELLES_COLONNES[o]}
                              </option>
                            ))}
                          </select>
                          {sensible ? <span className="atl-sous">Colonne sensible : refusée à l'import.</span> : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
          {erreur ? <EtatErreur erreur={erreur} contexte="import de la base clients" /> : null}
          <div className="atl-actions">
            <Bouton onClick={() => { setErreur(null); setEtape(0); }}>Retour</Bouton>
            <Bouton variante="principal" raisonDesactive={raisonCorrespondance} enCours={enCours} onClick={() => void importer()}>
              Importer la base clients
            </Bouton>
          </div>
        </div>
      ) : null}
      {etape === 2 && resultat ? <ResultatImport r={resultat} onRecommencer={recommencer} /> : null}
    </Section>
  );
}

function ResultatImport({ r, onRecommencer }: { r: ImportBaseClients; onRecommencer(): void }) {
  return (
    <div className="atl-formulaire" role="status">
     
      <p className="atl-resume">
        <span>
          <strong>{nombre(r.lignesRetenues)}</strong> lignes importées
        </span>
        <span>
          <strong>{nombre(r.lignesRejetees)}</strong> lignes rejetées
        </span>
        <span>
          <strong>{nombre(r.lignesLues)}</strong> lues
        </span>
      </p>
      <p>
        Conservation : {r.dureeConservationMois} mois, purge prévue le <Horodatage iso={r.purgeLe} seulementDate />.
      </p>
      {r.colonnesSensiblesRefusees.length > 0 ? (
        <div className="atl-encart" data-ton="attention">
          <p className="atl-encart-titre">Colonnes sensibles refusées</p>
          <p>{r.colonnesSensiblesRefusees.join(", ")} : ces colonnes n'ont pas été importées.</p>
        </div>
      ) : null}
      {r.rejets.length > 0 ? (
        <div>
          <h3 className="atl-h3">Lignes rejetées</h3>
          <ul className="atl-liste">
            {r.rejets.map((x) => (
              <li key={x.ligne}>
                Ligne {x.ligne} : {x.motif}
              </li>
            ))}
          </ul>
          {r.lignesRejetees > r.rejets.length ? <p className="atl-sous">{nombre(r.lignesRejetees - r.rejets.length)} autres rejets non détaillés.</p> : null}
        </div>
      ) : (
        <p className="atl-succes">Aucune ligne rejetée.</p>
      )}
      <div className="atl-actions">
        <Bouton onClick={onRecommencer}>Importer un autre fichier</Bouton>
      </div>
    </div>
  );
}

function SuppressionBase({ onChange, baseExiste }: { onChange(): void; baseExiste: boolean }) {
  const { companyId } = useHostContext();
  const [ouvert, setOuvert] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [motif, setMotif] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<unknown>(null);
  const [fait, setFait] = useState<{ clients: number | null } | null>(null);
  const raison = confirmation !== CONFIRMATION_SUPPRESSION ? `Saisissez exactement « ${CONFIRMATION_SUPPRESSION} » pour confirmer.` : motif.trim().length < 3 ? "Indiquez le motif (3 caractères au moins)." : null;

  async function supprimer() {
    if (!companyId) return;
    setEnCours(true);
    setErreur(null);
    try {
      const r = await appelRoute<{ clientsSupprimes?: number } | null>("POST", "/base-clients/suppression", { companyId, confirmation: CONFIRMATION_SUPPRESSION, motif: motif.trim() });
      setFait({ clients: typeof r?.clientsSupprimes === "number" ? r.clientsSupprimes : null });
      onChange();
      setOuvert(false);
      setConfirmation("");
      setMotif("");
    } catch (e) {
      setErreur(e);
    } finally {
      setEnCours(false);
    }
  }

  // Sans base à effacer, le bouton rouge n'a pas de raison d'être ; le message de réussite reste affiché après une suppression.
  if (!baseExiste && !fait) return null;
  return (
    <Section titre="Supprimer la base clients" aide="Effacement total et irréversible, journalisé. Les oppositions sont gardées : elles protègent les personnes qui ont refusé d'être contactées.">
      {fait ? (
        <p className="atl-succes" role="status">
          La base clients a été supprimée{fait.clients !== null ? ` (${nombre(fait.clients)} clients effacés)` : ""}. Les oppositions ont été conservées.
        </p>
      ) : null}
      {!ouvert ? (
        <div className="atl-actions">
          <Bouton variante="danger" onClick={() => setOuvert(true)}>
            Supprimer la base clients
          </Bouton>
        </div>
      ) : (
        <div className="atl-encart" data-ton="danger" role="group" aria-label="Confirmation de la suppression">
          <p className="atl-encart-titre">Cette action efface toute la base clients</p>
          <Champ libelle="Motif de la suppression">
            <input value={motif} onChange={(e) => setMotif(e.target.value)} maxLength={500} autoComplete="off" />
          </Champ>
          <Champ libelle="Confirmation" aide={`Recopiez « ${CONFIRMATION_SUPPRESSION} ».`}>
            <input value={confirmation} onChange={(e) => setConfirmation(e.target.value)} autoComplete="off" />
          </Champ>
          {erreur ? <EtatErreur erreur={erreur} contexte="suppression de la base clients" /> : null}
          <div className="atl-actions">
            <Bouton onClick={() => setOuvert(false)}>Annuler</Bouton>
            <Bouton variante="danger" raisonDesactive={raison} enCours={enCours} onClick={() => void supprimer()}>
              Supprimer définitivement la base clients
            </Bouton>
          </div>
        </div>
      )}
    </Section>
  );
}

const TYPES_OPPOSITION: ReadonlyArray<[AjouterOppositionEntree["type"], string]> = [
  ["courriel", "Courriel"],
  ["telephone", "Téléphone"],
  ["numero_bce", "Numéro BCE"],
];

function Opposition() {
  const { companyId } = useHostContext();
  const [ouvert, setOuvert] = useState(false);
  const [type, setType] = useState<AjouterOppositionEntree["type"]>("courriel");
  const [valeur, setValeur] = useState("");
  const [canal, setCanal] = useState<"tous" | "courriel" | "sms" | "telephone" | "courrier">("tous");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<unknown>(null);
  const [fait, setFait] = useState(false);
  const raison = valeur.trim().length < 3 ? "Saisissez la valeur à protéger (3 caractères au moins)." : null;

  async function envoyer(e: FormEvent) {
    e.preventDefault();
    if (raison || !companyId) return;
    setEnCours(true);
    setErreur(null);
    try {
      await appelRoute("POST", "/oppositions", { companyId, type, valeur: valeur.trim(), canal, origine: "humain" });
      setFait(true);
      setOuvert(false);
      setValeur("");
    } catch (err) {
      setErreur(err);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <Section titre="Oppositions" aide="Une personne qui refuse d'être contactée (article 21.3 du RGPD) : seule une empreinte est gardée, jamais la valeur, et elle survit à la suppression de la base.">
      {fait ? (
        <p className="atl-succes" role="status">
          Opposition enregistrée. Ce contact sera exclu de toute prospection.
        </p>
      ) : null}
      {!ouvert ? (
        <div className="atl-actions">
          <Bouton onClick={() => { setOuvert(true); setFait(false); }}>Ajouter une opposition</Bouton>
        </div>
      ) : (
        <form className="atl-formulaire" onSubmit={(e) => void envoyer(e)}>
          <Champ libelle="Type de coordonnée">
            <select value={type} onChange={(e) => setType(e.target.value as AjouterOppositionEntree["type"])}>
              {TYPES_OPPOSITION.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Champ>
          <Champ libelle="Valeur à protéger">
            <input value={valeur} onChange={(e) => setValeur(e.target.value)} autoComplete="off" />
          </Champ>
          <Champ libelle="Canal concerné">
            <select value={canal} onChange={(e) => setCanal(e.target.value as typeof canal)}>
              <option value="tous">Tous les canaux</option>
              <option value="courriel">Courriel</option>
              <option value="sms">SMS</option>
              <option value="telephone">Téléphone</option>
              <option value="courrier">Courrier postal</option>
            </select>
          </Champ>
          {erreur ? <EtatErreur erreur={erreur} contexte="enregistrement de l'opposition" /> : null}
          <div className="atl-actions">
            <Bouton onClick={() => setOuvert(false)}>Annuler</Bouton>
            <Bouton type="submit" variante="principal" raisonDesactive={raison} enCours={enCours}>
              Enregistrer l'opposition
            </Bouton>
          </div>
        </form>
      )}
    </Section>
  );
}

/** État de la base en tête de rubrique : ce qui est chargé, d'où, et jusqu'à quand. */
function EtatBaseClients({ etat, erreur, chargement, onReessayer }: { etat: EtatBase | null; erreur: unknown; chargement: boolean; onReessayer(): void }) {
  return (
    <Section titre="Base clients actuelle" aide="Ce que l'atelier détient en ce moment. Un nouvel import remplace entièrement cette base.">
      {erreur ? <EtatErreur erreur={erreur} onReessayer={onReessayer} contexte="état de la base clients" /> : null}
      {chargement && !etat && !erreur ? <p className="atl-attenue">Chargement de l'état de la base.</p> : null}
      {etat && !etat.existe ? (
        <Vide titre="Aucune base clients" action={<BoutonAller cible="atl-import-base-clients">Importer un fichier</BoutonAller>}>
          Importez un fichier CSV ou Excel pour exclure vos clients actuels et repérer les ventes croisées.
        </Vide>
      ) : null}
      {etat?.existe ? (
        <div className="atl-formulaire" role="status">
         
          <p className="atl-resume">
            <span>
              <strong>{nombre(etat.clients)}</strong> clients
            </span>
            <span>
              <strong>{nombre(etat.actifs)}</strong> actifs
            </span>
          </p>
          <p>
            Fichier <strong>{etat.nomFichier ?? "inconnu"}</strong>
            {etat.format ? ` (${etat.format})` : ""}, importé{etat.importeLe ? <> le <Horodatage iso={etat.importeLe} seulementDate /></> : null}
            {etat.importePar ? ` par ${etat.importePar}` : ""}.
          </p>
          {etat.finalite ? <p className="atl-sous">Finalité : {etat.finalite}.</p> : null}
          <p className="atl-sous">
            Conservation : {etat.dureeConservationMois ?? "?"} mois{etat.purgeLe ? <>, purge prévue le <Horodatage iso={etat.purgeLe} seulementDate /></> : null}.
          </p>
          {etat.aPurger ? (
            <div className="atl-encart" data-ton="attention">
              <p className="atl-encart-titre">Durée de conservation dépassée</p>
              <p>Cette base aurait dû être purgée : supprimez-la ou importez un fichier à jour.</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </Section>
  );
}

/** Réponse de `ventes-croisees.lister` : opportunités sous pseudonyme, jamais de coordonnées. */
export interface VentesCroisees {
  mode: "demonstration" | "reel";
  origineRegles: "client" | "demonstration" | "aucune";
  regles: Array<{ typeClient: "particulier" | "entreprise"; detenue: string; proposee: string; decidePar: string }>;
  clients: number;
  opportunites: Array<{
    pseudonyme: string;
    typeClient: "particulier" | "entreprise";
    detenus: string[];
    proposes: string[];
    codePostal: string | null;
    commune: string | null;
    canauxPermis: string[];
    canaux: Array<{ canal: string; permis: boolean; motif: string }>;
  }>;
}

const LIBELLES_CANAUX: Readonly<Record<string, string>> = { courriel: "Courriel", sms: "SMS", telephone: "Téléphone", courrier: "Courrier" };
const offre = (code: string) => code.replace(/-/gu, " ");

/** Opportunités de vente croisée de la base importée, avec le canal que les bases légales permettent. */
function TableauVentesCroisees({ version }: { version: number }) {
  const { companyId } = useHostContext();
  const [etat, setEtat] = useState<{ data: VentesCroisees | null; erreur: unknown; chargement: boolean }>({ data: null, erreur: null, chargement: true });
  const [essai, setEssai] = useState(0);

  useEffect(() => {
    if (!companyId) return;
    let annule = false;
    setEtat((e) => ({ ...e, erreur: null, chargement: true }));
    appelRoute<VentesCroisees>("GET", `/ventes-croisees?companyId=${encodeURIComponent(companyId)}`)
      .then((data) => !annule && setEtat({ data: data && Array.isArray(data.opportunites) ? data : null, erreur: null, chargement: false }))
      .catch((erreur: unknown) => !annule && setEtat({ data: null, erreur, chargement: false }));
    return () => {
      annule = true;
    };
  }, [companyId, version, essai]);

  const d = etat.data;
  const regles = d?.regles.map((r) => `${offre(r.detenue)} sans ${offre(r.proposee)} (${r.typeClient})`).join(", ");
  return (
    <Section titre="Ventes croisées" aide="Clients qui détiennent un produit sans le produit complémentaire. Les clients restent sous pseudonyme ; le canal indiqué est celui que les bases légales permettent.">
      {etat.erreur ? <EtatErreur erreur={etat.erreur} onReessayer={() => setEssai((x) => x + 1)} contexte="ventes croisées" /> : null}
      {etat.chargement && !d && !etat.erreur ? <p className="atl-attenue">Calcul des ventes croisées.</p> : null}
      {d ? (
        <>
          {d.clients === 0 && d.opportunites.length === 0 ? null : <p className="atl-sous">
            {d.origineRegles === "client" ? `Règles du client : ${regles}.` : d.origineRegles === "demonstration" ? `Règles : ${regles}.` : "Aucune règle de vente croisée enregistrée par le client."}
          </p>}
          {d.opportunites.length === 0 ? (
            <p>{d.clients === 0 ? "Aucune base clients chargée : importez-en une pour voir les ventes croisées." : "Aucune opportunité dans la base actuelle."}</p>
          ) : (
            <table className="atl-table">
              <caption className="atl-sr">Opportunités de vente croisée, client sous pseudonyme</caption>
              <thead>
                <tr>
                  <th scope="col">Client</th>
                  <th scope="col">Détient</th>
                  <th scope="col">À proposer</th>
                  <th scope="col">Canal permis</th>
                </tr>
              </thead>
              <tbody>
                {d.opportunites.map((o) => (
                  <tr key={`${o.pseudonyme}-${o.proposes.join("+")}`}>
                    <th scope="row" data-libelle="Client">
                      {o.pseudonyme}
                      <span className="atl-sous">
                        {o.typeClient === "particulier" ? "Particulier" : "Entreprise"}
                        {o.commune ? `, ${o.commune}` : ""}
                      </span>
                    </th>
                    <td data-libelle="Détient">{o.detenus.map(offre).join(", ")}</td>
                    <td data-libelle="À proposer">{o.proposes.map(offre).join(", ")}</td>
                    <td data-libelle="Canal permis">
                      {o.canauxPermis.length > 0 ? (
                        o.canauxPermis.map((c) => LIBELLES_CANAUX[c] ?? c).join(", ")
                      ) : (
                        <>
                          Aucun
                          <span className="atl-sous">{o.canaux.find((c) => c.canal === "courriel")?.motif ?? o.canaux[0]?.motif ?? ""}</span>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="atl-sous">
            {nombre(d.opportunites.length)} opportunité{d.opportunites.length > 1 ? "s" : ""} sur {nombre(d.clients)} clients.
          </p>
        </>
      ) : null}
    </Section>
  );
}

/**
 * Sélecteur de fichier au même modèle que « Ajouter un document » (Connaissances) : le champ natif reste
 * dans la page mais invisible, un vrai bouton ouvre la fenêtre de choix, le nom du fichier s'affiche à côté.
 * `Champ` lui fournit son `id` et son `aria-describedby`.
 */
export function ChoixFichier({ accept, nom, onChoisir, id, "aria-describedby": decrit }: { accept: string; nom: string | null; onChoisir: (f: File | undefined) => void; id?: string; "aria-describedby"?: string }) {
  const entree = useRef<HTMLInputElement>(null);
  return (
    <span className="atl-pile-ligne">
      <input ref={entree} id={id} aria-describedby={decrit} className="atl-sr" type="file" accept={accept} tabIndex={-1} onChange={(e) => onChoisir(e.target.files?.[0])} />
      <Bouton onClick={() => entree.current?.click()}>{nom ? "Choisir un autre fichier" : "Choisir un fichier"}</Bouton>
      <span className="atl-attenue">{nom ?? "Aucun fichier choisi"}</span>
    </span>
  );
}

export function BaseClients() {
  const { companyId } = useHostContext();
  const [version, setVersion] = useState(0);
  const [etat, setEtat] = useState<{ data: EtatBase | null; erreur: unknown; chargement: boolean }>({ data: null, erreur: null, chargement: true });

  useEffect(() => {
    if (!companyId) return;
    let annule = false;
    setEtat((e) => ({ ...e, erreur: null, chargement: true }));
    appelRoute<EtatBase>("GET", `/base-clients?companyId=${encodeURIComponent(companyId)}`)
      .then((data) => !annule && setEtat({ data: data && typeof data.existe === "boolean" ? data : null, erreur: null, chargement: false }))
      .catch((erreur: unknown) => !annule && setEtat({ data: null, erreur, chargement: false }));
    return () => {
      annule = true;
    };
  }, [companyId, version]);

  const rafraichir = () => setVersion((v) => v + 1);
  return (
    <>
      <EtatBaseClients etat={etat.data} erreur={etat.erreur} chargement={etat.chargement} onReessayer={rafraichir} />
      <ImportGuide etatBase={etat.data} onChange={rafraichir} />
      <TableauVentesCroisees version={version} />
      <Opposition />
      <SuppressionBase onChange={rafraichir} baseExiste={etat.data?.existe === true} />
    </>
  );
}
