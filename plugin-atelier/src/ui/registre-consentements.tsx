/**
 * Section « Registre des consentements » de la rubrique Prospects : pour chaque prospect particulier dont une coordonnée
 * repose sur un consentement, la preuve (date, source, texte accepté, page de captation, adresse IP tronquée, campagne)
 * et l'origine des coordonnées. Lecture seule, humain seulement (le serveur refuse tout agent). Coordonnées masquées par
 * défaut ; l'affichage en clair et l'export sont tracés côté serveur. Mêmes composants et classes que le reste de la rubrique.
 */
import { useEffect, useState } from "react";
import { useHostContext } from "@paperclipai/plugin-sdk/ui";
import type { Campagne } from "../contrats/campagnes.js";
import type { ReponseExportConsentements, ReponseRegistreConsentements } from "../contrats/consentements.js";
import { useDonnees } from "./donnees.js";
import { Bouton, Champ, Chargement, EtatErreur, Horodatage, Pastille, Vide } from "./composants.js";
import { nombre } from "./format.js";
import { appelRoute, telechargerBase64 } from "./routes-prospection.js";

const TAILLE = 25;

const LIBELLES_CANAUX: Readonly<Record<string, string>> = { courriel: "Courriel", sms: "SMS", telephone: "Téléphone", courrier: "Courrier" };

interface FiltresRegistre {
  du: string;
  au: string;
  campagneId: string;
}
const FILTRES_VIDES: FiltresRegistre = { du: "", au: "", campagneId: "" };

/** Paramètres de requête du registre (filtres, page, mode, format) : les valeurs vides sont omises. */
export function requeteRegistre(companyId: string, f: FiltresRegistre, page: number, complet: boolean, format: "json" | "csv" = "json"): string {
  const p = new URLSearchParams({ companyId });
  if (f.du) p.set("du", f.du);
  if (f.au) p.set("au", f.au);
  if (f.campagneId) p.set("campagneId", f.campagneId);
  if (format === "csv") p.set("format", "csv");
  else {
    p.set("page", String(page));
    p.set("taille", String(TAILLE));
  }
  if (complet) p.set("complet", "1");
  return `/consentements/registre?${p.toString()}`;
}

