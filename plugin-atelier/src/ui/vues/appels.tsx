/**
 * Contrat v1.6 (revue des signatures) côté interface : l'humain approuve l'EMPREINTE de l'appel exact
 * proposé par l'agent. Ce module porte les règles pures (testées sans rendu) et les blocs d'affichage :
 *  - aperçu complet, sans aucune troncature, des appels proposés (section du dossier) ;
 *  - portée d'approbation dérivée de l'appel choisi (`portee.appel` recopié tel quel) ;
 *  - suivi d'une diffusion réelle par la passerelle (préparée, preuve émise, confirmée, ambiguë) ;
 *  - preuve d'approbation : expiration, révocation, bouton « Révoquer la preuve ».
 */
import { useState } from "react";
import type { ApprobationPortee, AppelPropose, ChampApercu, Diffusion, DossierHumain } from "../../contrats/dossier.js";
import { Bouton, EtatErreur, Horodatage, Pastille, Section } from "../composants.js";
import { useAction } from "../donnees.js";
import { ACTIONS_EXTERNES, idCourt, type Ton } from "../format.js";

/** Canaux d'approbation reconnus par le serveur pour chaque service (miroir de `SERVICE_DU_CANAL`). */
export const CANAUX_DU_SERVICE: Readonly<Record<string, readonly string[]>> = {
  facebook: ["facebook"],
  instagram: ["instagram"],
  linkedin: ["linkedin"],
  crm: ["crm", "hubspot"],
  pipedrive: ["pipedrive"],
  odoo: ["odoo"],
  teamleader: ["teamleader"],
};

/** Vrai si le canal est servi par la passerelle (le serveur refuse alors « Diffuser » en réel). */
export function canalDePasserelle(canal: string | null | undefined): boolean {
  const c = (canal ?? "").trim().toLowerCase();
  return Object.values(CANAUX_DU_SERVICE).some((l) => l.includes(c));
}

/** Appels que l'humain peut encore approuver : ceux de la révision courante du livrable. */
export function appelsApprouvables(d: DossierHumain, action?: string): AppelPropose[] {
  const rev = d.livrable?.revisionId;
  return (d.appelsProposes ?? []).filter((a) => a.revisionCourante && a.revisionId === rev && (!action || a.action === action));
}

/** Actions externes qui passent par un appel d'outil de la passerelle. */
export const ACTIONS_AVEC_APPEL: readonly string[] = ["publier", "envoyer", "modifier_crm"];

export interface SaisiePortee {
  canal: string;
  audience: string;
  duree: string;
}

/**
 * Portée envoyée pour l'approbation d'un appel : l'action, le compte et l'appel viennent de l'appel
 * lui-même (jamais saisis), le canal est un canal de son service. Une modification de CRM n'a ni
 * audience ni montant (le serveur les refuse).
 */
export function porteeDepuisAppel(appel: AppelPropose, saisie: SaisiePortee): ApprobationPortee {
  const canaux = CANAUX_DU_SERVICE[appel.service] ?? [appel.service];
  const canal = canaux.includes(saisie.canal) ? saisie.canal : canaux[0]!;
  const crm = appel.action === "modifier_crm";
  const duree = saisie.duree.trim() ? Number(saisie.duree) : null;
  return {
    revisionId: appel.revisionId,
    action: appel.action,
    canal,
    compte: appel.compte,
    audience: crm ? null : saisie.audience.trim() || null,
    montantMaxCents: null,
    dureeJours: duree,
    appel: { ...appel.approbation },
  };
}

/** Raison d'invalidité de la durée saisie, ou null. */
export function raisonDuree(duree: string): string | null {
  if (!duree.trim()) return null;
  const n = Number(duree);
  return Number.isInteger(n) && n >= 1 && n <= 365 ? null : "Durée : un nombre entier de jours entre 1 et 365.";
}

/* ------------------------------------------------------------------ */
/* Preuve et diffusion réelle                                            */
/* ------------------------------------------------------------------ */

export type EtatPreuve = "absente" | "remise" | "expiree" | "revoquee";

export function etatPreuve(f: Diffusion, maintenantMs: number): EtatPreuve {
  if (f.revocation) return "revoquee";
  if (f.preuveExpire === null || f.preuveExpire === undefined) return "absente";
  return f.preuveExpire * 1000 <= maintenantMs ? "expiree" : "remise";
}

