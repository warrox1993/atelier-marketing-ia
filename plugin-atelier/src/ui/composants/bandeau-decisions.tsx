/**
 * Décisions humaines qui attendent dans les services : bandeau discret et PERSISTANT en haut de toute page de l'atelier
 * (il reste tant qu'une carte attend, il ne disparaît pas tout seul), veille silencieuse de l'entrée du menu et titre de
 * l'onglet. Tous partagent la lecture de `cartes-services.ts` (une seule, relue toutes les 15 s).
 */
import { useEffect, useState } from "react";
import { LienHote } from "../composants.js";
import { CLE_NOTIFICATIONS, phraseDecisions, useCartesServices, useDirectionId } from "../cartes-services.js";
import { chemin } from "../route.js";

/** « Le service Marketing attend votre accord. Ouvrir dans le chat » ; rien tant qu'aucune carte n'attend. */
export function BandeauDecisions({ companyId }: { companyId: string | null | undefined }) {
  const { cartes } = useCartesServices(useDirectionId(companyId));
  if (cartes.length === 0) return null;
  return (
    <aside className="atl-decisions" aria-label="Décisions en attente" data-testid="bandeau-decisions">
      <p className="atl-decisions-texte">{phraseDecisions(cartes)}</p>
      <LienHote vers={chemin("discussion")} className="atl-decisions-lien">
        Ouvrir dans le chat
      </LienHote>
    </aside>
  );
}

/** Garde la lecture partagée active (et publie le nombre pour le menu du socle) sans rien afficher. */
export function VeilleDecisions({ companyId }: { companyId: string | null | undefined }) {
  useCartesServices(useDirectionId(companyId));
  return null;
}

type Permission = "indisponible" | NotificationPermission;
const permissionNavigateur = (): Permission => (typeof Notification === "undefined" ? "indisponible" : Notification.permission);
const preferenceActive = (): boolean => {
  try {
    return window.localStorage.getItem(CLE_NOTIFICATIONS) === "1";
  } catch {
    return false;
  }
};

/**
 * Réglage « Me prévenir » (réglages du chat) : la permission n'est JAMAIS demandée au chargement, seulement au clic.
 * Une fois accordée, la case active ou coupe les notifications du navigateur pour les nouvelles décisions.
 */
export function ReglageNotifications() {
  const [permission, setPermission] = useState<Permission>(permissionNavigateur);
  const [active, setActive] = useState(preferenceActive);
  useEffect(() => setPermission(permissionNavigateur()), []);
  const ecrire = (v: boolean) => {
    setActive(v);
    try {
      window.localStorage.setItem(CLE_NOTIFICATIONS, v ? "1" : "0");
    } catch {
      // Stockage indisponible : le réglage vaut pour cette page seulement.
    }
  };
  if (permission === "indisponible") return <p className="atl-disc-reglages-aide">Ce navigateur ne propose pas les notifications.</p>;
  if (permission === "denied") return <p className="atl-disc-reglages-aide">Les notifications sont bloquées pour ce site : autorisez-les dans les réglages du navigateur pour être prévenu.</p>;
  if (permission === "granted")
    return (
      <label className="atl-disc-reglages-ligne">
        <input type="checkbox" className="atl-case-tactile" checked={active} onChange={(e) => ecrire(e.target.checked)} />
        <span>Me prévenir dans le navigateur quand une décision m'attend</span>
      </label>
    );
  return (
    <div className="atl-disc-reglages-ligne">
      <button
        type="button"
        className="atl-bouton"
        onClick={() => {
          void Notification.requestPermission().then((p) => {
            setPermission(p);
            if (p === "granted") ecrire(true);
          });
        }}
      >
        Me prévenir
      </button>
      <span className="atl-disc-reglages-aide">Une notification du navigateur quand une décision vous attend dans un service.</span>
    </div>
  );
}
