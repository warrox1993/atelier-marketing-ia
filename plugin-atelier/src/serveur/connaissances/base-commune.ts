/**
 * Base commune du groupe (décision de l'opérateur du 18/10/2026) : chaque agent consulte la base de connaissances de SON
 * service et celle de la Direction du même client, jamais celle d'un autre service.
 *
 * Résolution côté serveur seulement, depuis la déclaration des services (`services_entreprises`, migration 012) :
 * entreprise de la tâche → client → entreprise marquée Direction de ce client. Aucune donnée de l'agent n'entre
 * dans ce calcul.
 *
 * Lecture : les passages de la Direction sont dans les tables du plugin et lus par `ctx.db.query`, dont les
 * paramètres (`{ sql, params }`) ne portent aucun `companyId` : la garde de portée d'invocation de l'hôte
 * (`requireInvocationCompanyScope`, paperclip/packages/plugins/sdk/src/host-client-factory.ts) ne s'y applique pas.
 * Aucune API hôte n'est appelée pour l'entreprise Direction (ni configuration, ni secret, ni tâche).
 */
import type { StockLiaisons } from "../liaisons/base-liaisons.js";

/**
 * Entreprise Direction du client de `companyId`, ou null (une seule base) si l'entreprise n'est déclarée dans
 * aucun client, si elle est elle-même la Direction, ou si le client n'a pas exactement une Direction (déclaration
 * ambiguë : on ne devine pas).
 */
export async function directionDuClient(
  stock: Pick<StockLiaisons, "serviceDeEntreprise" | "servicesDuClient">,
  companyId: string,
): Promise<string | null> {
  const service = await stock.serviceDeEntreprise(companyId);
  if (!service || service.estDirection) return null;
  const directions = (await stock.servicesDuClient(service.clientMarqueur)).filter(
    (s) => s.clientMarqueur === service.clientMarqueur && s.estDirection,
  );
  if (directions.length !== 1) return null;
  const direction = directions[0]!.companyId.toLowerCase();
  return direction === companyId.toLowerCase() ? null : direction;
}

/**
 * Entreprises du même client que `companyId` (elle comprise), en minuscules ; non déclarée : elle seule.
 * Sert à l'effacement d'une personne (M3, revue du 18/10/2026) : les extraits de passages copiés dans les sources des
 * tâches de chaque service.
 */
export async function entreprisesDuClient(
  stock: Pick<StockLiaisons, "serviceDeEntreprise" | "servicesDuClient">,
  companyId: string,
): Promise<string[]> {
  const soi = companyId.toLowerCase();
  const service = await stock.serviceDeEntreprise(companyId);
  if (!service) return [soi];
  const ids = (await stock.servicesDuClient(service.clientMarqueur))
    .filter((s) => s.clientMarqueur === service.clientMarqueur)
    .map((s) => s.companyId.toLowerCase());
  return [...new Set([soi, ...ids])];
}

/**
 * Entreprises qui lisent la base de `companyId` comme base commune : les autres services du client quand `companyId`
 * en est l'unique Direction (même règle que `directionDuClient`) ; sinon aucune. Sert à périmer leurs évaluations
 * quand un document de la Direction change (m1, revue du 18/10/2026).
 */
export async function lecteursBaseCommune(
  stock: Pick<StockLiaisons, "serviceDeEntreprise" | "servicesDuClient">,
  companyId: string,
): Promise<string[]> {
  const service = await stock.serviceDeEntreprise(companyId);
  if (!service || !service.estDirection) return [];
  const membres = (await stock.servicesDuClient(service.clientMarqueur)).filter((s) => s.clientMarqueur === service.clientMarqueur);
  if (membres.filter((s) => s.estDirection).length !== 1) return [];
  const soi = companyId.toLowerCase();
  return [...new Set(membres.map((s) => s.companyId.toLowerCase()).filter((c) => c !== soi))];
}
