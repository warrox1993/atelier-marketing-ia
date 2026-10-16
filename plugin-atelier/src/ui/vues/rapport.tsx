/**
 * Onglet « Rapport du mois » (rubrique Marketing) : ce que l'équipe a fait et obtenu sur un mois, à remettre au
 * client. Les chiffres viennent de la route `rapport.mensuel`, avec leur source et leur période ; une donnée non
 * mesurée s'écrit « non mesuré », jamais 0. Mise en page imprimable (voir `styles-rapport.ts`) et bouton
 * « Imprimer ou enregistrer en PDF ».
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useHostContext } from "@paperclipai/plugin-sdk/ui";
import { RapportMensuel, type ChiffreRapport } from "../../contrats/rapport.js";
import { Chargement, EnTete, EtatErreur, Section } from "../composants.js";
import { dateSeule, euros, nombre } from "../format.js";
import { appelRoute } from "../routes-prospection.js";
import { STYLES_RAPPORT } from "../styles-rapport.js";

const NB_MOIS_PROPOSES = 24;

/** « octobre 2026 » à partir de « 2026-10 ». */
export function libelleMois(mois: string): string {
  const [a, m] = mois.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(a, m - 1, 1)).toLocaleDateString("fr-BE", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** Les derniers mois, du plus récent au plus ancien, en partant de `maintenant` (UTC). */
export function moisProposes(maintenant: Date = new Date(), n = NB_MOIS_PROPOSES): string[] {
  const sortie: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth() - i, 1));
    sortie.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return sortie;
}

