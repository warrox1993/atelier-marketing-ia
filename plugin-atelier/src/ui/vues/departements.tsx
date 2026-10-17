/**
 * Vue « Départements » : grille de cases des services d'un client (une entreprise Paperclip par service, une case par service).
 *
 * - La liste vient de `departements.lister` (déclaration du plugin, jamais un service d'un autre client), croisée avec
 *   les entreprises que l'utilisateur voit (`GET /api/companies`) : un service auquel il n'a pas accès n'apparaît pas,
 *   et le préfixe et le nom viennent de l'hôte.
 * - Chaque case est lue par `departement.etat` avec le companyId de SON service (l'hôte refuse tout autre appel et
 *   vérifie l'accès de l'utilisateur à chaque service), six lectures à la fois au plus ; chaque case se remplit et
 *   échoue indépendamment.
 * - Un clic sur un service ouvre son atelier (`/<PRÉFIXE>/atelier`).
 */
import { useCallback, useEffect, useState } from "react";
import { useHostContext } from "@paperclipai/plugin-sdk/ui";
import type { DepartementDeclare, EtatDepartement } from "../../contrats/departements.js";
import { Chargement, EnTete, EtatErreur, LienHote, Vide } from "../composants.js";
import { aPlusieursDepartements, lireDepartements, nomClient } from "../departements-sonde.js";
import { enDate, ilYA, nombre } from "../format.js";
import { appelHote } from "../hote.js";
import { appelRoute } from "../routes-prospection.js";
import { STYLES_DEPARTEMENTS } from "../styles-departements.js";

/** Lectures de cases simultanées au plus. */
export const LECTURES_SIMULTANEES = 6;

export interface EntrepriseHote {
  id: string;
  name: string;
  issuePrefix: string;
}

/** Service affiché : déclaré par le plugin ET visible par l'utilisateur. */
export interface DepartementVisible extends DepartementDeclare {
  prefixe: string;
  nomEntreprise: string;
}

type Case = { etat: "chargement" } | { etat: "pret"; donnees: EtatDepartement } | { etat: "erreur"; message: string };

/** Exécute `travail` sur chaque élément, `limite` à la fois au plus, dans l'ordre. */
export async function enParallele<T>(elements: readonly T[], limite: number, travail: (x: T) => Promise<void>): Promise<void> {
  let suivant = 0;
  const ouvrier = async () => {
    while (suivant < elements.length) {
      const x = elements[suivant++]!;
      await travail(x);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limite, elements.length) }, ouvrier));
}

export async function lireEntreprises(): Promise<EntrepriseHote[]> {
  const brut = await appelHote<unknown>("GET", "/companies");
  const liste = (Array.isArray(brut) ? brut : ((brut as { items?: unknown[] } | null)?.items ?? [])) as Array<Partial<EntrepriseHote>>;
  return liste.filter((c): c is EntrepriseHote => typeof c.id === "string" && typeof c.name === "string" && typeof c.issuePrefix === "string" && c.issuePrefix !== "");
}

/** Croise la déclaration du plugin avec les entreprises de l'utilisateur. */
export function departementsVisibles(declares: readonly DepartementDeclare[], entreprises: readonly EntrepriseHote[]): DepartementVisible[] {
  const parId = new Map(entreprises.map((e) => [e.id, e]));
  return declares.flatMap((d) => {
    const e = parId.get(d.companyId);
    return e ? [{ ...d, prefixe: e.issuePrefix, nomEntreprise: e.name }] : [];
  });
}

const pluriel = (n: number, un: string, plusieurs: string) => `${nombre(n)} ${n > 1 ? plusieurs : un}`;

function Chiffre({ valeur, libelle, ton, tronque }: { valeur: number; libelle: string; ton?: "attention" | "danger"; tronque?: boolean }) {
  return (
    <div className="atl-dep-chiffre" data-ton={valeur > 0 ? ton : undefined} data-zero={valeur === 0 || undefined}>
      <dt>{libelle}</dt>
      <dd>
        {nombre(valeur)}
        {tronque ? <span title="Lecture bornée : au moins ce nombre">+</span> : null}
      </dd>
    </div>
  );
}

function niveauAlerte(c: Case): "haute" | "moyenne" | undefined {
  if (c.etat !== "pret") return undefined;
  if (c.donnees.alertes.some((a) => a.niveau === "haute")) return "haute";
  return c.donnees.alertes.length ? "moyenne" : undefined;
}

