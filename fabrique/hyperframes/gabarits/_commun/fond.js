(function () {
  // Zoom lent de l'illustration de fond, sur toute la durée de la scène, sur la timeline de la scène (rendue image par
  // image par le moteur) : data-sens 1 = avance, -1 = recule. Chargé après scene.js, qui a posé la timeline « main ».
  const fond = document.getElementById("fond");
  const tl = window.__timelines && window.__timelines["main"];
  if (!fond || !tl) return;
  const duree = Number(document.getElementById("root").dataset.duration);
  const avance = Number(fond.dataset.sens) > 0;
  tl.fromTo(fond, { scale: avance ? 1 : 1.08 }, { scale: avance ? 1.08 : 1, duration: duree, ease: "none", transformOrigin: "50% 50%" }, 0);
  tl.seek(0);
})();
