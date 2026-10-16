// Faux sous-processus de vectorisation (même protocole que enfant-vectoriseur-factice.mjs) qui dit
// s'il voit une variable d'environnement secrète du parent : composante 0 = 1 si
// ATELIER_SECRET_DE_TEST est visible, sinon composante 1 = 1. Composante 2 = 1 si PATH est visible.
process.on("disconnect", () => process.exit(0));
process.on("message", (m) => {
  if (m.type === "charger") return process.send({ type: "pret", id: m.id });
  if (m.type === "arreter") return process.exit(0);
  if (m.type !== "vectoriser") return;
  const vecteurs = m.textes.map(() => {
    const v = new Float32Array(1024);
    v[process.env.ATELIER_SECRET_DE_TEST === undefined ? 1 : 0] = 1;
    if (process.env.PATH) v[2] = 1;
    const norme = Math.hypot(...v.slice(0, 3));
    for (let i = 0; i < 3; i += 1) v[i] /= norme;
    return Buffer.from(v.buffer).toString("base64");
  });
  process.send({ type: "resultat", id: m.id, vecteurs });
});