function TableauChiffres({ chiffres }: { chiffres: readonly ChiffreRapport[] }) {
  return (
    <table className="atl-rapport-table">
      <thead>
        <tr>
          <th scope="col">Chiffre</th>
          <th scope="col" className="atl-num">Valeur</th>
          <th scope="col">Source et période</th>
        </tr>
      </thead>
      <tbody>
        {chiffres.map((c) => (
          <tr key={c.cle}>
            <th scope="row">
              {c.libelle}
              {c.note ? <span className="atl-rapport-note">{c.note}</span> : null}
            </th>
            <td className="atl-num">{c.valeur === null ? <span className="atl-rapport-non-mesure">Non mesuré</span> : nombre(c.valeur)}</td>
            <td>
              {c.source}
              <span className="atl-rapport-note">du {dateSeule(c.periode.debut)} au {dateSeule(c.periode.fin)}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

type Lecture = { etat: "chargement" } | { etat: "erreur"; erreur: unknown } | { etat: "pret"; rapport: RapportMensuel };

export function VueRapport() {
  const { companyId } = useHostContext();
  const mois = useMemo(() => moisProposes(), []);
  const [choisi, setChoisi] = useState(mois[0]!);
  const [lecture, setLecture] = useState<Lecture>({ etat: "chargement" });

  const charger = useCallback(async () => {
    if (!companyId) return;
    setLecture({ etat: "chargement" });
    try {
      const brut = await appelRoute<unknown>("GET", `/rapport/mensuel?companyId=${encodeURIComponent(companyId)}&mois=${encodeURIComponent(choisi)}`);
      const lu = RapportMensuel.safeParse(brut);
      if (!lu.success) throw { code: "FORME_INCONNUE", message: "Réponse inattendue de la route « rapport.mensuel » : le worker du plugin n'est peut-être pas à jour." };
      setLecture({ etat: "pret", rapport: lu.data });
    } catch (erreur) {
      setLecture({ etat: "erreur", erreur });
    }
  }, [companyId, choisi]);
  useEffect(() => {
    void charger();
  }, [charger]);

  return (
    <>
      <style href="atelier-rapport" precedence="default">
        {STYLES_RAPPORT}
      </style>
      <div className="atl-rapport-non-imprimable">
        <EnTete titre="Rapport du mois" description="Ce que l'équipe a fait et obtenu sur le mois, avec la source de chaque chiffre. Rien n'est estimé : ce qui n'est pas mesuré est écrit comme tel." />
      </div>
      <div className="atl-rapport-commandes">
        <label>
          Mois du rapport
          <select value={choisi} onChange={(e) => setChoisi(e.target.value)}>
            {mois.map((m) => (
              <option key={m} value={m}>
                {libelleMois(m)}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="atl-bouton" onClick={() => window.print()} disabled={lecture.etat !== "pret"}>
          Imprimer ou enregistrer en PDF
        </button>
      </div>
      {lecture.etat === "chargement" ? <Chargement libelle="Chargement du rapport" /> : null}
      {lecture.etat === "erreur" ? <EtatErreur erreur={lecture.erreur} onReessayer={() => void charger()} contexte="le rapport du mois" /> : null}
      {lecture.etat === "pret" ? <Contenu rapport={lecture.rapport} /> : null}
    </>
  );
}

function Contenu({ rapport: r }: { rapport: RapportMensuel }) {
  return (
    <article className="atl-rapport" aria-label={`Rapport de ${libelleMois(r.mois)}`}>
      <h2 className="atl-rapport-titre">{r.entreprise ?? "Entreprise"} : rapport de {libelleMois(r.mois)}</h2>
      <p className="atl-rapport-periode">
        Période du {dateSeule(r.periode.debut)} au {dateSeule(r.periode.fin)} (heure universelle). Établi le {dateSeule(r.genereLe)}.
      </p>
      <Section titre="Campagnes">
        <TableauChiffres chiffres={r.campagnes} />
      </Section>
      <Section titre="Contenus">
        <TableauChiffres chiffres={r.contenus} />
      </Section>
      <Section titre="Prospects">
        <TableauChiffres chiffres={r.prospects.chiffres} />
        <h3 className="atl-h3">Répartition par statut</h3>
        <TableauChiffres chiffres={r.prospects.badges} />
        {r.prospects.tronque ? <p className="atl-rapport-note">Le parcours s'arrête à {nombre(r.prospects.plafond)} leads : les nombres ci-dessus sont des minimums.</p> : null}
      </Section>
      <Section titre="Demandes de devis et conversions">
        <TableauChiffres chiffres={r.resultats.chiffres} />
      </Section>
      <Section titre="Jetons et coût de l'IA">
        {r.coutsIa.lignes.length === 0 ? (
          <p className="atl-rapport-non-mesure">{r.coutsIa.note}</p>
        ) : (
          <table className="atl-rapport-table">
            <thead>
              <tr>
                <th scope="col">Agent</th>
                <th scope="col">Modèle</th>
                <th scope="col">Facturation</th>
                <th scope="col" className="atl-num">Jetons en entrée</th>
                <th scope="col" className="atl-num">dont en cache</th>
                <th scope="col" className="atl-num">Jetons en sortie</th>
                <th scope="col" className="atl-num">Coût</th>
              </tr>
            </thead>
            <tbody>
              {r.coutsIa.lignes.map((l) => (
                <tr key={`${l.agent}|${l.modele}|${l.facturation}`}>
                  <th scope="row">{l.agent}</th>
                  <td>{l.modele}</td>
                  <td>{l.facturation}</td>
                  <td className="atl-num">{nombre(l.jetonsEntree)}</td>
                  <td className="atl-num">{nombre(l.jetonsEntreeCache)}</td>
                  <td className="atl-num">{nombre(l.jetonsSortie)}</td>
                  <td className="atl-num">{euros(l.coutCentimes)}</td>
                </tr>
              ))}
              <tr>
                <th scope="row">Total</th>
                <td />
                <td />
                <td className="atl-num">{nombre(r.coutsIa.total.jetonsEntree)}</td>
                <td className="atl-num">{nombre(r.coutsIa.total.jetonsEntreeCache)}</td>
                <td className="atl-num">{nombre(r.coutsIa.total.jetonsSortie)}</td>
                <td className="atl-num">{euros(r.coutsIa.total.coutCentimes)}</td>
              </tr>
            </tbody>
          </table>
        )}
        <p className="atl-rapport-note">
          Source : {r.coutsIa.source}, du {dateSeule(r.coutsIa.periode.debut)} au {dateSeule(r.coutsIa.periode.fin)}. {r.coutsIa.note}
        </p>
      </Section>
      <Section titre="En attente de votre part">
        {r.enAttenteClient.points.length === 0 ? (
          <p>Rien n'attend le client pour le moment.</p>
        ) : (
          <ul className="atl-rapport-liste">
            {r.enAttenteClient.points.map((p, i) => (
              <li key={`${p.type}-${i}`}>
                <strong>{p.titre}</strong>
                <span className="atl-rapport-note">{p.raison}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="atl-rapport-note">Source : {r.enAttenteClient.source}. {r.enAttenteClient.note}</p>
      </Section>
    </article>
  );
}
