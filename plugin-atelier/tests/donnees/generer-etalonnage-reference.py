#!/usr/bin/env python3
"""Jeu de référence figé de l'étalonnage (lot P6).

Produit `etalonnage-reference.json`, lu par `tests/score-etalonnage.spec.ts`. Les tests TypeScript
n'appellent jamais Python : ce script a été lancé une fois, son résultat est commité.

Références :
- Platt : `sklearn.calibration._SigmoidCalibration` (celle qu'utilise
  `CalibratedClassifierCV(method="sigmoid")`), recoupée par la voie publique
  `CalibratedClassifierCV(FrozenEstimator(...), method="sigmoid", ensemble=False)` (un seul
  étalonneur ajusté sur toutes les données, le score figé n'apprenant rien) ;
- isotonique : `sklearn.isotonic.IsotonicRegression(out_of_bounds="clip")` ;
- Brier : `sklearn.metrics.brier_score_loss` ;
- Wilson : `statsmodels.stats.proportion.proportion_confint(method="wilson", alpha=0.05)`.

Usage : python3 -m venv v && v/bin/pip install scikit-learn statsmodels
        v/bin/python generer-etalonnage-reference.py
"""
import datetime as dt
import json
import pathlib

import numpy as np
import scipy
import sklearn
import statsmodels
from scipy.optimize import minimize
from sklearn.base import BaseEstimator, ClassifierMixin
from sklearn.calibration import CalibratedClassifierCV, _SigmoidCalibration
from sklearn.frozen import FrozenEstimator
from sklearn.isotonic import IsotonicRegression
from sklearn.metrics import brier_score_loss
from statsmodels.stats.proportion import proportion_confint

DEBUT = dt.date(2025, 1, 1)
NIVEAU = 0.95


class ScoreFige(ClassifierMixin, BaseEstimator):
    """Classifieur factice : sa fonction de décision est le score lui-même (colonne 0)."""

    def fit(self, X, y):
        self.classes_ = np.array([0, 1])
        return self

    def decision_function(self, X):
        return np.asarray(X, dtype=float)[:, 0]

    def predict(self, X):
        return (self.decision_function(X) > 50).astype(int)


def generer(graine, n, score_max, pente, origine, jours):
    rng = np.random.RandomState(graine)
    scores = rng.randint(0, score_max + 1, size=n)
    p = 1.0 / (1.0 + np.exp(-(pente * scores + origine)))
    y = (rng.uniform(size=n) < p).astype(int)
    decal = np.sort(rng.randint(0, jours, size=n))
    dates = [(DEBUT + dt.timedelta(days=int(d))).isoformat() for d in decal]
    return scores, y, dates


def platt(scores, y):
    cal = _SigmoidCalibration().fit(scores.astype(float), y)
    voie_publique = CalibratedClassifierCV(FrozenEstimator(ScoreFige().fit(None, None)), method="sigmoid", ensemble=False)
    voie_publique.fit(scores.reshape(-1, 1).astype(float), y)
    p_privee = cal.predict(np.arange(101, dtype=float))
    p_publique = voie_publique.predict_proba(np.arange(101, dtype=float).reshape(-1, 1))[:, 1]
    ecart = float(np.max(np.abs(p_privee - p_publique)))
    assert ecart < 1e-12, f"voies publique et privée divergent : {ecart}"
    return float(cal.a_), float(cal.b_), cal


def optimum_exact(scores, y):
    """Même objectif que scikit-learn (cibles de Platt, mise à l'échelle), résolu à la précision machine."""
    F = scores.astype(float)
    echelle = max(np.max(np.abs(F)), 1.0) if np.max(np.abs(F)) >= 30 else 1.0
    F = F / echelle
    n1 = float(np.sum(y > 0)); n0 = len(y) - n1
    T = np.where(y > 0, (n1 + 1) / (n1 + 2), 1 / (n0 + 2))

    def f(ab):
        z = ab[0] * F + ab[1]
        return float(np.sum(np.logaddexp(0, z) - (1 - T) * z))

    r = minimize(f, [0.0, np.log((n0 + 1) / (n1 + 1))], method="BFGS", options={"gtol": 1e-12})
    r = minimize(f, r.x, method="Nelder-Mead", options={"xatol": 1e-13, "fatol": 1e-15, "maxiter": 20000})
    return r.x[0] / echelle, r.x[1]


