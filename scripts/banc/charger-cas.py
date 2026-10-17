#!/usr/bin/env python3
"""Charge les cas d'essai des études docs/etude-usine-v2 dans Phoenix : un jeu de données par département.

Jeu « banc-<département> », un exemple par cas : entrée (le cas), sortie (sortie attendue et critères),
métadonnées (clé g<groupe>-<section>.3.<n>, provenance fichier:ligne, empreinte du contenu). Les pièces fictives d'un
cas (tests/banc/pieces/<département>/<clé>/) sont jointes à l'entrée, leurs critères chiffrés à la sortie. Idempotent : chaque
exemple porte un identifiant stable (sa clé) ; un jeu inchangé n'est pas renvoyé, un jeu modifié est mis à jour
(action « update » de l'API, qui ne crée une version que s'il y a une différence).

Usage :
    python3 -I scripts/banc/charger-cas.py [--a-blanc] [--departement SLUG] [--phoenix URL]
Code de sortie : 0 succès, 1 erreur, 3 nom interdit trouvé dans un cas (rien n'est envoyé).
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import banc_commun as bc  # noqa: E402

NOMS_INTERDITS = os.path.join(bc.DOSSIER_BANC, "noms-interdits.txt")


def lire_interdits(chemin: str) -> list[str]:
    """Liste locale (hors dépôt) de noms de clients réels qui ne doivent jamais entrer dans un jeu d'essai."""
    if not os.path.exists(chemin):
        return []
    with open(chemin, encoding="utf-8") as f:
        return [l.strip() for l in f if l.strip() and not l.startswith("#")]


def construire_jeux(cas: list[dict]) -> dict[str, dict]:
    jeux: dict[str, dict] = {}
    for c in cas:
        nom = bc.PREFIXE_JEU + c["departement"]
        j = jeux.setdefault(nom, {"departement": c["departement"], "departement_nom": c["departement_nom"],
                                  "groupe": c["groupe"], "entrees": [], "sorties": [], "metas": [], "ids": []})
        entree = {"titre": c["titre"], "entree": c["entree"]}
        sortie = {"sortie_attendue": c["sortie_attendue"], "criteres": c["criteres"]}
        if c.get("pieces"):
            # Pièces fictives du cas (tests/banc/pieces) : injectées dans l'entrée, critères chiffrés dans la sortie.
            entree["pieces"] = {p["nom"]: p["contenu"] for p in c["pieces"]}
            entree["entree_complete"] = bc.texte_entree(c)
        if c.get("criteres_code"):
            sortie["criteres_code"] = c["criteres_code"]
        contenu = json.dumps([entree, sortie], ensure_ascii=False, sort_keys=True)
        j["entrees"].append(entree)
        j["sorties"].append(sortie)
        j["metas"].append({"cle": c["cle"], "groupe": c["groupe"], "departement": c["departement"],
                           "numero": c["numero"], "source": c["source"], "empreinte": bc.empreinte(contenu)[:16]})
        j["ids"].append(c["cle"])
    return jeux


def deja_a_jour(phoenix: bc.Phoenix, jeu_id: str, j: dict) -> bool:
    ex = phoenix.exemples(jeu_id)["examples"]
    existants = {e["metadata"].get("cle"): e["metadata"].get("empreinte") for e in ex}
    attendus = {m["cle"]: m["empreinte"] for m in j["metas"]}
    return existants == attendus


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--a-blanc", action="store_true", help="n'envoie rien, affiche ce qui serait chargé")
    ap.add_argument("--departement", help="un seul département (slug)")
    ap.add_argument("--phoenix", default=bc.PHOENIX_URL)
    ap.add_argument("--racine", default=bc.RACINE, help=argparse.SUPPRESS)
    ap.add_argument("--interdits", default=NOMS_INTERDITS, help=argparse.SUPPRESS)
    a = ap.parse_args(argv)
    try:
        cas = bc.tous_les_cas(a.racine)
        inconnus = sorted({c["departement"] for c in cas} - bc.departements_valides(a.racine))
        if inconnus:
            raise bc.ErreurBanc(f"département(s) sans dossier dans organisation/services : {inconnus}")
        interdits = lire_interdits(a.interdits)
        for c in cas:
            texte = bc.normaliser(json.dumps(c, ensure_ascii=False))
            for n in interdits:
                if bc.contient(texte, n):
                    print(f"nom interdit dans le cas {c['cle']} ({c['source']}) : rien n'est envoyé", file=sys.stderr)
                    return 3
        if a.departement:
            cas = [c for c in cas if c["departement"] == a.departement]
            if not cas:
                raise bc.ErreurBanc(f"aucun cas pour le département {a.departement}")
        jeux = construire_jeux(cas)
        phoenix = None if a.a_blanc else bc.Phoenix(a.phoenix)
        bilan = {"cas": len(cas), "jeux": len(jeux), "crees": 0, "mis_a_jour": 0, "inchanges": 0}
        for nom, j in sorted(jeux.items()):
            if a.a_blanc:
                print(f"{nom} : {len(j['ids'])} cas ({', '.join(j['ids'])})")
                continue
            desc = (f"Banc d'essais, département {j['departement_nom']} (étude usine v2, groupe {j['groupe']}). "
                    "Cas fictifs : entrée, sortie attendue, critères.")
            existant = phoenix.jeu_par_nom(nom)
            if existant and deja_a_jour(phoenix, existant["id"], j):
                bilan["inchanges"] += 1
                print(f"{nom} : inchangé")
                continue
            action = "update" if existant else "create"
            r = phoenix.envoyer_jeu(action, nom, desc, j["entrees"], j["sorties"], j["metas"], j["ids"])
            bilan["crees" if action == "create" else "mis_a_jour"] += 1
            print(f"{nom} : {action} ({r.get('num_created_examples', 0)} créés, "
                  f"{r.get('num_updated_examples', 0)} modifiés, {r.get('num_deleted_examples', 0)} retirés)")
        print(json.dumps(bilan, ensure_ascii=False))
        return 0
    except bc.ErreurBanc as e:
        print(f"erreur : {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
