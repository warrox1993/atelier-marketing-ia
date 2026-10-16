/**
 * Échanges entre services (lot L7).
 *
 * - `OngletEchanges` : liaisons d'une tâche (demande, question, extraits transmis, statut, dates, réponse). Côté service
 *   cible, le serveur ne renvoie que ce qui a été transmis ; l'interface ne complète rien.
 * - `VueRegistre` : registre de la Direction (tableau filtrable, paginé, export CSV). Réservé à l'entreprise Direction :
 *   `useAccesDirection` lit la même route que le registre et n'affiche l'entrée de menu que si le serveur l'autorise.
 */
import { useCallback, useEffect, useState } from "react";
import { useHostContext } from "@paperclipai/plugin-sdk/ui";
import type { StatutLiaison } from "../../contrats/liaisons.js";
import { NOMS_SERVICES, type LigneRegistre, type ReponseExportRegistre, type ReponseLireLiaisons, type ReponseRegistre, type VueLiaison } from "../../contrats/liaisons-lecture.js";
import { Bouton, Champ, Chargement, EnTete, EtatErreur, Horodatage, Pastille, Section, Vide } from "../composants.js";
import { classerErreur, type Ton } from "../format.js";
import { appelRoute, telechargerBase64 } from "../routes-prospection.js";
import { STYLES_ECHANGES } from "../styles-echanges.js";

const TON: Record<StatutLiaison, Ton> = { en_attente_approbation: "attention", ouverte: "info", repondue: "succes", refusee: "danger", annulee: "neutre", cible_supprimee: "neutre" };

/** Liaisons d'une tâche ; une réponse inattendue (autre forme, erreur réseau) vaut « aucun échange ». */
export async function lireLiaisonsTache(issueId: string): Promise<VueLiaison[]> {
  try {
    const r = await appelRoute<Partial<ReponseLireLiaisons> | null>("GET", `/taches/${encodeURIComponent(issueId)}/liaisons`);
    return Array.isArray(r?.liaisons) ? r!.liaisons : [];
  } catch {
    return [];
  }
}

export function useLiaisonsTache(issueId: string | null | undefined): VueLiaison[] | null {
  const [liaisons, setLiaisons] = useState<VueLiaison[] | null>(null);
  useEffect(() => {
    if (!issueId) return;
    let annule = false;
    void lireLiaisonsTache(issueId).then((l) => !annule && setLiaisons(l));
    return () => {
      annule = true;
    };
  }, [issueId]);
  return liaisons;
}

