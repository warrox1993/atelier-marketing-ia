#!/usr/bin/env python3
"""Contrôle indépendant du test exact de Fisher du plugin (lot 2, issue #22).

Calcule la p-valeur bilatérale par la loi hypergéométrique exacte (entiers de math.comb, fractions exactes)
et la compare aux valeurs rendues par `fisherBilateral` de plugin-atelier/src/serveur/regles-experiences.ts
(reportées ci-dessous en constantes, relevées le 07/11/2026 sur le code compilé).
Lancement : python3 -I scripts/tests/tester-fisher.py ; code de sortie 0 si tout concorde, 1 sinon.
"""
from fractions import Fraction
from math import comb
import sys

# Valeurs rendues par le TypeScript : fisherBilateral(x1, n1, x2, n2).
VALEURS_TS = {
    "cas 1 : 0 contre 4 conversions sur 1 000": ((0, 1000, 4, 1000), 0.12462490634400825),
    "cas 2 : B 140 contre A 100 sur 1 000": ((100, 1000, 140, 1000), 0.007185428104075212),
    "cas 2 : C 141 contre A 100 sur 1 000": ((100, 1000, 141, 1000), 0.005917029457100713),
    "cas 2 : C 141 contre B 140 sur 1 000": ((140, 1000, 141, 1000), 1.0),
}
TOLERANCE_RELATIVE = 1e-12


def fisher_bilateral(x1: int, n1: int, x2: int, n2: int) -> float:
    """Somme exacte des probabilités des tables (marges fixées) aussi ou moins probables que l'observée."""
    total, succes = n1 + n2, x1 + x2
    poids = {k: comb(succes, k) * comb(total - succes, n1 - k) for k in range(max(0, n1 - (total - succes)), min(succes, n1) + 1)}
    observe = poids[x1]
    return float(Fraction(sum(p for p in poids.values() if p <= observe), comb(total, n1)))


def main() -> int:
    assert fisher_bilateral(5, 10, 5, 10) == 1.0  # tables symétriques : p = 1
    ecarts = 0
    for libelle, (table, valeur_ts) in VALEURS_TS.items():
        valeur_py = fisher_bilateral(*table)
        concorde = abs(valeur_py - valeur_ts) <= TOLERANCE_RELATIVE * max(abs(valeur_py), 1e-300)
        ecarts += not concorde
        print(f"{libelle} : Python {valeur_py!r}, TypeScript {valeur_ts!r} -> {'concorde' if concorde else 'ÉCART'}")
    print("Résultat :", "tout concorde" if ecarts == 0 else f"{ecarts} écart(s)")
    return 1 if ecarts else 0


if __name__ == "__main__":
    sys.exit(main())
