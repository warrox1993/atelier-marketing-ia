/**
 * Pont SDK simulé pour les tests jsdom de l'interface (même méthode que
 * paperclip/packages/plugins/plugin-llm-wiki/tests) : les hooks de l'hôte sont
 * remplacés par des fonctions qui servent les données d'exemple du contrat
 * (EXEMPLES_DONNEES, validées par tests/contrats.spec.ts).
 */
import { createElement, act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EXEMPLES_DONNEES } from "../../src/contrats/exemples/index.js";
import { ACTIONS_UI, DONNEES_UI } from "../../src/contrats/ui.js";

export const ENTREPRISE = "11111111-1111-4111-8111-111111111111";

type Reponse = { data: unknown; loading: boolean; error: { code: string; message: string } | null };

export interface Pont {
  chemin: string;
  appelsDonnees: Array<{ cle: string; params?: Record<string, unknown> }>;
  appelsActions: Array<{ cle: string; params?: Record<string, unknown> }>;
  navigations: string[];
  /** Surcharge par clé de données : réponse fixe. */
  donnees: Record<string, Reponse>;
  /** Résultat ou erreur par clé d'action. */
  actions: Record<string, (params?: Record<string, unknown>) => Promise<unknown>>;
  rafraichissements: number;
  /** Paramètres refusés par les schémas Zod du contrat (doit rester vide). */
  violations: string[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

export function installerPont(chemin = "/RNO/atelier/equipe"): Pont {
  const pont: Pont = { chemin, appelsDonnees: [], appelsActions: [], navigations: [], donnees: {}, actions: {}, rafraichissements: 0, violations: [] };
  const exemples = EXEMPLES_DONNEES as Record<string, unknown>;
  (globalThis as unknown as { __paperclipPluginBridge__: unknown }).__paperclipPluginBridge__ = {
    sdkUi: {
      usePluginData: (cle: string, params?: Record<string, unknown>) => {
        pont.appelsDonnees.push({ cle, params });
        // Même contrôle que le worker : schéma strict du contrat, sans companyId (ajouté par l'hôte).
        const schema = DONNEES_UI[cle as keyof typeof DONNEES_UI]?.params;
        if (!schema) pont.violations.push(`clé de données inconnue : ${cle}`);
        else if (!schema.safeParse(params ?? {}).success) pont.violations.push(`paramètres refusés pour ${cle} : ${JSON.stringify(params)}`);
        const fixe = pont.donnees[cle];
        const refresh = () => {
          pont.rafraichissements += 1;
        };
        if (fixe) return { ...fixe, refresh };
        if (cle === "atelier.journal") return { data: { evenements: [], dernierSeq: 0, complet: true }, loading: false, error: null, refresh };
        return { data: exemples[cle] ?? null, loading: false, error: null, refresh };
      },
      usePluginAction: (cle: string) => async (params?: Record<string, unknown>) => {
        pont.appelsActions.push({ cle, params });
        const schema = ACTIONS_UI[cle as keyof typeof ACTIONS_UI]?.params;
        const analyse = schema?.safeParse(params ?? {});
        if (!analyse?.success) {
          pont.violations.push(`paramètres refusés pour ${cle} : ${JSON.stringify(params)}`);
          throw { code: "WORKER_ERROR", message: `[entree_invalide] Paramètres invalides pour ${cle}` };
        }
        const f = pont.actions[cle];
        return f ? f(params) : {};
      },
      useHostContext: () => ({ companyId: ENTREPRISE, companyPrefix: "RNO", projectId: null, entityId: null, entityType: null, userId: "local-board" }),
      useHostLocation: () => ({ pathname: pont.chemin, search: "", hash: "" }),
      useHostNavigation: () => ({
        resolveHref: (to: string) => `/RNO${to}`,
        navigate: (to: string) => {
          pont.navigations.push(to);
        },
        linkProps: (to: string) => ({
          href: `/RNO${to}`,
          onClick: (e: { preventDefault(): void }) => {
            e.preventDefault();
            pont.navigations.push(to);
          },
        }),
      }),
      usePluginToast: () => () => null,
      IssuesList: (p: { filters?: Record<string, unknown> }) => createElement("div", { "data-natif": "IssuesList", "data-filtres": JSON.stringify(p.filters ?? {}) }),
      MarkdownBlock: (p: { content: string }) => createElement("div", { "data-natif": "MarkdownBlock" }, p.content),
    },
  };
  return pont;
}

export interface Rendu {
  conteneur: HTMLDivElement;
  racine: Root;
  demonter(): void;
}

export async function rendre(element: ReactElement): Promise<Rendu> {
  const conteneur = document.createElement("div");
  document.body.appendChild(conteneur);
  const racine = createRoot(conteneur);
  await act(async () => {
    racine.render(element);
  });
  return {
    conteneur,
    racine,
    demonter: () => {
      act(() => racine.unmount());
      conteneur.remove();
    },
  };
}

/** Saisit une valeur dans un champ contrôlé React. */
export async function saisir(champ: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, valeur: string) {
  const proto = champ instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : champ instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  await act(async () => {
    setter?.call(champ, valeur);
    champ.dispatchEvent(new Event(champ instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}

export async function cliquer(el: Element) {
  await act(async () => {
    (el as HTMLElement).click();
  });
}

export function parTexte(racine: ParentNode, selecteur: string, texte: string | RegExp): HTMLElement {
  const trouve = Array.from(racine.querySelectorAll<HTMLElement>(selecteur)).find((e) => (typeof texte === "string" ? e.textContent?.includes(texte) : texte.test(e.textContent ?? "")));
  if (!trouve) throw new Error(`Introuvable : ${selecteur} « ${String(texte)} »`);
  return trouve;
}

export function champParLibelle(racine: ParentNode, libelle: string): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  const label = Array.from(racine.querySelectorAll("label[for]")).find((l) => l.textContent?.trim() === libelle);
  const champ = label ? racine.querySelector(`#${CSS.escape(label.getAttribute("for") ?? "")}`) : null;
  if (!champ) throw new Error(`Champ introuvable : ${libelle}`);
  return champ as HTMLInputElement;
}

/** Bouton radio d'un fieldset, trouvé par le texte de son libellé. */
export function radio(racine: ParentNode, libelle: string): HTMLInputElement {
  const label = Array.from(racine.querySelectorAll("label")).find((l) => l.textContent?.includes(libelle) && l.querySelector('input[type="radio"]'));
  const champ = label?.querySelector<HTMLInputElement>('input[type="radio"]');
  if (!champ) throw new Error(`Bouton radio introuvable : ${libelle}`);
  return champ;
}