function Echange({ l }: { l: VueLiaison }) {
  const recue = l.role === "cible";
  return (
    <li>
      <div className="atl-ech-tete">
        <div>
          <h3>{l.objet}</h3>
          <p className="atl-ech-sens">{recue ? `Demande reçue du service ${l.nomServiceSource}` : `Demande du service ${l.nomServiceSource} au service ${l.nomServiceCible}`}</p>
        </div>
        <Pastille ton={TON[l.statut]}>{l.libelleStatut}</Pastille>
      </div>
      <dl className="atl-ech-dates">
        <div>
          <dt>Demandée le</dt>
          <dd>
            <Horodatage iso={l.creeLe} />
          </dd>
        </div>
        {l.reponduLe ? (
          <div>
            <dt>Répondue le</dt>
            <dd>
              <Horodatage iso={l.reponduLe} />
            </dd>
          </div>
        ) : null}
      </dl>
      <div className="atl-ech-bloc">
        <h4>Question</h4>
        <p className="atl-ech-texte">{l.question}</p>
      </div>
      {l.extraits.length > 0 ? (
        <div className="atl-ech-bloc">
          <h4>{recue ? `Extraits transmis (${l.extraits.length})` : `Extraits joints (${l.extraits.length})`}</h4>
          <ul className="atl-ech-extraits">
            {l.extraits.map((e, i) => (
              <li key={i}>
                <details>
                  <summary>{e.titre}</summary>
                  <p className="atl-ech-texte">{e.texte}</p>
                </details>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {l.reponse ? (
        <div className="atl-ech-bloc">
          <h4>Réponse</h4>
          <p className="atl-ech-texte atl-ech-reponse">{l.reponse}</p>
        </div>
      ) : null}
    </li>
  );
}

/** Contenu de l'onglet « Échanges » d'une tâche. */
export function OngletEchanges({ liaisons }: { liaisons: readonly VueLiaison[] }) {
  return (
    <>
      <style>{STYLES_ECHANGES}</style>
      <section className="atl-ech" aria-label="Échanges avec les autres services">
        {liaisons.every((l) => l.role === "cible") ? (
          <p className="atl-attenue">Vous ne voyez ici que ce que le service demandeur a transmis.</p>
        ) : null}
        <ul className="atl-ech-liste">
          {liaisons.map((l) => (
            <Echange key={l.id} l={l} />
          ))}
        </ul>
      </section>
    </>
  );
}

// ---------------------------------------------------------------- accès à la Direction

const accesParEntreprise = new Map<string, Promise<boolean>>();

/** Pour les tests : oublie les réponses mémorisées. */
export function oublierAccesDirection(): void {
  accesParEntreprise.clear();
}

/** Vrai si le serveur autorise le registre pour cette entreprise (il répond `autorise: true`) ; un refus est mémorisé, une panne non. */
export function accesDirection(companyId: string): Promise<boolean> {
  const connu = accesParEntreprise.get(companyId);
  if (connu) return connu;
  const p = appelRoute<Partial<ReponseRegistre> | null>("GET", `/liaisons/registre?companyId=${encodeURIComponent(companyId)}&taille=1`).then(
    (r) => r?.autorise === true,
    (e: unknown) => {
      if ((e as { code?: unknown } | null)?.code !== "HTTP_403") accesParEntreprise.delete(companyId);
      return false;
    },
  );
  accesParEntreprise.set(companyId, p);
  return p;
}

export function useAccesDirection(companyId: string | null | undefined): boolean {
  const [acces, setAcces] = useState(false);
  useEffect(() => {
    if (!companyId) {
      setAcces(false);
      return;
    }
    let annule = false;
    void accesDirection(companyId).then((a) => !annule && setAcces(a));
    return () => {
      annule = true;
    };
  }, [companyId]);
  return acces;
}

// ---------------------------------------------------------------- registre

const STATUTS: ReadonlyArray<{ cle: StatutLiaison; libelle: string }> = [
  { cle: "en_attente_approbation", libelle: "En attente d'accord" },
  { cle: "ouverte", libelle: "Transmise" },
  { cle: "repondue", libelle: "Répondue" },
  { cle: "refusee", libelle: "Refusée" },
  { cle: "annulee", libelle: "Annulée" },
];
const TAILLE = 25;

interface Filtres {
  service: string;
  statut: string;
  du: string;
  au: string;
}
const AUCUN: Filtres = { service: "", statut: "", du: "", au: "" };

function requete(companyId: string, f: Filtres, page: number, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams({ companyId, page: String(page), taille: String(TAILLE), ...extra });
  for (const [k, v] of Object.entries(f)) if (v) p.set(k, v);
  return `/liaisons/registre?${p.toString()}`;
}

export function VueRegistre() {
  const { companyId } = useHostContext();
  const [filtres, setFiltres] = useState<Filtres>(AUCUN);
  const [page, setPage] = useState(1);
  const [version, setVersion] = useState(0);
  const [etat, setEtat] = useState<{ data: ReponseRegistre | null; erreur: unknown; chargement: boolean }>({ data: null, erreur: null, chargement: true });
  const [export_, setExport] = useState(false);
  const [retour, setRetour] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    let annule = false;
    setEtat((e) => ({ ...e, chargement: true, erreur: null }));
    appelRoute<ReponseRegistre>("GET", requete(companyId, filtres, page))
      .then((data) => !annule && setEtat({ data, erreur: null, chargement: false }))
      .catch((erreur: unknown) => !annule && setEtat({ data: null, erreur, chargement: false }));
    return () => {
      annule = true;
    };
  }, [companyId, filtres, page, version]);

  const changer = (cle: keyof Filtres) => (valeur: string) => {
    setFiltres((f) => ({ ...f, [cle]: valeur }));
    setPage(1);
  };
  const periodeInversee = filtres.du !== "" && filtres.au !== "" && filtres.du > filtres.au;

  const exporter = useCallback(async () => {
    if (!companyId || export_) return;
    setExport(true);
    setRetour(null);
    try {
      const r = await appelRoute<ReponseExportRegistre>("GET", requete(companyId, filtres, 1, { exporter: "csv" }));
      telechargerBase64(r.fichier.nom, r.fichier.typeMime, r.fichier.contenuBase64);
      setRetour(r.tronque ? `Export limité aux ${r.lignes} échanges les plus récents.` : `${r.lignes} échange${r.lignes > 1 ? "s" : ""} exporté${r.lignes > 1 ? "s" : ""}.`);
    } catch (e) {
      setRetour(classerErreur(e).message);
    } finally {
      setExport(false);
    }
  }, [companyId, filtres, export_]);

  const d = etat.data;
  return (
    <div className="atl-ech">
      <style>{STYLES_ECHANGES}</style>
      <EnTete titre="Registre des échanges" description="Toutes les demandes entre les services de ce client : qui a demandé quoi à qui, où elle en est. Les questions, extraits et réponses restent dans les tâches concernées." />
      <Section titre="Échanges entre services" id="registre-echanges">
        <form className="atl-ech-filtres" onSubmit={(e) => e.preventDefault()} aria-label="Filtres du registre">
          <Champ libelle="Service">
            <select value={filtres.service} onChange={(e) => changer("service")(e.target.value)}>
              <option value="">Tous les services</option>
              {Object.entries(NOMS_SERVICES).map(([slug, nom]) => (
                <option key={slug} value={slug}>
                  {nom}
                </option>
              ))}
            </select>
          </Champ>
          <Champ libelle="Statut">
            <select value={filtres.statut} onChange={(e) => changer("statut")(e.target.value)}>
              <option value="">Tous les statuts</option>
              {STATUTS.map((s) => (
                <option key={s.cle} value={s.cle}>
                  {s.libelle}
                </option>
              ))}
            </select>
          </Champ>
          <Champ libelle="Du">
            <input type="date" value={filtres.du} onChange={(e) => changer("du")(e.target.value)} />
          </Champ>
          <Champ libelle="Au" aide={periodeInversee ? "La date de fin précède la date de début." : undefined}>
            <input type="date" value={filtres.au} onChange={(e) => changer("au")(e.target.value)} aria-invalid={periodeInversee || undefined} />
          </Champ>
        </form>
        {etat.erreur ? <EtatErreur erreur={etat.erreur} onReessayer={() => setVersion((v) => v + 1)} contexte="le registre des échanges" /> : null}
        {etat.chargement && !d ? <Chargement libelle="Chargement du registre" /> : null}
        {d && d.lignes.length === 0 ? <Vide titre="Aucun échange ne correspond.">Modifiez les filtres, ou attendez qu'un service adresse une demande à un autre.</Vide> : null}
        {d && d.lignes.length > 0 ? <TableRegistre lignes={d.lignes} /> : null}
        <div className="atl-ech-barre">
          <p className="atl-attenue" role="status">
            {d ? `${d.total} échange${d.total > 1 ? "s" : ""}, page ${d.page} sur ${d.pages}` : ""}
          </p>
          <div className="atl-ech-pages">
            {page > 1 ? (
              <Bouton variante="secondaire" onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Précédent
              </Bouton>
            ) : null}
            {d && page < d.pages ? (
              <Bouton variante="secondaire" onClick={() => setPage((p) => p + 1)}>
                Suivant
              </Bouton>
            ) : null}
            <Bouton variante="secondaire" enCours={export_} onClick={() => void exporter()} raisonDesactive={!d || d.total === 0 ? "Aucun échange à exporter." : null}>
              Exporter en CSV
            </Bouton>
          </div>
        </div>
        {retour ? (
          <p role="status" className="atl-attenue">
            {retour}
          </p>
        ) : null}
      </Section>
    </div>
  );
}

function TableRegistre({ lignes }: { lignes: readonly LigneRegistre[] }) {
  return (
    <div className="atl-table-cadre">
      <table className="atl-table">
        <thead>
          <tr>
            <th scope="col">Objet</th>
            <th scope="col">De</th>
            <th scope="col">Vers</th>
            <th scope="col">Statut</th>
            <th scope="col">Demandée</th>
            <th scope="col">Répondue</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((l) => (
            <tr key={l.id}>
              <th scope="row">{l.objet}</th>
              <td data-libelle="De">{l.nomServiceSource}</td>
              <td data-libelle="Vers">{l.nomServiceCible}</td>
              <td data-libelle="Statut">
                <Pastille ton={TON[l.statut]}>{l.libelleStatut}</Pastille>
              </td>
              <td data-libelle="Demandée">
                <Horodatage iso={l.creeLe} />
              </td>
              <td data-libelle="Répondue">
                <Horodatage iso={l.reponduLe} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
