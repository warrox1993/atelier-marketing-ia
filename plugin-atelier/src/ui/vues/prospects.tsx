/**
 * Rubrique « Prospects » (lot P11) : liste filtrée, fiche avec score expliqué et base légale par
 * canal, exclusion humaine, puis base de clients. Les coordonnées n'arrivent jamais en clair ici,
 * et l'usine ne contacte personne : aucune action d'envoi.
 */
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useHostContext, useHostNavigation } from "@paperclipai/plugin-sdk/ui";
import {
  CanalContact,
  CodeNace,
  CompteRenduProspect,
  MATRICE_BASES_LEGALES,
  MotifExclusion,
  SEUILS_ETALONNAGE,
  SEUIL_QUALIFICATION,
  StatutProspect,
  type BaseLegale,
  type CibleProspect,
  type PageProspects,
  type Prospect,
} from "../../contrats/prospection.js";
import { BaseClients, lireBase64 } from "../base-clients.js";
import { Bouton, Champ, Chargement, EnTete, EtatErreur, Horodatage, LienHote, MentionDemo, Pastille, Section, Vide } from "../composants.js";
import { idCourt, nombre, type Ton } from "../format.js";
import { chemin } from "../route.js";
import { appelRoute, telechargerBase64 } from "../routes-prospection.js";

const LIBELLES_CIBLES: Readonly<Record<CibleProspect, string>> = { entreprise: "Entreprises", particulier: "Particuliers", partenaire: "Partenaires" };
const LIBELLE_CIBLE_UNIQUE: Readonly<Record<CibleProspect, string>> = { entreprise: "Entreprise", particulier: "Particulier", partenaire: "Partenaire" };

const LIBELLES_STATUTS: Readonly<Record<StatutProspect, string>> = {
  nouveau: "Nouveau",
  exclu: "Exclu par une règle",
  qualifie: "Qualifié",
  exporte: "Exporté",
  refuse: "Écarté par un humain",
};
const TONS_STATUTS: Readonly<Record<StatutProspect, Ton>> = { nouveau: "info", exclu: "attention", qualifie: "succes", exporte: "neutre", refuse: "neutre" };

export const LIBELLES_MOTIFS: Readonly<Record<MotifExclusion, string>> = {
  doublon: "Doublon d'un prospect déjà connu",
  numero_bce_invalide: "Numéro BCE invalide",
  entreprise_inactive: "Entreprise inactive",
  personne_physique_bce: "Personne physique : les données BCE ne servent pas au marketing direct",
  hors_zone: "Hors de la zone visée",
  courriel_invalide: "Courriel invalide",
  courriel_nominatif_sans_consentement: "Courriel nominatif sans consentement",
  telephone_invalide: "Téléphone invalide",
  opposition_client: "Opposition enregistrée",
  liste_dncm: "Inscrit sur la liste « Ne m'appelez plus »",
  client_actuel: "Déjà client",
  donnee_demonstration_campagne_reelle: "Donnée de démonstration dans une campagne réelle",
};

const LIBELLES_CANAUX: Readonly<Record<CanalContact, string>> = { courriel: "Courriel", sms: "SMS", telephone: "Téléphone", courrier: "Courrier postal" };

const LIBELLES_BASES: Readonly<Record<BaseLegale, string>> = {
  consentement: "consentement",
  interet_legitime: "intérêt légitime documenté",
  client_existant_produits_analogues: "client existant, produits analogues",
  personne_morale_adresse_impersonnelle: "personne morale, adresse impersonnelle",
};

/** Nom affiché : dénomination, pseudonyme d'un particulier, sinon identifiant court (le nom d'une personne reste chiffré). */
export function nomProspect(p: Prospect): string {
  return p.denomination ?? p.particulier?.pseudonyme ?? `[prospect-${idCourt(p.id)}]`;
}

export function libelleZone(z: Prospect["zone"]): string {
  const parties = [z.codePostal, z.commune].filter(Boolean).join(" ");
  return parties || z.province || z.region || "Zone inconnue";
}


const entier = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/gu, "\u00a0");

const EXPLICATION_MESUREE =
  "Part de prospects semblables qui sont devenus clients, mesurée sur vos propres résultats. La fourchette est la marge d'incertitude à 95 %.";
const EXPLICATION_ESTIMATION =
  "Note de 0 à 100 calculée avec des règles simples. Elle classe les prospects entre eux mais ne dit pas leur chance réelle de signer : il manque encore assez de dossiers conclus pour la mesurer.";

/** Texte lisible d'un score : une chance mesurée, ou une estimation clairement annoncée comme telle. */
export function libelleScore(score: NonNullable<Prospect["score"]>): string {
  if (score.nature === "probabilite_mesuree") {
    const marge = score.etalonnage?.marge;
    if (marge) {
      const dossiers = score.etalonnage ? `, mesuré sur ${entier(score.etalonnage.effectif)} dossiers` : "";
      return `${Math.round(marge.probabilite * 100)} % de chances (entre ${Math.round(marge.borneBasse * 100)} et ${Math.round(marge.borneHaute * 100)} %)${dossiers}`;
    }
    return `Score ${score.valeur}/100, mesuré sur vos résultats avec marge d'incertitude`;
  }
  return `Score ${score.valeur}/100, estimation (pas assez d'historique)`;
}

/** Le chiffre et sa nature exacte : une estimation n'est jamais présentée comme une probabilité. */
export function ScoreAffiche({ p }: { p: Prospect }) {
  if (!p.score) return <span className="atl-attenue">pas de score</span>;
  const mesuree = p.score.nature === "probabilite_mesuree";
  return (
    <span className="atl-score" title={mesuree ? EXPLICATION_MESUREE : EXPLICATION_ESTIMATION}>
      <strong>{libelleScore(p.score)}</strong>
      {mesuree ? <span className="atl-sous">Score {p.score.valeur}/100</span> : null}
    </span>
  );
}