export function isoDepuisSecondes(s: number): string {
  return new Date(s * 1000).toISOString();
}

/** État d'une diffusion réelle, en mots d'humain : l'agent diffuse, l'interface suit. */
export function etatDiffusionReelle(f: Diffusion, maintenantMs: number): { libelle: string; ton: Ton; detail: string } {
  if (f.etat === "confirmee") return { libelle: "Confirmée", ton: "succes", detail: "La passerelle a rapporté l'exécution de l'appel approuvé." };
  if (f.etat === "ambigue_a_reconcilier") return { libelle: "Ambiguë", ton: "attention", detail: "Le résultat est incertain : à réconcilier à la main avant toute nouvelle tentative." };
  if (f.etat === "refusee") return { libelle: "Refusée", ton: "danger", detail: f.motifRefus ?? "Refusée par le serveur." };
  if (f.etat === "simulee") return { libelle: "Simulée", ton: "demo", detail: "Démonstration : rien n'a été envoyé." };
  const p = etatPreuve(f, maintenantMs);
  if (p === "revoquee") return { libelle: "Preuve révoquée", ton: "danger", detail: "La preuve ne sera plus rendue : une nouvelle approbation est nécessaire." };
  if (p === "expiree") return { libelle: "Preuve expirée", ton: "attention", detail: "Une nouvelle approbation est nécessaire." };
  if (p === "remise") return { libelle: "Preuve émise", ton: "info", detail: "L'agent peut appeler la passerelle avec la preuve ; rien n'est encore confirmé." };
  return { libelle: "Préparée", ton: "info", detail: f.motifRefus ?? "Demande reçue ; aucune preuve n'a été remise." };
}

/** Une preuve se révoque tant qu'elle a été remise et ne l'est pas déjà, sur une diffusion réelle préparée. */
export function revocable(f: Diffusion): boolean {
  return f.mode === "reel" && f.etat === "preparee" && f.preuveExpire !== null && f.preuveExpire !== undefined && !f.revocation;
}

export function raisonRevocation(motif: string): string | null {
  const n = motif.trim().length;
  return n >= 3 && n <= 500 ? null : "Motif obligatoire : de 3 à 500 caractères.";
}

/* ------------------------------------------------------------------ */
/* Affichage                                                             */
/* ------------------------------------------------------------------ */

