(function () {
  const tl = gsap.timeline({ paused: true });
  tl.fromTo("#chiffre", { opacity: 0, scale: 0.94 }, { opacity: 1, scale: 1, duration: 0.8, ease: "power3.out", transformOrigin: "0% 50%" }, 0.2);
  tl.fromTo("#titre", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, 0.7);
  tl.fromTo("#sous-titre", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, 1.0);
  window.__timelines = window.__timelines || {};
  window.__timelines["main"] = tl;
  tl.seek(0);
})();
