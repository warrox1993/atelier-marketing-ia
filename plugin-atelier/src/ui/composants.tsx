/**
 * Briques communes de l'interface : pastilles d'état,
 * états vide / chargement / erreur / accès absent / interrompu / périmé,
 * boutons dont la désactivation porte toujours une raison visible.
 */
import { cloneElement, useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from "react";
import { useHostContext, useHostLocation, useHostNavigation, type PluginBridgeError } from "@paperclipai/plugin-sdk/ui";
import type { EtatConnexion } from "../contrats/communs.js";
import type { StatutFonctionnel } from "../contrats/statuts.js";
import { DELAI_PERIME_MS, useContexteDonnees, useDonnees } from "./donnees.js";
import { appelHote } from "./hote.js";
import { aPlusieursDepartements, nomClient, useDepartements } from "./departements-sonde.js";
import { chemin, lireRoute } from "./route.js";
import { STYLES_DEPARTEMENTS } from "./styles-departements.js";
import { classerErreur, dateHeure, dateSeule, decalageBruxelles, ETATS_CONNEXION, heureSeule, ilYA, libelleStatut, TON_STATUT, type Ton } from "./format.js";

export function Pastille({ ton = "neutre", children, titre }: { ton?: Ton; children: ReactNode; titre?: string }) {
  return (
    <span className="atl-pastille" data-ton={ton} title={titre}>
      {children}
    </span>
  );
}

export function PastilleConnexion({ etat }: { etat: EtatConnexion }) {
  // Une source sans accès réel s'affiche « Non connecté » : l'interface ne montre jamais d'état simulé.
  const e = ETATS_CONNEXION[etat === "demonstration" ? "non_connecte" : etat];
  return (
    <Pastille ton={e.ton} titre={e.aide}>
      {e.libelle}
    </Pastille>
  );
}

export function PastilleStatut({ statut, motif }: { statut: StatutFonctionnel; motif?: string }) {
  return (
    <Pastille ton={TON_STATUT[statut]} titre={motif}>
      {libelleStatut(statut)}
    </Pastille>
  );
}

export function Horodatage({ iso, seulementDate = false }: { iso: string | null | undefined; seulementDate?: boolean }) {
  if (!iso) return <span className="atl-attenue">non renseignée</span>;
  const texte = dateHeure(iso);
  return (
    <time dateTime={iso} title={`Heure de Bruxelles (${decalageBruxelles(iso)}) ; stocké en UTC : ${iso}`}>
      {seulementDate ? dateSeule(iso) : texte}
    </time>
  );
}

export function Chargement({ libelle = "Chargement", lignes = 3 }: { libelle?: string; lignes?: number }) {
  return (
    <div className="atl-chargement" aria-busy="true" role="status">
      <span className="atl-sr">{libelle}…</span>
      {Array.from({ length: lignes }, (_, i) => (
        <span key={i} className="atl-squelette" style={{ width: `${92 - i * 17}%` }} aria-hidden="true" />
      ))}
    </div>
  );
}

export function EtatErreur({ erreur, onReessayer, contexte }: { erreur: PluginBridgeError | unknown; onReessayer?: () => void; contexte?: string }) {
  const e = classerErreur(erreur);
  return (
    <div className="atl-encart" data-ton={e.categorie === "acces" || e.categorie === "erreur" ? "danger" : "attention"} role="alert">
      <p className="atl-encart-titre">
        {e.titre}
        {contexte ? ` : ${contexte}` : ""}
      </p>
      <p>{e.message}</p>
      {e.categorie === "acces" ? <p className="atl-attenue">Les droits sont vérifiés par le serveur ; l'interface ne peut pas les contourner.</p> : null}
      <p className="atl-code">Code : {e.code}</p>
      {onReessayer ? (
        <button type="button" className="atl-bouton" onClick={onReessayer}>
          Réessayer
        </button>
      ) : null}
    </div>
  );
}

export function Vide({ titre, children, action }: { titre: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="atl-vide">
      <p className="atl-vide-titre">{titre}</p>
      {children ? <div className="atl-vide-texte">{children}</div> : null}
      {action ? <div className="atl-vide-action">{action}</div> : null}
    </div>
  );
}

/** Rendu standard d'une lecture : chargement, erreur, vide, puis contenu. */
export function Lecture<T>({
  r,
  libelle,
  estVide,
  vide,
  children,
}: {
  r: { data: T | null; loading: boolean; error: PluginBridgeError | null; refresh(): void };
  libelle: string;
  estVide?: (d: T) => boolean;
  vide?: ReactNode;
  children: (d: T) => ReactNode;
}) {
  if (r.error) return <EtatErreur erreur={r.error} onReessayer={r.refresh} contexte={libelle} />;
  if (r.data === null) return r.loading ? <Chargement libelle={`Chargement : ${libelle}`} /> : <Vide titre="Aucune donnée reçue." />;
  if (estVide?.(r.data)) return <>{vide}</>;
  return <>{children(r.data)}</>;
}

/**
 * Bouton d'action. Désactivé, il affiche sa raison sous lui (et la relie par
 * aria-describedby) : aucune action d'apparence active ne reste muette.
 */
export function Bouton({
  children,
  onClick,
  type = "button",
  variante = "secondaire",
  raisonDesactive,
  enCours = false,
  formulaire,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variante?: "principal" | "secondaire" | "danger" | "discret";
  raisonDesactive?: string | null;
  enCours?: boolean;
  formulaire?: string;
}) {
  const id = useId();
  const desactive = Boolean(raisonDesactive) || enCours;
  return (
    <span className="atl-bouton-groupe">
      <button
        type={type}
        form={formulaire}
        className="atl-bouton"
        data-variante={variante}
        onClick={(e) => {
          if (desactive) {
            e.preventDefault();
            return;
          }
          onClick?.();
        }}
        aria-disabled={desactive || undefined}
        disabled={enCours}
        aria-describedby={raisonDesactive ? id : undefined}
        aria-busy={enCours || undefined}
      >
        {enCours ? "Envoi…" : children}
      </button>
      {raisonDesactive ? (
        <span id={id} className="atl-raison">
          {raisonDesactive}
        </span>
      ) : null}
    </span>
  );
}

/** Lien interne à Paperclip (préfixe d'entreprise ajouté par l'hôte). */
export function LienHote({ vers, children, className, courant }: { vers: string; children: ReactNode; className?: string; courant?: boolean }) {
  const nav = useHostNavigation();
  const props = nav.linkProps(vers);
  return (
    <a {...props} className={className ?? "atl-lien"} aria-current={courant ? "page" : undefined}>
      {children}
    </a>
  );
}

/** Vrai sur un écran étroit (téléphone) ; faux sans `matchMedia` (tests, rendu serveur). */
export function ecranEtroit(): boolean {
  try {
    return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(max-width: 640px)").matches;
  } catch {
    return false;
  }
}

/** Vrai si l'adresse courante vise cette ancre (`#ancre`). */
function ancreVisee(ancre: string | undefined): boolean {
  if (!ancre || typeof window === "undefined") return false;
  return window.location.hash === `#${ancre}`;
}

/**
 * Section de page. Avec `repliable`, le titre devient le résumé d'un `details` : ouvert sur grand écran,
 * replié sur téléphone sauf si l'adresse vise l'ancre de la section (`ancre`, posée sur l'élément).
 */
export function Section({ titre, id, children, actions, aide, ancre, repliable }: { titre: string; id?: string; children: ReactNode; actions?: ReactNode; aide?: ReactNode; ancre?: string; repliable?: boolean }) {
  const auto = useId();
  const idTitre = id ?? auto;
  const [ouvert, setOuvert] = useState(() => !ecranEtroit() || ancreVisee(ancre));
  useEffect(() => {
    if (!repliable) return;
    const surAncre = () => {
      if (ancreVisee(ancre)) setOuvert(true);
    };
    window.addEventListener("hashchange", surAncre);
    return () => window.removeEventListener("hashchange", surAncre);
  }, [repliable, ancre]);
  const corps = (
    <>
      {aide ? <p className="atl-section-aide">{aide}</p> : null}
      {children}
    </>
  );
  if (repliable) {
    return (
      <section className="atl-section atl-section-repliable" aria-labelledby={idTitre} id={ancre}>
        <details open={ouvert} onToggle={(e) => setOuvert(e.currentTarget.open)}>
          <summary className="atl-section-resume">
            <h2 id={idTitre}>{titre}</h2>
          </summary>
          <div className="atl-section-corps">
            {actions ? <div className="atl-section-actions">{actions}</div> : null}
            {corps}
          </div>
        </details>
      </section>
    );
  }
  return (
    <section className="atl-section" aria-labelledby={idTitre} id={ancre}>
      <div className="atl-section-tete">
        <h2 id={idTitre}>{titre}</h2>
        {actions ? <div className="atl-section-actions">{actions}</div> : null}
      </div>
      {corps}
    </section>
  );
}

export function EnTete({ titre, description, actions, retour }: { titre: string; description?: ReactNode; actions?: ReactNode; retour?: ReactNode }) {
  return (
    <header className="atl-entete">
      {retour ? <div className="atl-retour">{retour}</div> : null}
      <div className="atl-entete-ligne">
        <h1>{titre}</h1>
        {actions ? <div className="atl-entete-actions">{actions}</div> : null}
      </div>
      {description ? <p className="atl-entete-description">{description}</p> : null}
    </header>
  );
}

/** Ligne de fraîcheur : heure du chargement, événements survenus depuis, actualisation. */
export function Fraicheur({ chargeLe, actualisation }: { chargeLe: Date | null; actualisation: boolean }) {
  const { nouveauxEvenements, actualiserTout, journalDisponible } = useContexteDonnees();
  const [maintenant, setMaintenant] = useState(() => new Date());
  useEffect(() => {
    const m = setInterval(() => setMaintenant(new Date()), 30_000);
    return () => clearInterval(m);
  }, []);
  const ancien = chargeLe ? maintenant.getTime() - chargeLe.getTime() > DELAI_PERIME_MS : false;
  const perime = nouveauxEvenements > 0 || ancien;
  return (
    <div className="atl-fraicheur" data-perime={perime || undefined}>
      <span>
        {actualisation
          ? "Actualisation…"
          : chargeLe
            ? `Données chargées à ${heureSeule(chargeLe)} (${ilYA(chargeLe, maintenant)})`
            : "Données en cours de chargement"}
        {nouveauxEvenements > 0 ? ` · ${nouveauxEvenements} nouvel${nouveauxEvenements > 1 ? "s" : ""} événement${nouveauxEvenements > 1 ? "s" : ""} depuis : affichage périmé` : ""}
        {!nouveauxEvenements && ancien ? " · affichage ancien, à actualiser" : ""}
        {!journalDisponible ? " · suivi des événements indisponible" : ""}
      </span>
      <span className="atl-sr" role="status">
        {perime ? "Affichage périmé : de nouvelles données sont disponibles." : ""}
      </span>
      <button type="button" className="atl-bouton" data-variante={perime ? "principal" : "discret"} onClick={actualiserTout}>
        Actualiser
      </button>
    </div>
  );
}

/** Liste de valeurs ou mention explicite d'absence. */
export function ListeOuAucun({ valeurs, aucun = "aucun" }: { valeurs: readonly string[]; aucun?: string }) {
  if (!valeurs.length) return <span className="atl-attenue">{aucun}</span>;
  return <>{valeurs.join(", ")}</>;
}

/**
 * Champ de formulaire : le libellé seul donne le nom accessible ; l'aide est
 * reliée par aria-describedby (elle ne pollue pas le nom du champ).
 */
export function Champ({ libelle, aide, className, children }: { libelle: ReactNode; aide?: ReactNode; className?: string; children: ReactElement<Record<string, unknown>> }) {
  const id = useId();
  const idAide = useId();
  return (
    <div className={`atl-champ${className ? ` ${className}` : ""}`}>
      <label htmlFor={id}>{libelle}</label>
      {cloneElement(children, { id, "aria-describedby": aide ? idAide : undefined })}
      {aide ? (
        <span id={idAide} className="atl-aide">
          {aide}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Bandeau « entreprise courante » en tête de chaque vue : le nom complet de l'entreprise,
 * sans pastille de mode. Pour un client à plusieurs services, il devient un fil « Client › Département »
 * avec un lien « Tous les départements » vers le tableau du client.
 */
export function BandeauEntreprise() {
  const { companyId } = useHostContext();
  const departements = useDepartements(companyId);
  const { pathname } = useHostLocation();
  const [nom, setNom] = useState<string | null>(null);
  useEffect(() => {
    if (!companyId) return;
    let annule = false;
    appelHote<{ name?: unknown }>("GET", `/companies/${encodeURIComponent(companyId)}`)
      .then((c) => {
        if (!annule) setNom(typeof c?.name === "string" && c.name.trim() ? c.name.trim() : null);
      })
      .catch(() => undefined);
    return () => {
      annule = true;
    };
  }, [companyId]);
  const affiche = nom ?? "Entreprise courante";
  const courant = departements?.departements.find((d) => d.courant);
  if (departements && courant && aPlusieursDepartements(departements)) {
    const surTableau = lireRoute(pathname).vue === "departements";
    return (
      <nav className="atl-bandeau-entreprise atl-fil" aria-label="Fil d'Ariane">
        <style href="atelier-departements" precedence="default">
          {STYLES_DEPARTEMENTS}
        </style>
        <ol>
          <li className="atl-fil-client">{nomClient(nom ? [nom] : [], departements.client)}</li>
          <li>
            <strong className="atl-bandeau-nom" title={affiche} aria-current={surTableau ? undefined : "page"}>
              {surTableau ? "Départements" : courant.nom}
            </strong>
          </li>
        </ol>
        {surTableau ? null : (
          <LienHote vers={chemin("departements")} className="atl-lien atl-fil-tous">
            Tous les départements
          </LienHote>
        )}
      </nav>
    );
  }
  return (
    <p className="atl-bandeau-entreprise">
      <span className="atl-bandeau-etiquette">Entreprise :</span>
      {/* Une seule ligne : le nom se tronque avec des points de suspension, le nom complet reste dans l'infobulle et dans le texte lu. */}
      <strong className="atl-bandeau-nom" title={affiche}>
        {affiche}
      </strong>
    </p>
  );
}

/** Bouton qui amène à un titre de la page (écran vide : « Importer » mène au formulaire déjà présent plus bas). */
export function BoutonAller({ cible, children }: { cible: string; children: ReactNode }) {
  return (
    <Bouton
      variante="principal"
      onClick={() => {
        const element = document.getElementById(cible);
        element?.scrollIntoView?.({ behavior: "smooth", block: "start" });
        element?.setAttribute("tabindex", "-1");
        element?.focus?.({ preventScroll: true });
      }}
    >
      {children}
    </Bouton>
  );
}

/**
 * Message de réussite d'une action : il reçoit le focus à son apparition (et à chaque nouveau texte), car le
 * bouton cliqué a disparu avec son panneau et le focus retomberait sinon sur la page. Annoncé aussi comme `status`.
 */
export function MessageFait({ texte, className, element: Element = "p" }: { texte: string; className?: string; element?: "p" | "span" }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: false });
  }, [texte]);
  return (
    <Element ref={ref as never} className={className} role="status" tabIndex={-1}>
      {texte}
    </Element>
  );
}
