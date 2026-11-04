/**
 * « À traiter » d'un service, en tête de sa vue dans l'organigramme : les cartes en attente de ce service (lecture
 * partagée `useCartesServices`, aucune lecture en plus) puis ses tâches bloquées (`GET /companies/<id>/issues`, une
 * lecture à l'ouverture), chacune avec le lien vers sa tâche. La pastille « À traiter » du tableau des départements
 * mène ici : sans cette liste, la décision attendue restait introuvable. Rien n'est affiché s'il n'y a rien à traiter
 * ou si la lecture échoue (la vue du service reste utilisable).
 */
import { useEffect, useState } from "react";
import { useHostContext } from "@paperclipai/plugin-sdk/ui";
import type { CarteService } from "../contrats/carte-decision.js";
import { useCartesServices, useDirectionId } from "./cartes-services.js";
import { LienHote } from "./composants.js";
import { appelHote } from "./hote.js";

/** Tâches bloquées lues pour un service : au-delà, le lien « Ouvrir le service » du tableau mène au reste. */
export const BLOQUEES_LUES = 20;

export interface ElementATraiter {
  cle: string;
  titre: string;
  detail: string;
  lien: string;
}

/** Cartes du service d'abord, puis ses tâches bloquées qui ne portent pas déjà une carte affichée. */
export function elementsATraiter(bloqueesBrutes: unknown, cartes: readonly CarteService[], companyId: string, prefixe: string): ElementATraiter[] {
  const duService = cartes.filter((c) => c.companyId.toLowerCase() === companyId.toLowerCase());
  const avecCarte = new Set(duService.map((c) => c.element.issueId).filter((x): x is string => !!x));
  const elements: ElementATraiter[] = duService.map((c) => ({ cle: `carte:${c.element.id}`, titre: c.element.titre, detail: `Décision attendue · ${c.tache}`, lien: c.element.lien }));
  const brutes = Array.isArray(bloqueesBrutes) ? bloqueesBrutes : ((bloqueesBrutes as { items?: unknown[] } | null)?.items ?? []);
  for (const b of brutes) {
    const o = (b ?? {}) as Record<string, unknown>;
    const id = typeof o["id"] === "string" ? o["id"] : null;
    const titre = typeof o["title"] === "string" ? o["title"] : null;
    if (!id || !titre || o["status"] !== "blocked" || o["companyId"] !== companyId || avecCarte.has(id)) continue;
    const ref = typeof o["identifier"] === "string" && o["identifier"] ? o["identifier"] : id;
    elements.push({ cle: `bloquee:${id}`, titre, detail: `Bloquée · ${ref}`, lien: `/${prefixe}/issues/${ref}` });
  }
  return elements;
}

export function ATraiterService({ companyId, prefixe }: { companyId: string; prefixe: string }) {
  const contexte = useHostContext();
  const { cartes } = useCartesServices(useDirectionId(contexte.companyId));
  const [bloquees, setBloquees] = useState<unknown>([]);
  useEffect(() => {
    let annule = false;
    setBloquees([]);
    appelHote<unknown>("GET", `/companies/${encodeURIComponent(companyId)}/issues?status=blocked&limit=${BLOQUEES_LUES}`).then(
      (r) => !annule && setBloquees(r),
      () => undefined,
    );
    return () => {
      annule = true;
    };
  }, [companyId]);
  const elements = elementsATraiter(bloquees, cartes, companyId, prefixe);
  if (elements.length === 0) return null;
  return (
    <section className="atl-orgs-traiter" aria-labelledby="atl-orgs-traiter-titre">
      <h3 id="atl-orgs-traiter-titre" className="atl-orgs-sous-titre">
        À traiter
      </h3>
      <ul className="atl-orgs-traiter-liste">
        {elements.map((e) => (
          <li key={e.cle}>
            <LienHote vers={e.lien}>{e.titre}</LienHote>
            <span className="atl-orgs-traiter-detail">{e.detail}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