export function RegistreConsentements() {
  const { companyId } = useHostContext();
  const campagnes = useDonnees<Campagne[]>("atelier.campagnes");
  const [saisie, setSaisie] = useState<FiltresRegistre>(FILTRES_VIDES);
  const [filtres, setFiltres] = useState<FiltresRegistre>(FILTRES_VIDES);
  const [page, setPage] = useState(1);
  const [complet, setComplet] = useState(false);
  const [version, setVersion] = useState(0);
  const [etat, setEtat] = useState<{ data: ReponseRegistreConsentements | null; erreur: unknown; chargement: boolean }>({ data: null, erreur: null, chargement: true });
  const [exportEnCours, setExportEnCours] = useState(false);
  const [erreurExport, setErreurExport] = useState<unknown>(null);
  const [exporte, setExporte] = useState<ReponseExportConsentements | null>(null);
  const periodeInversee = saisie.du !== "" && saisie.au !== "" && saisie.du > saisie.au;

  useEffect(() => {
    if (!companyId) return;
    let annule = false;
    setEtat((e) => ({ ...e, chargement: true, erreur: null }));
    appelRoute<ReponseRegistreConsentements>("GET", requeteRegistre(companyId, filtres, page, complet))
      .then((data) => !annule && setEtat({ data, erreur: null, chargement: false }))
      .catch((erreur: unknown) => !annule && setEtat({ data: null, erreur, chargement: false }));
    return () => {
      annule = true;
    };
  }, [companyId, filtres, page, complet, version]);

  async function exporter() {
    if (!companyId) return;
    setExportEnCours(true);
    setErreurExport(null);
    setExporte(null);
    try {
      const r = await appelRoute<ReponseExportConsentements>("GET", requeteRegistre(companyId, filtres, 1, complet, "csv"));
      telechargerBase64(r.fichier.nom, r.fichier.typeMime, r.fichier.contenuBase64);
      setExporte(r);
    } catch (e) {
      setErreurExport(e);
    } finally {
      setExportEnCours(false);
    }
  }

  const lignes = etat.data?.lignes ?? [];
  const filtre = JSON.stringify(filtres) !== JSON.stringify(FILTRES_VIDES);

  return (
    <>
      <form
        className="atl-formulaire"
        aria-label="Filtres du registre des consentements"
        onSubmit={(e) => {
          e.preventDefault();
          if (periodeInversee) return;
          setFiltres(saisie);
          setPage(1);
        }}
      >
        <p className="atl-sous">
          Une ligne par preuve de consentement d'un particulier : date, source, texte accepté, page de captation, adresse IP tronquée et campagne, puis l'origine de ses coordonnées. Les coordonnées sont masquées tant que vous ne demandez pas l'affichage en clair.
        </p>
        <div className="atl-barre-export">
          <Champ libelle="Consentement donné à partir du">
            <input type="date" value={saisie.du} onChange={(e) => setSaisie({ ...saisie, du: e.target.value })} />
          </Champ>
          <Champ libelle="Jusqu'au (inclus)">
            <input type="date" value={saisie.au} onChange={(e) => setSaisie({ ...saisie, au: e.target.value })} />
          </Champ>
          <Champ libelle="Mission">
            <select value={saisie.campagneId} onChange={(e) => setSaisie({ ...saisie, campagneId: e.target.value })}>
              <option value="">Toutes les missions</option>
              {(campagnes.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom}
                </option>
              ))}
            </select>
          </Champ>
          <Bouton type="submit" variante="principal" raisonDesactive={periodeInversee ? "La date de début doit précéder la date de fin." : null}>
            Appliquer
          </Bouton>
        </div>
      </form>
      <div className="atl-actions">
        <Bouton
          variante="secondaire"
          onClick={() => {
            setComplet(!complet);
            setPage(1);
          }}
        >
          {complet ? "Masquer les coordonnées" : "Afficher les coordonnées en clair"}
        </Bouton>
        <Bouton variante="principal" enCours={exportEnCours} raisonDesactive={etat.data && etat.data.total === 0 ? "Aucune ligne à exporter." : null} onClick={() => void exporter()}>
          Exporter (CSV)
        </Bouton>
      </div>
      {complet ? (
        <div className="atl-encart" data-ton="attention" role="status">
          Coordonnées en clair : cet affichage et l'export de ce mode sont inscrits au journal de l'atelier.
        </div>
      ) : null}
      {erreurExport ? <EtatErreur erreur={erreurExport} contexte="export du registre" /> : null}
      {exporte ? (
        <p role="status" className="atl-sous">
          Fichier téléchargé : {exporte.fichier.nom} ({nombre(exporte.lignes)} ligne{exporte.lignes > 1 ? "s" : ""}
          {exporte.tronque ? ", export limité aux premières lignes ; affinez la période ou la mission pour obtenir le reste" : ""}).
        </p>
      ) : null}
      {etat.erreur ? <EtatErreur erreur={etat.erreur} onReessayer={() => setVersion((v) => v + 1)} contexte="registre des consentements" /> : null}
      {etat.chargement && !etat.data ? <Chargement libelle="Chargement du registre des consentements" /> : null}
      {etat.data && lignes.length === 0 ? (
        <Vide titre={filtre ? "Aucun consentement ne correspond à ces filtres." : "Aucun consentement enregistré pour le moment."}>
          {filtre
            ? "Élargissez la période ou choisissez toutes les missions."
            : "Le registre se remplit quand un particulier est enregistré avec sa preuve de consentement (formulaire de captation, partenaire, événement, lead acheté)."}
        </Vide>
      ) : null}
      {etat.data && lignes.length > 0 ? (
        <>
          <p className="atl-resume">
            <span>
              <strong>{nombre(etat.data.total)}</strong> preuve{etat.data.total > 1 ? "s" : ""} de consentement
            </span>
            <span>
              page {etat.data.page} sur {Math.max(etat.data.pages, 1)}
            </span>
          </p>
          <div className="atl-table-cadre">
            <table className="atl-table">
              <thead>
                <tr>
                  <th scope="col">Consentement</th>
                  <th scope="col">Prospect</th>
                  <th scope="col">Coordonnées</th>
                  <th scope="col">Preuve</th>
                  <th scope="col">Origine des coordonnées</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((l, i) => (
                  <tr key={`${l.prospectId}-${l.consentementLe}-${i}`}>
                    <th scope="row">
                      <Horodatage iso={l.consentementLe} />
                      {l.retireLe ? (
                        <span className="atl-sous">
                          <Pastille ton="attention">Retiré</Pastille> <Horodatage iso={l.retireLe} seulementDate />
                        </span>
                      ) : null}
                    </th>
                    <td data-libelle="Prospect">
                      {l.pseudonyme}
                      {l.nom ? <span className="atl-sous">{l.nom}</span> : null}
                      <span className="atl-sous">{l.campagne ?? "Sans mission"}</span>
                    </td>
                    <td data-libelle="Coordonnées">
                      {l.courriel ?? null}
                      {l.telephone ? <span className="atl-sous">{l.telephone}</span> : null}
                      {l.adresse ? <span className="atl-sous">{l.adresse}</span> : null}
                      {!l.courriel && !l.telephone && !l.adresse ? <span className="atl-attenue">non renseignées</span> : null}
                    </td>
                    <td data-libelle="Preuve">
                      <span>{l.texteAccepte}</span>
                      <span className="atl-sous">
                        Canaux : {l.canauxAutorises.map((c) => LIBELLES_CANAUX[c] ?? c).join(", ")}. Source : {l.source}. Référence : {l.reference}.
                      </span>
                      <span className="atl-sous">
                        Page de captation : {l.pageCaptation ?? "non transmise"}. Adresse IP tronquée : {l.adresseIpTronquee ?? "non conservée"}.
                      </span>
                    </td>
                    <td data-libelle="Origine des coordonnées">
                      {l.origineCoordonnees ? (
                        <>
                          {l.origineCoordonnees.type} <Horodatage iso={l.origineCoordonnees.collecteLe} seulementDate />
                          {l.origineCoordonnees.url ? <span className="atl-sous">{l.origineCoordonnees.url}</span> : null}
                        </>
                      ) : (
                        <span className="atl-attenue">non renseignée</span>
                      )}
                      <span className="atl-sous">Base légale : {l.basesLegales.length > 0 ? l.basesLegales.map((b) => `${LIBELLES_CANAUX[b.canal] ?? b.canal} (${b.base})`).join(", ") : "non encore évaluée"}.</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
    </>
  );
}
