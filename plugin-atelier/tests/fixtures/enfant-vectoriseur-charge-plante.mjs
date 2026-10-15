// Faux sous-processus qui meurt pendant le chargement du modèle.
process.on("message", () => process.exit(7));