/** Une case : le service (et ses alertes), trois nombres, puis l'équipe et la dernière activité. Toute la case est le lien. */
function CaseDepartement({ d, c, relire }: { d: DepartementVisible; c: Case; relire: () => void }) {
  return (
    <li className="atl-dep-case" data-alerte={niveauAlerte(c)} data-courant={d.courant || undefined}>
      <div className="atl-dep-nom">
        <h2>
          <LienHote vers={`/${d.prefixe}/atelier`} className="atl-dep-lien">
            {d.nom}
          </LienHote>
          {d.courant ? <span className="atl-dep-ici">Vous êtes ici</span> : null}
        </h2>
        {c.etat === "pret" && c.donnees.alertes.length ? (
          <ul className="atl-dep-alertes" aria-label={`Alertes du service ${d.nom}`}>
            {c.donnees.alertes.map((a) => (
              <li key={a.texte} data-niveau={a.niveau}>
                {a.texte}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {c.etat === "chargement" ? (
        <div className="atl-dep-attente">
          <Chargement libelle={`Lecture du service ${d.nom}`} lignes={1} />
        </div>
      ) : c.etat === "erreur" ? (
        <div className="atl-dep-erreur" role="alert">
          <p>Lecture impossible : {c.message}</p>
          <button type="button" className="atl-bouton atl-dep-relire" onClick={relire}>
            Réessayer
          </button>
        </div>
      ) : (
        <>
          <dl className="atl-dep-chiffres">
            <Chiffre valeur={c.donnees.validations.total} libelle="À valider" ton="attention" />
            <Chiffre valeur={c.donnees.taches.enCours} libelle="En cours" tronque={c.donnees.tachesTronquees} />
            <Chiffre valeur={c.donnees.taches.bloquees} libelle="Bloquées" ton="danger" tronque={c.donnees.tachesTronquees} />
          </dl>
          <EquipeEtActivite e={c.donnees} />
        </>
      )}
    </li>
  );
}

function EquipeEtActivite({ e }: { e: EtatDepartement }) {
  const agents = [
    pluriel(e.agents.actifs, "agent actif", "agents actifs"),
    ...(e.agents.enPause ? [`${nombre(e.agents.enPause)} en pause`] : []),
    ...(e.agents.enErreur ? [`${nombre(e.agents.enErreur)} en erreur`] : []),
  ].join(", ");
  const derniere = enDate(e.derniereActivite);
  return (
    <div className="atl-dep-meta">
      <p className="atl-dep-agents">{agents}</p>
      <p className="atl-dep-activite">{derniere ? `Actif ${ilYA(derniere)}` : "Aucune activité récente"}</p>
    </div>
  );
}

export function VueDepartements() {
  const { companyId } = useHostContext();
  const [liste, setListe] = useState<{ client: string; departements: DepartementVisible[] } | null>(null);
  const [erreur, setErreur] = useState<unknown>(null);
  const [cases, setCases] = useState<Record<string, Case>>({});
  const [essai, setEssai] = useState(0);

  useEffect(() => {
    if (!companyId) return;
    let annule = false;
    setListe(null);
    setErreur(null);
    Promise.all([lireDepartements(companyId), lireEntreprises()])
      .then(([r, entreprises]) => {
        if (annule) return;
        if (!r) throw { code: "INDISPONIBLE", message: "La liste des services du client est indisponible." };
        const visibles = departementsVisibles(r.departements, entreprises);
        setListe({ client: nomClient(visibles.map((v) => v.nomEntreprise), r.client), departements: visibles });
      })
      .catch((e: unknown) => !annule && setErreur(e));
    return () => {
      annule = true;
    };
  }, [companyId, essai]);

  const lireCase = useCallback(async (d: DepartementVisible, signal: { annule: boolean }) => {
    setCases((p) => ({ ...p, [d.companyId]: { etat: "chargement" } }));
    try {
      const donnees = await appelRoute<EtatDepartement>("GET", `/departements/etat?companyId=${encodeURIComponent(d.companyId)}`);
      if (!signal.annule) setCases((p) => ({ ...p, [d.companyId]: { etat: "pret", donnees } }));
    } catch (e) {
      const message = (e as { message?: unknown } | null)?.message;
      if (!signal.annule) setCases((p) => ({ ...p, [d.companyId]: { etat: "erreur", message: typeof message === "string" ? message : "erreur inconnue" } }));
    }
  }, []);

  useEffect(() => {
    if (!liste) return;
    const signal = { annule: false };
    setCases(Object.fromEntries(liste.departements.map((d) => [d.companyId, { etat: "chargement" } as Case])));
    void enParallele(liste.departements, LECTURES_SIMULTANEES, (d) => lireCase(d, signal));
    return () => {
      signal.annule = true;
    };
  }, [liste, lireCase]);

  if (erreur) return <EtatErreur erreur={erreur} onReessayer={() => setEssai((n) => n + 1)} contexte="départements" />;
  if (!liste) return <Chargement libelle="Départements" lignes={3} />;
  if (!aPlusieursDepartements({ client: liste.client, departements: liste.departements })) {
    return (
      <Vide titre="Un seul service pour ce client">
        <p>La grille des départements apparaît dès que le client a au moins deux services auxquels vous avez accès.</p>
      </Vide>
    );
  }
  return (
    <section className="atl-dep" aria-labelledby="atl-dep-titre">
      <style href="atelier-departements" precedence="default">
        {STYLES_DEPARTEMENTS}
      </style>
      <EnTete titre="Départements" description={`${liste.client} : ${pluriel(liste.departements.length, "service", "services")}. Choisissez-en un pour ouvrir son atelier.`} />
      <span id="atl-dep-titre" className="atl-sr">
        Départements de {liste.client}
      </span>
      <ul className="atl-dep-grille">
        {liste.departements.map((d) => (
          <CaseDepartement key={d.companyId} d={d} c={cases[d.companyId] ?? { etat: "chargement" }} relire={() => void lireCase(d, { annule: false })} />
        ))}
      </ul>
    </section>
  );
}