def wilson(k, n):
    bas, haut = proportion_confint(k, n, alpha=1 - NIVEAU, method="wilson")
    return float(bas), float(haut)


def tranches(scores, y, proba):
    sortie = []
    for i in range(10):
        lo, hi = i * 10, (100 if i == 9 else i * 10 + 9)
        m = (scores >= lo) & (scores <= hi)
        n = int(m.sum())
        if n == 0:
            continue
        k = int(y[m].sum())
        bas, haut = wilson(k, n)
        sortie.append({"scoreMin": lo, "scoreMax": hi, "effectif": n, "conversions": k,
                       "tauxObserve": k / n, "probabilitePredite": float(np.mean(proba[m])),
                       "borneBasse": bas, "borneHaute": haut})
    return sortie


def jeu(nom, graine, n, score_max, pente, origine, jours, coupure):
    s, y, dates = generer(graine, n, score_max, pente, origine, jours)
    ajust = np.array([d < coupure for d in dates])
    sa, ya, se, ye = s[ajust], y[ajust], s[~ajust], y[~ajust]
    a, b, cal = platt(sa, ya)
    ae, be = optimum_exact(sa, ya)
    p_eval = cal.predict(se.astype(float))
    grille = np.arange(101, dtype=float)
    sortie = {
        "nom": nom,
        "coupure": coupure,
        "observations": [{"score": int(si), "converti": bool(yi), "date": di} for si, yi, di in zip(s, y, dates)],
        "ajustement": {"effectif": int(len(sa)), "conversions": int(ya.sum())},
        "evaluation": {"effectif": int(len(se)), "conversions": int(ye.sum())},
        "platt": {
            "a": a, "b": b,
            "optimumExact": {"a": float(ae), "b": float(be)},
            "probabilitesGrille": [float(v) for v in cal.predict(grille)],
            "brierEvaluation": float(brier_score_loss(ye, p_eval)),
            "tranchesEvaluation": tranches(se, ye, p_eval),
        },
    }
    if len(sa) >= 1000:
        iso = IsotonicRegression(out_of_bounds="clip").fit(sa.astype(float), ya)
        pi_eval = iso.predict(se.astype(float))
        hors = np.array([-5.0, 0.0, 0.5, 33.3, 77.7, 100.0, 120.0])
        sortie["isotonique"] = {
            "probabilitesGrille": [float(v) for v in iso.predict(grille)],
            "pointsHorsGrille": [float(v) for v in hors],
            "probabilitesHorsGrille": [float(v) for v in iso.predict(hors)],
            "brierEvaluation": float(brier_score_loss(ye, pi_eval)),
            "tranchesEvaluation": tranches(se, ye, pi_eval),
        }
    return sortie


def main():
    cas_wilson = [(0, 10), (5, 10), (10, 10), (18, 100), (1, 3), (27, 150), (300, 1000), (30, 300), (0, 1), (1, 1)]
    ref = {
        "genereLe": "2026-10-15",
        "versions": {"scikit-learn": sklearn.__version__, "statsmodels": statsmodels.__version__,
                     "scipy": scipy.__version__, "numpy": np.__version__},
        "niveauConfiance": NIVEAU,
        "wilson": [{"conversions": k, "effectif": n, "borneBasse": wilson(k, n)[0], "borneHaute": wilson(k, n)[1]}
                   for k, n in cas_wilson],
        "jeux": [
            jeu("grand_echantillon", 20261015, 2600, 100, 0.045, -3.6, 640, "2026-01-01"),
            jeu("scores_bas_sans_mise_a_echelle", 7, 260, 29, 0.09, -2.7, 300, "2025-08-01"),
        ],
    }
    cible = pathlib.Path(__file__).with_name("etalonnage-reference.json")
    cible.write_text(json.dumps(ref, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    for j in ref["jeux"]:
        p = j["platt"]
        print(j["nom"], j["ajustement"], j["evaluation"], "a,b sklearn", p["a"], p["b"],
              "exact", p["optimumExact"], "écart", abs(p["a"] - p["optimumExact"]["a"]), abs(p["b"] - p["optimumExact"]["b"]))


if __name__ == "__main__":
    main()
