// Annotations communes des outils Google (partagées par les simulateurs et les fournisseurs réels).

import type { AnnotationsOutil } from "../../fournisseurs.js";

/** Tous les outils Google sont en lecture seule, comme les vraies API de reporting. */
export const ANNOTATIONS_LECTURE: AnnotationsOutil = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};
