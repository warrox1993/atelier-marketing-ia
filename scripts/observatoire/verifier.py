# Contrôle des sujets du département contre les sujets bruts. Lancer : python3 -I verifier.py --sources <dossier des NN-*.json bruts>
import argparse, json, glob, os, re, sys
ICI = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sujets")
_p = argparse.ArgumentParser(description="Contrôle les sujets du département Observatoire")
_p.add_argument("--sources", required=True, help="dossier des sujets bruts NN-*.json")
SUJETS = _p.parse_args().sources
CADRATIN, MOT = chr(0x2014), "R" + "GF"
err, nf = [], 0
fichiers = sorted(glob.glob(os.path.join(ICI, "[0-9][0-9]-*.json")))
for p in fichiers:
    nom = os.path.basename(p)
    brut = open(p, encoding="utf-8").read()
    try:
        d = json.loads(brut)
    except ValueError as e:
        err.append(f"{nom} : JSON invalide ({e})"); continue
    src = json.load(open(os.path.join(SUJETS, nom), encoding="utf-8"))
    faits = {(x["source_url"], x["extrait_exact"]): x for x in src["faits"]}
    urls = {x["url"] for x in src["sources"]}
    if len(d["brief"]["faits"]) != len(src["faits"]): err.append(f"{nom} : nombre de faits différent")
    for f in d["brief"]["faits"]:
        nf += 1
        o = faits.get((f["source_url"], f["extrait_exact"]))
        if not o: err.append(f"{nom} : extrait absent du sujet source : {f['extrait_exact'][:50]}"); continue
        if o["statut_propose"] != f["statut_propose"] or o["texte"] != f["texte"]: err.append(f"{nom} : fait modifié")
    if d["brief"]["points_ouverts"] != src["questions_ouvertes"]: err.append(f"{nom} : points ouverts différents")
    if not 4 <= len(d["brief"]["plan"]) <= 6: err.append(f"{nom} : plan hors 4 à 6 parties")
    pr = d["projet"]
    if pr is None:
        if not d.get("motifSansProjet"): err.append(f"{nom} : projet nul sans motif")
    else:
        if pr["companyId"] != "<OBS>" or not pr["alias"]: err.append(f"{nom} : projet incomplet")
        if not re.match(r"^[a-z0-9][a-z0-9-]{0,63}$", pr["slug"]): err.append(f"{nom} : slug invalide")
        for a in pr["alias"]:
            if a["type"] not in ("github", "npm", "pypi", "site"): err.append(f"{nom} : type d'alias {a['type']}")
    for t in (brut,):
        if CADRATIN in t: err.append(f"{nom} : tiret cadratin")
        if MOT.lower() in t.lower(): err.append(f"{nom} : mot interdit")
lm = open(os.path.join(ICI, "LISEZ-MOI.md"), encoding="utf-8").read()
if CADRATIN in lm or MOT.lower() in lm.lower(): err.append("LISEZ-MOI.md : tiret cadratin ou mot interdit")
if len(fichiers) != 10: err.append(f"{len(fichiers)} fichiers au lieu de 10")
print(f"fichiers : {len(fichiers)} ; faits contrôlés : {nf}")
for e in err: print("ERREUR", e)
print("VÉRIFICATION :", "RÉUSSIE" if not err else f"ÉCHEC ({len(err)} erreurs)")
sys.exit(1 if err else 0)
