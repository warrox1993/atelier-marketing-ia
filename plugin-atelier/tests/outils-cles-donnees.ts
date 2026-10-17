/**
 * Clés des données personnelles servies par un coffre de test (faille E1 : le serveur n'a plus aucune clé
 * dérivée ni de repli ; sans ces deux secrets, il refuse). Valeurs fixes : propres aux tests, jamais en service.
 */
type Ligne = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const REFS_CLES = { donneesCleChiffrement: { type: "secret_ref", secretId: "a" }, donneesCleHmac: { type: "secret_ref", secretId: "b" } };
export const CLES_TEST = { chiffrement: Buffer.alloc(32, 1), hmac: Buffer.alloc(32, 2) };

/** Fait servir les deux clés par `ctx.secrets.resolve`, les autres secrets restant résolus comme avant. */
export function avecClesDonnees<T>(ctx: T): T {
  const c = ctx as Ligne;
  const avant = c.secrets?.resolve as ((r: unknown, o: unknown) => Promise<string>) | undefined;
  c.secrets = {
    resolve: async (r: unknown, o: { configPath?: string }) => {
      if (o?.configPath === "donneesCleChiffrement") return CLES_TEST.chiffrement.toString("base64");
      if (o?.configPath === "donneesCleHmac") return CLES_TEST.hmac.toString("hex");
      if (!avant) throw new Error("secret introuvable");
      return avant(r, o);
    },
  };
  return ctx;
}
