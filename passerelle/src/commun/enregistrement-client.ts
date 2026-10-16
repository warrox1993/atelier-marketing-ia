// Enregistrement dynamique de client (RFC 7591) : schéma et règle des adresses de retour, partagés par le serveur
// d'autorisation local (oauth-local.ts) et la garde commune (garde-oauth.ts).

import * as z from "zod";

const HOTES_BOUCLE = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** https partout ; http seulement vers la boucle locale ; ni fragment ni identifiants dans l'URL. */
export function uriRedirectionAcceptable(valeur: string): boolean {
  let url: URL;
  try {
    url = new URL(valeur);
  } catch {
    return false;
  }
  if (url.hash || url.username || url.password) return false;
  if (url.protocol === "https:") return true;
  return url.protocol === "http:" && HOTES_BOUCLE.has(url.hostname);
}

export const schemaEnregistrementClient = z.object({
  redirect_uris: z
    .array(z.string().max(2048).refine(uriRedirectionAcceptable, "URI de redirection refusée"))
    .min(1)
    .max(5),
  client_name: z.string().max(200).optional(),
  grant_types: z.array(z.enum(["authorization_code", "refresh_token"])).min(1).optional(),
  response_types: z.array(z.literal("code")).min(1).optional(),
  token_endpoint_auth_method: z.literal("none").optional(),
  application_type: z.enum(["web", "native"]).optional(),
  scope: z.string().max(500).optional(),
});