/** Bulle d'aide : la confiance n'est pas la chance de signer, qui est le score voisin. */
const EXPLICATION_CONFIANCE =
  "Confiance : à quel point on a vérifié, avec des sources déposées, que ce prospect correspond à votre cible. Ce n'est pas sa chance de signer, que mesure le score à côté.";

/** Texte lisible de la confiance : « 92 % qualifié » ou « 64 % à enrichir ». */
export function libelleConfiance(c: NonNullable<Prospect["confiance"]>): string {
  if (c.qualifie) return `${c.valeur} % qualifié`;
  return c.plafonnee ? `${c.valeur} % non qualifié (critère contraire)` : `${c.valeur} % à enrichir`;
}

export function ConfianceAffichee({ p }: { p: Prospect }) {
  if (!p.confiance) return <span className="atl-attenue">non calculée</span>;
  const manquants = p.confiance.criteres.filter((c) => c.statut === "non_verifie").length;
  return (
    <span className="atl-score" title={EXPLICATION_CONFIANCE}>
      <strong>{libelleConfiance(p.confiance)}</strong>
      {!p.confiance.qualifie && manquants > 0 ? <span className="atl-sous">{manquants} critère{manquants > 1 ? "s" : ""} à vérifier</span> : null}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Filtres                                                             */
/* ------------------------------------------------------------------ */

interface Filtres {
  cibles: CibleProspect[];
  secteur: string;
  zone: string;
  statut: StatutProspect | "";
  scoreMin: string;
  qualifies: boolean;
  /** Bureau choisi (établissement de la fiche) et zones qu'il couvre (codes postaux ou communes). */
  bureau: { nom: string; zones: string[] } | null;
  /** Code de segment du référentiel. */
  segment: string;
  source: "" | "reelle" | "demonstration";
  /** Réaffiche les prospects déjà clients, masqués par défaut. */
  avecClients: boolean;
}
const FILTRES_VIDES: Filtres = { cibles: [], secteur: "", zone: "", statut: "", scoreMin: "", qualifies: false, bureau: null, segment: "", source: "", avecClients: false };

/** Bureaux et segments de la fiche du client (lecture de `GET /marque`), tolérante à une fiche incomplète. */
interface OptionsFiltres {
  bureaux: Array<{ nom: string; zones: string[] }>;
  segments: Array<{ code: string; libelle: string }>;
}
const OPTIONS_VIDES: OptionsFiltres = { bureaux: [], segments: [] };

/** Zones d'un bureau : communes et codes postaux du référentiel, sinon code postal et commune de l'adresse. */
export function zonesDuBureau(e: { adresse?: string | null; communes?: string[]; codesPostaux?: string[] }): string[] {
  const zones = [...(e.codesPostaux ?? []), ...(e.communes ?? [])];
  if (zones.length) return zones;
  const m = /(\d{4})\s+([^,\d]+?)\s*$/u.exec(e.adresse ?? "");
  return m ? [m[1]!, m[2]!.trim()] : [];
}

export function optionsDepuisMarque(donnees: unknown): OptionsFiltres {
  const marque = (donnees as { marque?: { etablissements?: unknown; segments?: unknown } | null } | null)?.marque;
  if (!marque) return OPTIONS_VIDES;
  const bureaux = (Array.isArray(marque.etablissements) ? marque.etablissements : [])
    .map((e: { nom?: string; adresse?: string | null; communes?: string[]; codesPostaux?: string[] }) => ({ nom: String(e.nom ?? ""), zones: zonesDuBureau(e) }))
    .filter((b) => b.nom && b.zones.length > 0);
  const segments = (Array.isArray(marque.segments) ? marque.segments : [])
    .map((s: { code?: string; libelle?: string }) => ({ code: String(s.code ?? ""), libelle: String(s.libelle ?? s.code ?? "") }))
    .filter((s) => s.code);
  return { bureaux, segments };
}

function jetons(texte: string): string[] {
  return texte.split(",").map((x) => x.trim()).filter(Boolean);
}

/** Raison pour laquelle les filtres saisis sont invalides, ou null. */
export function raisonFiltres(f: Filtres): string | null {
  const faux = jetons(f.secteur).find((c) => !CodeNace.safeParse(c).success);
  if (faux) return `Secteur : « ${faux} » n'est pas un code NACE valide (exemple : 43.910 ou 66220).`;
  if (f.scoreMin !== "") {
    const n = Number(f.scoreMin);
    if (!Number.isInteger(n) || n < 0 || n > 100) return "Score minimal : un nombre entier de 0 à 100.";
  }
  return null;
}

/** Chemin de la requête `GET /prospects` : codes postaux et communes sont séparés selon la forme saisie. */
export function requeteProspects(companyId: string, f: Filtres, page: number): string {
  const q = new URLSearchParams({ companyId });
  if (f.cibles.length) q.set("cibles", f.cibles.join(","));
  const nace = jetons(f.secteur);
  if (nace.length) q.set("nace", nace.join(","));
  const zone = jetons(f.zone);
  const cp = zone.filter((z) => /^\d{4}$/u.test(z));
  const communes = zone.filter((z) => !/^\d{4}$/u.test(z));
  if (cp.length) q.set("codesPostaux", cp.join(","));
  if (communes.length) q.set("communes", communes.join(","));
  if (f.statut) q.set("statuts", f.statut);
  if (f.scoreMin !== "") q.set("scoreMin", f.scoreMin);
  if (f.qualifies) q.set("qualifiesSeulement", "true");
  if (f.bureau) q.set("zonesBureau", f.bureau.zones.join(","));
  if (f.segment) q.set("segments", f.segment);
  if (f.source) q.set("source", f.source);
  if (f.avecClients) q.set("avecClientsActuels", "true");
  if (page > 1) q.set("page", String(page));
  return `/prospects?${q.toString()}`;
}

/** Filtres appliqués, sous la forme attendue par l'export (mêmes noms que la liste, sans pagination). */
export function filtresExport(f: Filtres): Record<string, string> {
  const q = new URL(requeteProspects("x", f, 1), "http://x").searchParams;
  q.delete("companyId");
  return Object.fromEntries(q.entries());
}

function BarreFiltres({ valeur, options, onAppliquer }: { valeur: Filtres; options: OptionsFiltres; onAppliquer(f: Filtres): void }) {
  const [saisie, setSaisie] = useState<Filtres>(valeur);
  const raison = raisonFiltres(saisie);
  const basculer = (c: CibleProspect) => setSaisie({ ...saisie, cibles: saisie.cibles.includes(c) ? saisie.cibles.filter((x) => x !== c) : [...saisie.cibles, c] });
  function envoyer(e: FormEvent) {
    e.preventDefault();
    if (!raison) onAppliquer(saisie);
  }
  return (
    <form className="atl-formulaire atl-filtres-prospects" onSubmit={envoyer} aria-label="Filtres des prospects">
      <div className="atl-segments" role="group" aria-label="Cible">
        {(Object.keys(LIBELLES_CIBLES) as CibleProspect[]).map((c) => (
          <button key={c} type="button" className="atl-segment" aria-pressed={saisie.cibles.includes(c)} onClick={() => basculer(c)}>
            {LIBELLES_CIBLES[c]}
          </button>
        ))}
      </div>
      <div className="atl-grille-champs">
        <Champ libelle="Secteur (code NACE)" aide="Plusieurs codes séparés par des virgules.">
          <input value={saisie.secteur} onChange={(e) => setSaisie({ ...saisie, secteur: e.target.value })} placeholder="43.910, 66220" autoComplete="off" />
        </Champ>
        <Champ libelle="Zone (commune ou code postal)" aide="Plusieurs valeurs séparées par des virgules.">
          <input value={saisie.zone} onChange={(e) => setSaisie({ ...saisie, zone: e.target.value })} placeholder="Liège, 4000" autoComplete="off" />
        </Champ>
        <Champ libelle="Statut">
          <select value={saisie.statut} onChange={(e) => setSaisie({ ...saisie, statut: e.target.value as Filtres["statut"] })}>
            <option value="">Tous les statuts</option>
            {StatutProspect.options.map((s) => (
              <option key={s} value={s}>
                {LIBELLES_STATUTS[s]}
              </option>
            ))}
          </select>
        </Champ>
        <Champ libelle="Bureau" aide="Prospects de la même commune ou du même code postal que le bureau.">
          <select value={saisie.bureau?.nom ?? ""} onChange={(e) => setSaisie({ ...saisie, bureau: options.bureaux.find((b) => b.nom === e.target.value) ?? null })}>
            <option value="">Tous les bureaux</option>
            {options.bureaux.map((b) => (
              <option key={b.nom} value={b.nom}>
                {b.nom}
              </option>
            ))}
          </select>
        </Champ>
        <Champ libelle="Segment">
          <select value={saisie.segment} onChange={(e) => setSaisie({ ...saisie, segment: e.target.value })}>
            <option value="">Tous les segments</option>
            {options.segments.map((s) => (
              <option key={s.code} value={s.code}>
                {s.libelle}
              </option>
            ))}
          </select>
        </Champ>
        <Champ libelle="Source">
          <select value={saisie.source} onChange={(e) => setSaisie({ ...saisie, source: e.target.value as Filtres["source"] })}>
            <option value="">Réelle et démonstration</option>
            <option value="reelle">Réelle</option>
            <option value="demonstration">Démonstration</option>
          </select>
        </Champ>
        <Champ libelle="Score minimal (0 à 100)" className="atl-champ-etroit">
          <input value={saisie.scoreMin} onChange={(e) => setSaisie({ ...saisie, scoreMin: e.target.value })} inputMode="numeric" autoComplete="off" aria-invalid={raison?.startsWith("Score") ? true : undefined} />
        </Champ>
      </div>
      <label className="atl-sous" title={EXPLICATION_CONFIANCE}>
        <input type="checkbox" checked={saisie.qualifies} onChange={(e) => setSaisie({ ...saisie, qualifies: e.target.checked })} />
        Qualifiés (≥ {SEUIL_QUALIFICATION} %)
      </label>
      <label className="atl-sous">
        <input type="checkbox" checked={saisie.avecClients} onChange={(e) => setSaisie({ ...saisie, avecClients: e.target.checked })} />
        Afficher aussi les clients actuels
      </label>
      {raison ? (
        <p className="atl-texte-danger" role="alert">
          {raison}
        </p>
      ) : null}
      <div className="atl-actions">
        <Bouton type="submit" variante="principal" raisonDesactive={raison ? "Corrigez les filtres." : null}>
          Filtrer
        </Bouton>
        <Bouton
          onClick={() => {
            setSaisie(FILTRES_VIDES);
            onAppliquer(FILTRES_VIDES);
          }}
        >
          Effacer les filtres
        </Bouton>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Fiche                                                               */
/* ------------------------------------------------------------------ */

/** Pourquoi un canal n'est pas permis pour ce prospect, en une phrase. */
export function motifRefusCanal(p: Prospect, canal: CanalContact): string {
  if (p.statut === "exclu") return `Prospect exclu : ${p.motifsExclusion.map((m) => LIBELLES_MOTIFS[m.motif].toLowerCase()).join(" ; ")}.`;
  if (p.statut === "refuse") return "Prospect écarté par un humain.";
  const permises = MATRICE_BASES_LEGALES[p.cible][canal];
  if (permises.length === 0) return `Aucune base légale ne permet ce canal pour cette cible.`;
  return `Aucune base légale vérifiée. Bases possibles : ${permises.map((b) => LIBELLES_BASES[b]).join(" ; ")}.`;
}

/* ------------------------------------------------------------------ */
/* Compte rendu du lead et question au Coordinateur                    */
/* ------------------------------------------------------------------ */

const jourCourt = (iso: string | null) => (iso === null ? "date inconnue" : iso.slice(0, 10).split("-").reverse().join("/"));

/**
 * Compte rendu déterministe (chargé à l'ouverture de la fiche, aucune IA) puis question à poser au
 * Coordinateur : la route crée une tâche qui lui est assignée, et on ouvre sa discussion.
 */
function CompteRenduLead({ p, companyId }: { p: Prospect; companyId: string }) {
  const nav = useHostNavigation();
  const [cr, setCr] = useState<CompteRenduProspect | null>(null);
  const [erreurLecture, setErreurLecture] = useState<unknown>(null);
  const [question, setQuestion] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<unknown>(null);

  const charger = useCallback(async () => {
    setCr(null);
    setErreurLecture(null);
    try {
      const brut = await appelRoute<unknown>("GET", `/prospects/${encodeURIComponent(p.id)}/compte-rendu?companyId=${encodeURIComponent(companyId)}`);
      const lu = CompteRenduProspect.safeParse(brut);
      if (!lu.success) throw new Error("Le compte rendu reçu n'a pas la forme attendue.");
      setCr(lu.data);
    } catch (e) {
      setErreurLecture(e);
    }
  }, [p.id, companyId]);
  useEffect(() => {
    void charger();
  }, [charger]);

  const raison = question.trim().length < 3 ? "Écrivez votre question (3 caractères au moins)." : null;
  async function poser() {
    setEnCours(true);
    setErreur(null);
    try {
      const r = await appelRoute<{ issueId: string; identifiant: string | null; lien: string }>("POST", `/prospects/${encodeURIComponent(p.id)}/question`, { companyId, question: question.trim() });
      setQuestion("");
      // La réponse du Coordinateur arrive dans la discussion de la tâche créée.
      if (r.lien) nav.navigate(r.lien);
    } catch (e) {
      setErreur(e);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <section className="atl-compte-rendu" aria-label="Compte rendu du lead">
      <h3 className="atl-h3">Compte rendu du lead</h3>
      {erreurLecture ? <EtatErreur erreur={erreurLecture} contexte="compte rendu du lead" onReessayer={() => void charger()} /> : null}
      {!cr && !erreurLecture ? <Chargement libelle="Lecture du compte rendu" lignes={4} /> : null}
      {cr ? (
        <>
          <p className="atl-sous">Établi à partir des données enregistrées, sans intelligence artificielle : rien n'est supposé.</p>
          <h4 className="atl-h3">Pourquoi ce lead</h4>
          <ul className="atl-liste-compacte">
            {cr.pourquoi.verifies.map((v) => (
              <li key={v.code}>
                <strong>Vérifié :</strong> {v.libelle}. {v.detail}.{" "}
                <span className="atl-attenue">
                  Source : {v.source}, {jourCourt(v.date)}.
                </span>
              </li>
            ))}
            {cr.pourquoi.verifies.length === 0 ? <li className="atl-attenue">Aucun critère n'est encore vérifié.</li> : null}
            {cr.pourquoi.nonVerifies.map((n) => (
              <li key={n.code}>
                <strong>Pas encore vérifié :</strong> {n.libelle}. <span className="atl-attenue">{n.detail}.</span>
              </li>
            ))}
            {cr.pourquoi.contraires.map((x) => (
              <li key={x.code}>
                <strong>Contraire :</strong> {x.libelle}. {x.detail}.
              </li>
            ))}
          </ul>
          <h4 className="atl-h3">Confiance et score</h4>
          <ul className="atl-liste-compacte">
            <li>
              <strong>Confiance :</strong> {cr.confiance.valeur} % ({cr.confiance.qualifie ? "qualifié" : cr.confiance.plafonnee ? "non qualifié, critère contraire" : `à enrichir, seuil ${cr.confiance.seuil} %`})
            </li>
            <li>
              <strong>Score :</strong> {cr.score ? cr.score.libelle : "pas encore calculé"}
            </li>
          </ul>
          <p className="atl-sous">{cr.differenceConfianceScore}</p>
          <h4 className="atl-h3">Signaux de moment</h4>
          {cr.signaux.length > 0 ? (
            <ul className="atl-liste-compacte">
              {cr.signaux.map((s) => (
                <li key={s.code}>
                  {s.libelle}. <span className="atl-attenue">{s.source}, {jourCourt(s.date)}.</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="atl-attenue">Aucun signal de moment établi par les sources.</p>
          )}
          <h4 className="atl-h3">Offre recommandée</h4>
          {cr.offreRecommandee ? (
            <p>
              <strong>{cr.offreRecommandee.nom}.</strong> {cr.offreRecommandee.raison}
            </p>
          ) : (
            <p className="atl-attenue">Aucune offre recommandée : {cr.raisonSansOffre}</p>
          )}
          <h4 className="atl-h3">Établissement proche</h4>
          {cr.etablissementProche ? (
            <p>
              <strong>{cr.etablissementProche.nom}</strong>
              {cr.etablissementProche.adresse ? `, ${cr.etablissementProche.adresse}` : ""}{" "}
              <span className="atl-attenue">
                ({cr.etablissementProche.raison === "distance" ? `à ${cr.etablissementProche.distanceKm} km` : cr.etablissementProche.raison === "meme_code_postal" ? "même code postal" : "même commune"})
              </span>
            </p>
          ) : (
            <p className="atl-attenue">Aucun établissement de la fiche ne correspond à la zone connue du lead.</p>
          )}
          <h4 className="atl-h3">Prochaine action</h4>
          <p>{cr.prochaineAction.libelle}</p>
          <h4 className="atl-h3">Limites</h4>
          <ul className="atl-liste-compacte">
            {cr.limites.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </>
      ) : null}
      <div className="atl-formulaire">
        <Champ libelle="Votre question sur ce lead" aide="Le Coordinateur répond dans la discussion de la tâche créée, avec ce compte rendu en contexte.">
          <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={3} maxLength={4000} />
        </Champ>
        {erreur ? <EtatErreur erreur={erreur} contexte="question au Coordinateur" /> : null}
        <div className="atl-actions">
          <Bouton variante="principal" raisonDesactive={raison} enCours={enCours} onClick={() => void poser()}>
            Poser une question au Coordinateur
          </Bouton>
        </div>
      </div>
    </section>
  );
}

function Fiche({ p, companyId, onFermer, onExclu, onCorbeille }: { p: Prospect; companyId: string; onFermer(): void; onExclu(): void; onCorbeille(): void }) {
  const [motif, setMotif] = useState<MotifExclusion>("doublon");
  const [detail, setDetail] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<unknown>(null);
  const raison = detail.trim().length < 3 ? "Expliquez le motif (3 caractères au moins)." : null;
  const [confirmationCorbeille, setConfirmationCorbeille] = useState(false);
  const [corbeilleEnCours, setCorbeilleEnCours] = useState(false);
  const [erreurCorbeille, setErreurCorbeille] = useState<unknown>(null);

  async function mettreALaCorbeille() {
    setCorbeilleEnCours(true);
    setErreurCorbeille(null);
    try {
      await appelRoute("POST", "/corbeille/suppression", { companyId, type: "prospect", id: p.id });
      onCorbeille();
    } catch (e) {
      setErreurCorbeille(e);
    } finally {
      setCorbeilleEnCours(false);
    }
  }

  async function exclure() {
    setEnCours(true);
    setErreur(null);
    try {
      await appelRoute("POST", `/prospects/${encodeURIComponent(p.id)}/exclusion`, { companyId, prospectId: p.id, motif, detail: detail.trim() });
      onExclu();
    } catch (e) {
      setErreur(e);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <section className="atl-section atl-fiche" aria-label={`Fiche de ${nomProspect(p)}`}>
      <div className="atl-section-tete">
        <h2>{nomProspect(p)}</h2>
        <div className="atl-section-actions">
          <Bouton variante="discret" onClick={onFermer}>
            Fermer la fiche
          </Bouton>
        </div>
      </div>
      <dl className="atl-champs atl-champs-grille">
        <div>
          <dt>Cible</dt>
          <dd>{LIBELLE_CIBLE_UNIQUE[p.cible]}</dd>
        </div>
        <div>
          <dt>Zone</dt>
          <dd>{libelleZone(p.zone)}</dd>
        </div>
        <div>
          <dt>Statut</dt>
          <dd>{LIBELLES_STATUTS[p.statut]}</dd>
        </div>
        {p.nace.length ? (
          <div>
            <dt>Secteur</dt>
            <dd>{p.nace.join(", ")}</dd>
          </div>
        ) : null}
        <div>
          <dt>Score</dt>
          <dd>
            <ScoreAffiche p={p} />
          </dd>
        </div>
      </dl>
      {p.motifsExclusion.length > 0 ? (
        <div className="atl-encart" data-ton="attention">
          <p className="atl-encart-titre">Motifs d'exclusion</p>
          <ul className="atl-liste-compacte">
            {p.motifsExclusion.map((m) => (
              <li key={m.motif}>
                {LIBELLES_MOTIFS[m.motif]}. <span className="atl-attenue">{m.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <CompteRenduLead p={p} companyId={companyId} />

      <h3 className="atl-h3">Critères du score</h3>
      {p.score ? (
        <div className="atl-table-cadre">
          <table className="atl-table">
            <thead>
              <tr>
                <th scope="col">Critère</th>
                <th scope="col">Valeur</th>
                <th scope="col" className="atl-num">Points</th>
                <th scope="col">Source</th>
                <th scope="col">Date de la source</th>
              </tr>
            </thead>
            <tbody>
              {p.score.criteres.map((c) => (
                <tr key={c.code}>
                  <th scope="row">{c.libelle}</th>
                  <td data-libelle="Valeur">{c.valeur === null ? <span className="atl-attenue">non renseignée</span> : typeof c.valeur === "boolean" ? (c.valeur ? "oui" : "non") : String(c.valeur)}</td>
                  <td data-libelle="Points" className="atl-num">{c.points > 0 ? `+${c.points}` : c.points}</td>
                  <td data-libelle="Source">{c.source}</td>
                  <td data-libelle="Date"><Horodatage iso={c.dateSource} seulementDate /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="atl-attenue">Ce prospect n'a pas encore de score.</p>
      )}
      <p className="atl-sous">Le score sert à trier et à prioriser. Il ne fixe jamais un prix, une éligibilité ni une condition.</p>

      <h3 className="atl-h3">Base légale par canal</h3>
      <div className="atl-table-cadre">
        <table className="atl-table">
          <thead>
            <tr>
              <th scope="col">Canal</th>
              <th scope="col">Contact</th>
              <th scope="col">Pourquoi</th>
            </tr>
          </thead>
          <tbody>
            {CanalContact.options.map((canal) => {
              const b = p.basesLegales.find((x) => x.canal === canal);
              return (
                <tr key={canal}>
                  <th scope="row">{LIBELLES_CANAUX[canal]}</th>
                  <td data-libelle="Contact">
                    <Pastille ton={b ? "succes" : "danger"}>{b ? "Permis" : "Refusé"}</Pastille>
                  </td>
                  <td data-libelle="Pourquoi">
                    {b ? (
                      <>
                        {LIBELLES_BASES[b.base][0]!.toUpperCase() + LIBELLES_BASES[b.base].slice(1)}
                        <span className="atl-sous">
                          Preuve : {b.preuve.reference}, le <Horodatage iso={b.preuve.date} seulementDate />
                        </span>
                      </>
                    ) : (
                      motifRefusCanal(p, canal)
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="atl-sous">L'atelier ne contacte personne : cette fiche indique seulement ce que la loi permettrait à votre équipe.</p>

      {p.statut !== "exclu" && p.statut !== "refuse" ? (
        <div className="atl-formulaire">
          <h3 className="atl-h3">Exclure ce prospect</h3>
          <Champ libelle="Motif">
            <select value={motif} onChange={(e) => setMotif(e.target.value as MotifExclusion)}>
              {MotifExclusion.options.map((m) => (
                <option key={m} value={m}>
                  {LIBELLES_MOTIFS[m]}
                </option>
              ))}
            </select>
          </Champ>
          <Champ libelle="Précision" aide="Une phrase pour le journal.">
            <input value={detail} onChange={(e) => setDetail(e.target.value)} maxLength={500} autoComplete="off" />
          </Champ>
          {erreur ? <EtatErreur erreur={erreur} contexte="exclusion du prospect" /> : null}
          <div className="atl-actions">
            <Bouton variante="danger" raisonDesactive={raison} enCours={enCours} onClick={() => void exclure()}>
              Exclure
            </Bouton>
          </div>
        </div>
      ) : null}

      <div className="atl-formulaire">
        <h3 className="atl-h3">Corbeille</h3>
        <div className="atl-actions">
          {confirmationCorbeille ? (
            <span className="atl-actions" role="group" aria-label={`Confirmation de la mise à la corbeille de ${nomProspect(p)}`}>
              <Bouton variante="danger" enCours={corbeilleEnCours} onClick={() => void mettreALaCorbeille()}>
                Confirmer
              </Bouton>
              <Bouton variante="discret" onClick={() => setConfirmationCorbeille(false)}>
                Annuler
              </Bouton>
            </span>
          ) : (
            <Bouton
              variante="discret"
              onClick={() => {
                setErreurCorbeille(null);
                setConfirmationCorbeille(true);
              }}
            >
              Mettre à la corbeille
            </Bouton>
          )}
          <span className="atl-sous">Récupérable 30 jours dans la Corbeille</span>
        </div>
        {erreurCorbeille ? <EtatErreur erreur={erreurCorbeille} contexte="mise à la corbeille du prospect" /> : null}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Export fichier                                                      */
/* ------------------------------------------------------------------ */

interface RapportExport {
  nomFichier: string;
  format: "csv" | "xlsx";
  typeMime: string;
  contenuBase64: string;
  mode?: "demonstration" | "reel";
  rapport: { demandes: number; inclus: number; refuses: Array<{ prospectId: string; denomination?: string | null; motif: string }> };
}

function ExportProspects({ companyId, filtres }: { companyId: string; filtres: Filtres }) {
  const [canal, setCanal] = useState<CanalContact>("courriel");
  const [format, setFormat] = useState<"csv" | "xlsx">("csv");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<unknown>(null);
  const [resultat, setResultat] = useState<RapportExport | null>(null);
  const raison = raisonFiltres(filtres);

  async function exporter() {
    setEnCours(true);
    setErreur(null);
    setResultat(null);
    try {
      const f = filtresExport(filtres);
      const r = await appelRoute<RapportExport>("POST", "/prospects/exports-fichier", { companyId, canal, format, ...(Object.keys(f).length ? { filtres: f } : {}) });
      telechargerBase64(r.nomFichier, r.typeMime, r.contenuBase64);
      setResultat(r);
    } catch (e) {
      setErreur(e);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <section className="atl-formulaire atl-export-prospects" aria-label="Exporter les prospects">
      <h3 className="atl-h3">Exporter un fichier</h3>
      <p className="atl-sous">Seuls les prospects que vous avez le droit de contacter par ce canal sont exportés. Les autres sont écartés et listés avec leur motif. L'atelier ne contacte personne : le fichier est pour votre équipe.</p>
      <div className="atl-barre-export">
        <Champ libelle="Canal de contact">
          <select value={canal} onChange={(e) => setCanal(e.target.value as CanalContact)}>
            {CanalContact.options.map((c) => (
              <option key={c} value={c}>
                {LIBELLES_CANAUX[c]}
              </option>
            ))}
          </select>
        </Champ>
        <Champ libelle="Format du fichier">
          <select value={format} onChange={(e) => setFormat(e.target.value as "csv" | "xlsx")}>
            <option value="csv">CSV</option>
            <option value="xlsx">Excel (.xlsx)</option>
          </select>
        </Champ>
        <Bouton variante="principal" raisonDesactive={raison ? "Corrigez les filtres." : null} enCours={enCours} onClick={() => void exporter()}>
          Exporter
        </Bouton>
      </div>
      {erreur ? <EtatErreur erreur={erreur} contexte="export des prospects" /> : null}
      {resultat ? (
        <div role="status" className="atl-formulaire">
          {resultat.mode === "demonstration" ? <MentionDemo compacte /> : null}
          <p className="atl-resume">
            <span>
              <strong>{nombre(resultat.rapport.inclus)}</strong> inclus
            </span>
            <span>
              <strong>{nombre(resultat.rapport.refuses.length)}</strong> écartés
            </span>
            <span>{nombre(resultat.rapport.demandes)} demandés</span>
          </p>
          <p className="atl-sous">Fichier téléchargé : {resultat.nomFichier}.</p>
          {resultat.rapport.refuses.length > 0 ? (
            <ul className="atl-liste" aria-label="Prospects écartés de l'export">
              {resultat.rapport.refuses.map((x) => (
                <li key={x.prospectId}>
                  {x.denomination || `[prospect-${idCourt(x.prospectId)}]`} : {LIBELLES_MOTIFS[x.motif as MotifExclusion] ?? x.motif}
                </li>
              ))}
            </ul>
          ) : (
            <p className="atl-succes">Aucun prospect écarté pour ce canal.</p>
          )}
        </div>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Étalonnage du score                                                 */
/* ------------------------------------------------------------------ */

interface ResultatEtalonnage {
  etalonnage: { statut: "probabilite_mesuree" | "estimation"; effectif: number; conversions: number; brier?: number | null; methode?: string };
  observationsIgnorees?: number;
  application?: { prospects: number; probabilitesAppliquees: number; estimations: number };
}

function EtalonnerScore({ companyId, onTermine }: { companyId: string; onTermine(): void }) {
  const [cible, setCible] = useState<CibleProspect>("entreprise");
  const [historique, setHistorique] = useState<{ nomFichier: string; format: "csv" | "xlsx"; contenuBase64: string } | null>(null);
  const [erreurFichier, setErreurFichier] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<unknown>(null);
  const [resultat, setResultat] = useState<ResultatEtalonnage | null>(null);

  async function choisir(f: File | undefined) {
    setErreurFichier(null);
    setHistorique(null);
    if (!f) return;
    const format = /\.csv$/iu.test(f.name) ? "csv" : /\.xlsx$/iu.test(f.name) ? "xlsx" : null;
    if (!format) return setErreurFichier("Format non pris en charge : choisissez un fichier .csv ou .xlsx.");
    try {
      setHistorique({ nomFichier: f.name, format, contenuBase64: await lireBase64(f) });
    } catch {
      setErreurFichier("Le fichier n'a pas pu être lu par le navigateur. Réessayez avec un autre fichier.");
    }
  }

  async function calculer() {
    setEnCours(true);
    setErreur(null);
    setResultat(null);
    try {
      const r = await appelRoute<ResultatEtalonnage>("POST", "/etalonnages", { companyId, segment: { cible, nace: [] }, ...(historique ? { historique } : {}) });
      setResultat(r);
      onTermine();
    } catch (e) {
      setErreur(e);
    } finally {
      setEnCours(false);
    }
  }

  const e = resultat?.etalonnage;
  return (
    <Section titre="Étalonner le score" aide="Compare le score aux résultats réels (gagné ou perdu) pour le transformer en probabilité mesurée. Sans assez d'historique, il reste une estimation.">
      <div className="atl-formulaire">
        <div className="atl-barre-export">
          <Champ libelle="Cible à étalonner">
            <select value={cible} onChange={(ev) => setCible(ev.target.value as CibleProspect)}>
              {(Object.keys(LIBELLE_CIBLE_UNIQUE) as CibleProspect[]).map((c) => (
                <option key={c} value={c}>
                  {LIBELLES_CIBLES[c]}
                </option>
              ))}
            </select>
          </Champ>
          <Champ libelle="Historique des résultats (.csv ou .xlsx)" aide="Facultatif : sans fichier, les résultats déjà enregistrés sont utilisés.">
            <input type="file" accept=".csv,.xlsx" onChange={(ev) => void choisir(ev.target.files?.[0])} />
          </Champ>
          <Bouton variante="principal" enCours={enCours} raisonDesactive={erreurFichier ? "Corrigez le fichier." : null} onClick={() => void calculer()}>
            Calculer l'étalonnage
          </Bouton>
        </div>
        {erreurFichier ? (
          <p className="atl-texte-danger" role="alert">
            {erreurFichier}
          </p>
        ) : null}
        {erreur ? <EtatErreur erreur={erreur} contexte="étalonnage du score" /> : null}
        {e ? (
          <div role="status" className="atl-formulaire">
            {e.statut === "probabilite_mesuree" ? (
              <p className="atl-succes">
                Probabilité mesurée sur {nombre(e.effectif)} prospects dont {nombre(e.conversions)} conversions.
              </p>
            ) : (
              <div className="atl-encart" data-ton="attention">
                <p className="atl-encart-titre">Estimation : pas assez d'historique</p>
                <p>
                  {nombre(e.effectif)}/{SEUILS_ETALONNAGE.prospectsMin} prospects, {nombre(e.conversions)}/{SEUILS_ETALONNAGE.conversionsMin} conversions. Les scores restent des estimations non étalonnées.
                </p>
              </div>
            )}
            {typeof e.brier === "number" ? <p className="atl-sous">Écart moyen entre prévision et réalité (Brier) : {e.brier.toFixed(3)}. Plus il est bas, mieux le score prévoit.</p> : null}
            {resultat?.application ? (
              <p className="atl-sous">
                Appliqué à {nombre(resultat.application.prospects)} prospects : {nombre(resultat.application.probabilitesAppliquees)} probabilités mesurées, {nombre(resultat.application.estimations)} estimations.
              </p>
            ) : null}
            {resultat?.observationsIgnorees ? <p className="atl-sous">{nombre(resultat.observationsIgnorees)} lignes de l'historique ignorées (hors cible ou incomplètes).</p> : null}
          </div>
        ) : null}
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Liste                                                               */
/* ------------------------------------------------------------------ */

function ListeProspects() {
  const { companyId } = useHostContext();
  const [filtres, setFiltres] = useState<Filtres>(FILTRES_VIDES);
  const [page, setPage] = useState(1);
  const [versionCharge, setVersionCharge] = useState(0);
  const [etat, setEtat] = useState<{ data: PageProspects | null; erreur: unknown; chargement: boolean }>({ data: null, erreur: null, chargement: true });
  const [choisi, setChoisi] = useState<string | null>(null);
  const [ordreAsc, setOrdreAsc] = useState(false);
  const [tri, setTri] = useState<"score" | "confiance">("score");
  const [options, setOptions] = useState<OptionsFiltres>(OPTIONS_VIDES);

  useEffect(() => {
    if (!companyId) return;
    let annule = false;
    appelRoute<unknown>("GET", `/marque?companyId=${encodeURIComponent(companyId)}`)
      .then((d) => !annule && setOptions(optionsDepuisMarque(d)))
      .catch(() => undefined); // sans fiche lisible, les filtres bureau et segment restent vides
    return () => {
      annule = true;
    };
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    let annule = false;
    setEtat((e) => ({ ...e, chargement: true, erreur: null }));
    appelRoute<PageProspects>("GET", requeteProspects(companyId, filtres, page))
      .then((data) => !annule && setEtat({ data, erreur: null, chargement: false }))
      .catch((erreur: unknown) => !annule && setEtat({ data: null, erreur, chargement: false }));
    return () => {
      annule = true;
    };
  }, [companyId, filtres, page, versionCharge]);

  const appliquer = useCallback((f: Filtres) => {
    setFiltres(f);
    setPage(1);
    setChoisi(null);
  }, []);

  const cleTri = (p: Prospect) => (tri === "confiance" ? p.confiance?.valeur : p.score?.valeur) ?? -1;
  const lignes = [...(etat.data?.prospects ?? [])].sort((a, b) => (ordreAsc ? 1 : -1) * (cleTri(a) - cleTri(b)));
  const trier = (cle: "score" | "confiance") => {
    if (cle === tri) setOrdreAsc(!ordreAsc);
    else {
      setTri(cle);
      setOrdreAsc(false);
    }
  };
  const fiche = lignes.find((p) => p.id === choisi) ?? null;
  const filtre = JSON.stringify(filtres) !== JSON.stringify(FILTRES_VIDES);

  return (
    <>
      <BarreFiltres valeur={filtres} options={options} onAppliquer={appliquer} />
      {companyId ? <ExportProspects companyId={companyId} filtres={filtres} /> : null}
      {etat.erreur ? <EtatErreur erreur={etat.erreur} onReessayer={() => setVersionCharge((v) => v + 1)} contexte="prospects" /> : null}
      {etat.chargement && !etat.data ? <Chargement libelle="Chargement des prospects" /> : null}
      {etat.data && lignes.length === 0 ? (
        <Vide
          titre={filtre ? "Aucun prospect ne correspond à ces filtres." : "Aucun prospect pour le moment."}
          action={filtre ? undefined : <LienHote vers={chemin("equipe")} className="atl-bouton">Demander une recherche au Coordinateur</LienHote>}
        >
          {filtre ? "Élargissez la zone ou baissez le score minimal, ou effacez les filtres." : "Demandez une recherche au Coordinateur : les prospects arrivent quand une campagne de prospection a collecté des données publiques ou qu'un particulier est enregistré."}
        </Vide>
      ) : null}
      {etat.data && lignes.length > 0 ? (
        <>
          <p className="atl-resume">
            <span>
              <strong>{nombre(etat.data.total)}</strong> prospect{etat.data.total > 1 ? "s" : ""}
            </span>
            <span>
              page {etat.data.page} sur {Math.max(etat.data.pages, 1)}
            </span>
          </p>
          <div className="atl-table-cadre">
            <table className="atl-table">
              <thead>
                <tr>
                  <th scope="col">Prospect</th>
                  <th scope="col">Cible</th>
                  <th scope="col">Zone</th>
                  <th scope="col" aria-sort={tri === "score" ? (ordreAsc ? "ascending" : "descending") : undefined}>
                    <button type="button" className="atl-lien" onClick={() => trier("score")} aria-label={tri === "score" ? `Score, trié ${ordreAsc ? "du plus bas au plus haut" : "du plus haut au plus bas"} ; inverser` : "Trier par score"}>
                      {tri === "score" ? `Score (${ordreAsc ? "croissant" : "décroissant"})` : "Score"}
                    </button>
                  </th>
                  <th scope="col" aria-sort={tri === "confiance" ? (ordreAsc ? "ascending" : "descending") : undefined}>
                    <button type="button" className="atl-lien" title={EXPLICATION_CONFIANCE} onClick={() => trier("confiance")} aria-label={tri === "confiance" ? `Confiance, triée ${ordreAsc ? "du plus bas au plus haut" : "du plus haut au plus bas"} ; inverser` : "Trier par confiance"}>
                      {tri === "confiance" ? `Confiance (${ordreAsc ? "croissante" : "décroissante"})` : "Confiance"}
                    </button>
                  </th>
                  <th scope="col">Statut</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((p) => (
                  <tr key={p.id} data-choisi={p.id === choisi || undefined}>
                    <th scope="row">
                      <button type="button" className="atl-lien" onClick={() => setChoisi(p.id)} aria-label={`Ouvrir la fiche de ${nomProspect(p)}`}>
                        {nomProspect(p)}
                      </button>
                      {p.mode === "demonstration" ? <span className="atl-sous">donnée de démonstration</span> : null}
                    </th>
                    <td data-libelle="Cible">{LIBELLE_CIBLE_UNIQUE[p.cible]}</td>
                    <td data-libelle="Zone">{libelleZone(p.zone)}</td>
                    <td data-libelle="Score">
                      <ScoreAffiche p={p} />
                    </td>
                    <td data-libelle="Confiance">
                      <ConfianceAffichee p={p} />
                    </td>
                    <td data-libelle="Statut">
                      <Pastille ton={TONS_STATUTS[p.statut]}>{LIBELLES_STATUTS[p.statut]}</Pastille>
                      {p.motifsExclusion.length > 0 ? <span className="atl-sous">{p.motifsExclusion.map((m) => LIBELLES_MOTIFS[m.motif]).join(" ; ")}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="atl-sous">Tri sur la page affichée. Le score estime la chance de signer ; la confiance dit si le prospect correspond à votre cible.</p>
          {etat.data.pages > 1 ? (
            <div className="atl-actions">
              <Bouton raisonDesactive={page <= 1 ? "Première page." : null} onClick={() => setPage(page - 1)}>
                Page précédente
              </Bouton>
              <Bouton raisonDesactive={page >= etat.data.pages ? "Dernière page." : null} onClick={() => setPage(page + 1)}>
                Page suivante
              </Bouton>
            </div>
          ) : null}
        </>
      ) : null}
      {companyId ? <EtalonnerScore companyId={companyId} onTermine={() => setVersionCharge((v) => v + 1)} /> : null}
      {fiche && companyId ? (
        <Fiche
          key={fiche.id}
          p={fiche}
          companyId={companyId}
          onFermer={() => setChoisi(null)}
          onExclu={() => {
            setChoisi(null);
            setVersionCharge((v) => v + 1);
          }}
          onCorbeille={() => {
            setChoisi(null);
            setVersionCharge((v) => v + 1);
          }}
        />
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Rubrique                                                            */
/* ------------------------------------------------------------------ */

export function VueProspects() {
  const [onglet, setOnglet] = useState<"prospects" | "base">("prospects");
  return (
    <>
      <EnTete
        titre="Prospects"
        description="Les entreprises et les particuliers que l'atelier a repérés, avec la raison de chaque score et ce que la loi permet pour chaque canal. L'atelier ne contacte personne."
      />
      <div className="atl-segments" role="group" aria-label="Rubrique des prospects">
        <button type="button" className="atl-segment" aria-pressed={onglet === "prospects"} onClick={() => setOnglet("prospects")}>
          Prospects
        </button>
        <button type="button" className="atl-segment" aria-pressed={onglet === "base"} onClick={() => setOnglet("base")}>
          Base clients et oppositions
        </button>
      </div>
      {onglet === "prospects" ? <ListeProspects /> : <BaseClients />}
    </>
  );
}
