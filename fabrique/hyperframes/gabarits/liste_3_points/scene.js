(function () {
  const tl = gsap.timeline({ paused: true });
  tl.fromTo("#titre", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, 0.2);
  tl.fromTo(".point", { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.5, ease: "power3.out", stagger: 0.45 }, 0.7);
  window.__timelines = window.__timelines || {};
  window.__timelines["main"] = tl;
  tl.seek(0);
})();
