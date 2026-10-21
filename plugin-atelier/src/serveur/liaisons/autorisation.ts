/**
 * Garde commune du facteur : les règles qui ont autorisé une demande valent-elles toujours ? (déclarations et matrice
 * relues en base). Partagée par la transmission et par le relais des comptes rendus d'étape.
 */
import type { LiaisonStockee, StockLiaisons } from "./base-liaisons.js";

export async function toujoursAutorisee(l: LiaisonStockee, s: Pick<StockLiaisons, "serviceDeEntreprise" | "lireFlux">): Promise<boolean> {
  if (l.entrepriseCible === null) return false;
  const [source, cible] = await Promise.all([s.serviceDeEntreprise(l.entrepriseSource), s.serviceDeEntreprise(l.entrepriseCible)]);
  if (!source || !cible) return false;
  if (source.clientMarqueur !== cible.clientMarqueur || source.serviceSlug !== l.serviceSource || cible.serviceSlug !== l.serviceCible) return false;
  if (l.entrepriseSource.toLowerCase() === l.entrepriseCible.toLowerCase()) return false;
  return (await s.lireFlux(source.clientMarqueur, source.serviceSlug, cible.serviceSlug)) !== null;
}
