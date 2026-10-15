// Faux sous-processus de vectorisation pour les tests : même protocole de messages que
// src/connaissances/processus-vectoriseur.ts, sans modèle. Vecteur déterministe de dimension 1024 :
// composante 0 = 1, composante 1 = taille du lot (pour vérifier le découpage), composante 2 = longueur du texte,
// le tout normalisé. Textes spéciaux : « PLANTAGE » fait mourir le processus, « BLOQUE » ne répond jamais.
process.on("disconnect", () => process.exit(0));
process.on("message", (m) => {
  if (m.type === "charger") return process.send({ type: "pret", id: m.id });
  if (m.type === "arreter") return process.exit(0);
  if (m.type !== "vectoriser") return;
  if (m.textes.includes("PLANTAGE")) process.exit(42);
  if (m.textes.includes("BLOQUE")) return;
  const vecteurs = m.textes.map((t) => {
    const v = new Float32Array(1024);
    v[0] = 1;
    v[1] = m.textes.length;
    v[2] = t.length;
    const norme = Math.hypot(1, m.textes.length, t.length);
    for (let i = 0; i < 3; i += 1) v[i] /= norme;
    return Buffer.from(v.buffer).toString("base64");
  });
  process.send({ type: "resultat", id: m.id, vecteurs });
});