function Champs({ titre, champs }: { titre: string; champs: ChampApercu[] }) {
  if (!champs.length) return null;
  return (
    <div className="atl-apercu-groupe">
      <h4 className="atl-apercu-titre">{titre}</h4>
      <dl className="atl-apercu-liste">
        {champs.map((c, i) => (
          <div key={`${c.champ}-${i}`} className="atl-apercu-ligne">
            <dt>
              {c.libelle}
              {c.champ.toLowerCase() === c.libelle.toLowerCase() ? null : (
                <>
                  {" "}
                  <code className="atl-apercu-champ">{c.champ}</code>
                </>
              )}
            </dt>
            <dd className="atl-apercu-valeur">{c.valeur}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function CarteAppel({ appel, courant }: { appel: AppelPropose; courant: boolean }) {
  return (
    <li className="atl-appel" data-ancien={courant ? undefined : "true"}>
      <div className="atl-fil-tete">
        <strong>{appel.apercu.resume}</strong>
        <Pastille ton={courant ? "info" : "neutre"}>{ACTIONS_EXTERNES[appel.action]}</Pastille>
        {courant ? null : <Pastille ton="attention">Ancienne révision : non approuvable</Pastille>}
      </div>
      <p className="atl-sous">
        Service {appel.service}, outil <code>{appel.outil}</code>, compte {appel.compte}. Proposé par {appel.proposePar} le <Horodatage iso={appel.creeLe} />.
      </p>
      <Champs titre="Cibles" champs={appel.apercu.cibles} />
      <Champs titre="Textes qui partiront" champs={appel.apercu.textes} />
      <Champs titre="Propriétés modifiées" champs={appel.apercu.proprietes} />
      <div className="atl-apercu-groupe">
        <h4 className="atl-apercu-titre">Empreinte de l'appel</h4>
        <p className="atl-empreinte">
          <code data-empreinte={appel.empreinte}>{appel.empreinte}</code>
        </p>
        <p className="atl-sous">Ce que vous approuvez est cette empreinte : tout autre texte, lien, destinataire ou compte n'obtiendra aucune preuve.</p>
      </div>
    </li>
  );
}

/** Section du dossier : tout ce qui partira, sans troncature. Les appels d'une ancienne révision sont grisés. */
export function SectionAppels({ dossier: d }: { dossier: DossierHumain }) {
  const appels = d.appelsProposes ?? [];
  return (
    <Section titre="Appels proposés" aide="L'appel exact que l'agent fera sur la passerelle. Lisez chaque valeur : vous approuvez cet appel, pas seulement le livrable.">
      {appels.length === 0 ? (
        <p className="atl-attenue">Aucun appel proposé. Sans appel proposé, aucune preuve ne pourra être signée : l'agent doit d'abord proposer l'appel exact.</p>
      ) : (
        <ul className="atl-appels">
          {appels.map((a) => (
            <CarteAppel key={a.id} appel={a} courant={a.revisionCourante && a.revisionId === d.livrable?.revisionId} />
          ))}
        </ul>
      )}
    </Section>
  );
}

/** Suivi d'une diffusion réelle : état, preuve, révocation. L'humain ne diffuse pas, il peut révoquer. */
export function SuiviDiffusionReelle({ dossier: d, onFait }: { dossier: DossierHumain; onFait(): void }) {
  const lignes = d.diffusions.filter((f) => f.mode === "reel");
  const maintenant = Date.now();
  if (!lignes.length) {
    return <p className="atl-attenue">L'agent diffuse avec l'appel approuvé. Aucune diffusion demandée pour l'instant.</p>;
  }
  return (
    <ul className="atl-suivi">
      {lignes.map((f) => (
        <LigneSuivi key={f.id} diffusion={f} issueId={d.issueId} maintenant={maintenant} onFait={onFait} />
      ))}
    </ul>
  );
}

function LigneSuivi({ diffusion: f, issueId, maintenant, onFait }: { diffusion: Diffusion; issueId: string; maintenant: number; onFait(): void }) {
  const revoquer = useAction<Diffusion>("atelier.diffusion.revoquer");
  const [motif, setMotif] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<unknown>(null);
  const [resultat, setResultat] = useState<string | null>(null);
  const e = etatDiffusionReelle(f, maintenant);
  const raison = raisonRevocation(motif);
  const lancer = async () => {
    if (raison) return;
    setEnCours(true);
    setErreur(null);
    try {
      await revoquer({ issueId, diffusionId: f.id, motif: motif.trim() });
      setResultat("Preuve révoquée.");
      setMotif("");
      onFait();
    } catch (err) {
      setErreur(err);
    } finally {
      setEnCours(false);
    }
  };
  return (
    <li className="atl-suivi-ligne" data-diffusion={f.id}>
      <div className="atl-fil-tete">
        <Pastille ton={e.ton}>{e.libelle}</Pastille>
        <span>
          {ACTIONS_EXTERNES[f.action]} sur {f.canal}
        </span>
      </div>
      <p className="atl-sous">{e.detail}</p>
      {f.service || f.outil ? (
        <p className="atl-sous">Appel visé : {[f.service ? `service ${f.service}` : null, f.outil ? `outil ${f.outil}` : null].filter(Boolean).join(", ")}</p>
      ) : null}
      {f.preuveExpire !== null && f.preuveExpire !== undefined ? (
        <p className="atl-sous">
          Preuve valable jusqu'au <Horodatage iso={isoDepuisSecondes(f.preuveExpire)} />.
        </p>
      ) : null}
      {f.revocation ? (
        <p className="atl-sous" data-revocation="true">
          Révoquée le <Horodatage iso={f.revocation.le} /> : {f.revocation.motif}
        </p>
      ) : null}
      {revocable(f) ? (
        <div className="atl-revocation">
          <label htmlFor={`motif-${f.id}`}>Motif de la révocation (obligatoire)</label>
          <textarea id={`motif-${f.id}`} value={motif} onChange={(ev) => setMotif(ev.target.value)} rows={2} maxLength={500} />
          <Bouton variante="danger" raisonDesactive={raison} enCours={enCours} onClick={() => void lancer()}>
            Révoquer la preuve
          </Bouton>
        </div>
      ) : null}
      {resultat ? (
        <p className="atl-succes" role="status">
          {resultat}
        </p>
      ) : null}
      {erreur ? <EtatErreur erreur={erreur} contexte="révocation refusée" /> : null}
      <p className="atl-sous">Diffusion {idCourt(f.id)}</p>
    </li>
  );
}
