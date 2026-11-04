/** Garde du module Observatoire : réservé à l'entreprise dont le service est « observatoire » (FR-035). */
import { erreur } from "../erreurs.js";
import type { StockLiaisons } from "../liaisons/base-liaisons.js";

export const SERVICE_OBSERVATOIRE = "observatoire";

export async function exigerObservatoire(
  stock: Pick<StockLiaisons, "serviceDeEntreprise">,
  companyId: string | undefined,
): Promise<string> {
  const service = companyId ? await stock.serviceDeEntreprise(companyId) : null;
  if (!companyId || service?.serviceSlug !== SERVICE_OBSERVATOIRE) {
    return erreur("acces_refuse", "module Observatoire désactivé pour cette entreprise");
  }
  return companyId;
}
