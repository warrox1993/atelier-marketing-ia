#!/usr/bin/env python3
"""Banc d'essais d'une compétence : exécute les cas de son département avec le modèle local, note, enregistre.

Pour chaque version de la compétence (A = le SKILL.md actuel, B = une variante facultative), chaque cas du
département est joué par le modèle local (Ollama, la compétence comme consigne système), puis noté critère par
critère : par code quand c'est sûr, sinon par le juge local. Chaque version devient une expérience Phoenix sur le
jeu « banc-<département> » (comparaison A / B dans l'interface). Résultat détaillé dans
~/.local/share/atelier-banc/resultats/ (hors dépôt).

Répétitions : chaque version est jouée N fois (--repetitions, défaut 3). Le score d'une version est la moyenne des
scores de ses répétitions, avec leur écart-type ; celui d'un cas est la moyenne de ses répétitions. Avec plusieurs
répétitions, la génération est échantillonnée (température 0,3, graine différente à chaque répétition, réglable par
--temperature) ; avec une seule, elle reste déterministe (température 0, graine 42).

Pièces : si un cas a des pièces fictives (tests/banc/pieces/<département>/<cas>/), elles sont injectées dans l'entrée
et leurs critères chiffrés (criteres.json) sont vérifiés par code en plus de ceux de l'étude.

Règle de décision : B n'est « retenue » que si sa moyenne dépasse celle de A de plus d'un écart-type combiné (racine
de la somme des carrés des deux écarts-types) ET sans recul de la moyenne sur aucun cas. Le banc ne modifie jamais
organisation/.

Option --juge-claude (désactivée par défaut, quota Max) : les deux meilleures versions sont comparées cas par cas
par `claude -p --output-format json` (is_error et subtype vérifiés), au plus --plafond-claude appels ; modèle Sonnet
par défaut, Opus seulement avec --modele-claude opus ; --a-blanc-claude montre les appels prévus sans les faire.

Usage :
    python3 -I scripts/banc/executer.py --competence relance-amiable-b2b-b2c [--departement recouvrement]
        [--version-b CHEMIN] [--repetitions 3] [--sans-phoenix] [--juge-claude --plafond-claude 3 [--a-blanc-claude]]
"""
import argparse
import json
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import banc_commun as bc  # noqa: E402


def domaine_de(chemin: str):
    with open(chemin, encoding="utf-8") as f:
        texte = f.read(4000)
    m = re.search(r"^\s*domaine:\s*\"?([a-z0-9-]+)\"?\s*$", texte, re.M)
    return m.group(1) if m else None


def jouer_version(ollama, etiquette: str, chemin: str, cas: list[dict], repetitions: int = 1,
                  temperature=None) -> dict:
    """Joue chaque cas `repetitions` fois. Rend la version avec, par cas, ses répétitions, sa moyenne et son
    écart-type ; pour la version, la moyenne et l'écart-type des scores des répétitions (une répétition = un
    passage sur tous les cas)."""
    consigne = bc.lire_competence(chemin)
    if temperature is None:
        temperature = 0.0 if repetitions == 1 else 0.3
    res = {"etiquette": etiquette, "chemin": os.path.abspath(chemin), "empreinte": bc.empreinte(consigne)[:12],
           "repetitions": repetitions, "temperature": temperature, "cas": []}
    t0 = time.monotonic()
    for c in cas:
        reps = []
        for r in range(repetitions):
            debut = bc.maintenant()
            t = time.monotonic()
            try:
                g = bc.executer_cas(ollama, consigne, c, temperature=temperature, graine=42 + r)
                sortie, erreur = g["texte"], None
                jetons = (g["jetons_entree"], g["jetons_sortie"])
            except bc.ErreurBanc as e:
                sortie, erreur, jetons = "", str(e), (0, 0)
            fin_gen = bc.maintenant()
            duree_gen = time.monotonic() - t
            note = bc.noter(ollama, c, sortie) if erreur is None else {"score": 0.0, "details": []}
            reps.append({"repetition": r + 1, "sortie": sortie, "erreur": erreur, "debut": debut, "fin": fin_gen,
                         "fin_notation": bc.maintenant(), "duree_generation_s": round(duree_gen, 1),
                         "jetons": jetons, **note})
        scores = [x["score"] for x in reps]
        # Critères agrégés : taux de réussite sur les répétitions ; « réussi » si au moins la moitié.
        details = []
        for k, d0 in enumerate(reps[0]["details"]):
            vus = [x["details"][k]["reussi"] for x in reps if len(x["details"]) > k]
            taux = sum(vus) / len(vus)
            details.append({"critere": d0["critere"], "reussi": taux >= 0.5, "taux": round(taux, 3),
                            "source": d0["source"], "explication": d0["explication"]})
        res["cas"].append({"cle": c["cle"], "titre": c["titre"], "sortie": reps[0]["sortie"],
                           "erreur": next((x["erreur"] for x in reps if x["erreur"]), None),
                           "score": bc.moyenne(scores), "ecart_type": round(bc.ecart_type(scores), 4),
                           "details": details, "repetitions": reps})
        print(f"  [{etiquette}] {c['cle']} {c['titre']} : {bc.moyenne(scores):.2f} +/- {bc.ecart_type(scores):.2f}"
              f" (répétitions : {' / '.join(f'{s:.2f}' for s in scores)}) en {sum(x['duree_generation_s'] for x in reps):.0f} s",
              flush=True)
    par_repetition = [bc.moyenne([c["repetitions"][r]["score"] for c in res["cas"]]) for r in range(repetitions)] \
        if res["cas"] else []
    res["scores_repetitions"] = [round(s, 4) for s in par_repetition]
    res["score"] = bc.moyenne(par_repetition)
    res["ecart_type"] = round(bc.ecart_type(par_repetition), 4)
    res["duree_s"] = round(time.monotonic() - t0, 1)
    return res


def enregistrer_phoenix(phoenix, jeu, exemples: dict, competence: str, modele: str, v: dict) -> str:
    nom = f"{competence} · {v['etiquette']} · {v['empreinte'][:8]}"
    meta = {"competence": competence, "version": v["etiquette"], "empreinte": v["empreinte"], "modele": modele,
            "score": round(v["score"], 4), "ecart_type": v["ecart_type"], "repetitions": v["repetitions"],
            "chemin": os.path.relpath(v["chemin"], bc.RACINE) if v["chemin"].startswith(bc.RACINE) else "hors-depot"}
    exp = phoenix.creer_experience(jeu["id"], nom, f"Banc {competence}, version {v['etiquette']}", meta,
                                   repetitions=v["repetitions"])
    for c in v["cas"]:
        for rep in c["repetitions"]:
            run_id = phoenix.ajouter_execution(exp["id"], exemples[c["cle"]], {"sortie": rep["sortie"]}, rep["debut"],
                                               rep["fin"], rep["erreur"], repetition=rep["repetition"])
            rep["run_id"] = run_id
            reussis = sum(d["reussi"] for d in rep["details"])
            explication = " | ".join(f"{'OK' if d['reussi'] else 'KO'} {d['critere'][:80]} ({d['source']})"
                                     for d in rep["details"])[:2000]
            phoenix.ajouter_evaluation(run_id, "criteres", "LLM", rep["score"], f"{reussis}/{len(rep['details'])}",
                                       explication, rep["fin"], rep["fin_notation"])
    return exp["id"]


def comparer(a: dict, b: dict) -> dict:
    return bc.decision_version(a, b)


def juger_claude(versions: list[dict], cas: list[dict], plafond: int, a_blanc: bool, commande=None,
                 modele=None) -> dict:
    deux = sorted(versions, key=lambda v: v["score"], reverse=True)[:2]
    prevus = cas[:plafond]
    bilan = {"versions": [v["etiquette"] for v in deux], "appels_prevus": len(prevus),
             "cas_non_juges": [c["cle"] for c in cas[plafond:]], "a_blanc": a_blanc, "verdicts": []}
    for i, c in enumerate(prevus):
        sa = next(x for x in deux[0]["cas"] if x["cle"] == c["cle"])
        sb = next(x for x in deux[1]["cas"] if x["cle"] == c["cle"])
        # Ordre alterné d'un cas à l'autre pour limiter le biais de position.
        x, y = (deux[0], deux[1]) if i % 2 == 0 else (deux[1], deux[0])
        sx, sy = (sa, sb) if i % 2 == 0 else (sb, sa)
        prompt = bc.prompt_claude(c, sx["sortie"], sy["sortie"])
        if a_blanc:
            print(f"  [à blanc] appel {i + 1}/{len(prevus)} pour {c['cle']} ({len(prompt)} caractères)")
            continue
        r = bc.appeler_claude(prompt, commande, modele=modele)
        gagnant = {"X": x["etiquette"], "Y": y["etiquette"]}.get(str(r.get("meilleure")), "egalite")
        bilan["verdicts"].append({"cle": c["cle"], "meilleure": gagnant, "raison": str(r.get("raison", ""))[:400],
                                  "criteres": {x["etiquette"]: r.get("criteres_X"),
                                               y["etiquette"]: r.get("criteres_Y")}})
        print(f"  [claude] {c['cle']} : {gagnant}")
    return bilan


def main(argv=None, retour=None) -> int:
    """retour : dictionnaire facultatif rempli avec le résultat (utilisé par proposer-dspy.py)."""
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--competence", required=True)
    ap.add_argument("--departement")
    ap.add_argument("--version-a", help="par défaut organisation/skills/<compétence>/SKILL.md")
    ap.add_argument("--version-b")
    ap.add_argument("--sans-phoenix", action="store_true", help="n'enregistre pas d'expérience dans Phoenix")
    ap.add_argument("--juge-claude", action="store_true")
    ap.add_argument("--plafond-claude", type=int, help="nombre maximal d'appels à claude -p (obligatoire)")
    ap.add_argument("--a-blanc-claude", action="store_true")
    ap.add_argument("--modele-claude", default=bc.MODELE_CLAUDE_DEFAUT,
                    help="modèle passé à claude --model (défaut : sonnet ; opus seulement sur demande explicite)")
    ap.add_argument("--repetitions", type=int, default=bc.REPETITIONS_DEFAUT,
                    help="nombre de passages de chaque version sur chaque cas (défaut 3)")
    ap.add_argument("--temperature", type=float,
                    help="température de génération (défaut : 0 avec une répétition, 0,3 avec plusieurs)")
    ap.add_argument("--phoenix", default=bc.PHOENIX_URL)
    ap.add_argument("--ollama", default=bc.OLLAMA_URL)
    ap.add_argument("--modele", default=bc.MODELE_LOCAL)
    ap.add_argument("--racine", default=bc.RACINE, help=argparse.SUPPRESS)
    a = ap.parse_args(argv)
    try:
        if a.repetitions < 1:
            raise bc.ErreurBanc("--repetitions doit valoir au moins 1")
        if a.juge_claude and (a.plafond_claude is None or a.plafond_claude < 1):
            raise bc.ErreurBanc("--juge-claude exige --plafond-claude N (N >= 1)")
        chemin_a = a.version_a or os.path.join(a.racine, "organisation", "skills", a.competence, "SKILL.md")
        for ch in [chemin_a] + ([a.version_b] if a.version_b else []):
            if not os.path.isfile(ch):
                raise bc.ErreurBanc(f"fichier introuvable : {ch}")
        dept = a.departement or domaine_de(chemin_a)
        if dept not in bc.departements_valides(a.racine):
            raise bc.ErreurBanc(f"département inconnu ({dept}) : préciser --departement")
        cas = [c for c in bc.tous_les_cas(a.racine) if c["departement"] == dept]
        if not cas:
            raise bc.ErreurBanc(f"aucun cas pour {dept}")
        if a.juge_claude and not a.version_b:
            raise bc.ErreurBanc("--juge-claude compare deux versions : donner --version-b")

        phoenix = jeu = exemples = None
        if not a.sans_phoenix:
            phoenix = bc.Phoenix(a.phoenix)
            jeu = phoenix.jeu_par_nom(bc.PREFIXE_JEU + dept)
            if not jeu:
                raise bc.ErreurBanc(f"jeu {bc.PREFIXE_JEU + dept} absent de Phoenix : lancer charger-cas.py")
            # Les exécutions désignent l'exemple par son identifiant global (node_id), pas par sa clé externe.
            exemples = {e["metadata"].get("cle"): e["node_id"] for e in phoenix.exemples(jeu["id"])["examples"]}
            manquants = [c["cle"] for c in cas if c["cle"] not in exemples]
            if manquants:
                raise bc.ErreurBanc(f"cas absents du jeu Phoenix {manquants} : relancer charger-cas.py")

        ollama = bc.Ollama(a.ollama, a.modele)
        version_ollama = ollama.version()
        print(f"Banc {a.competence} ({dept}, {len(cas)} cas), modèle {a.modele}, Ollama {version_ollama}")
        print(f"{a.repetitions} répétition(s) par cas ; pièces fictives : "
              f"{sum(1 for c in cas if c.get('pieces'))} cas sur {len(cas)}")
        versions = [jouer_version(ollama, "A", chemin_a, cas, a.repetitions, a.temperature)]
        if a.version_b:
            versions.append(jouer_version(ollama, "B", a.version_b, cas, a.repetitions, a.temperature))

        resultat = {"competence": a.competence, "departement": dept, "modele": a.modele,
                    "ollama": version_ollama, "date": bc.maintenant(), "versions": versions}
        if len(versions) == 2:
            resultat["comparaison"] = comparer(versions[0], versions[1])
        if phoenix:
            resultat["experiences_phoenix"] = {
                v["etiquette"]: enregistrer_phoenix(phoenix, jeu, exemples, a.competence, a.modele, v)
                for v in versions}
        if a.juge_claude:
            resultat["juge_claude"] = juger_claude(versions, cas, a.plafond_claude, a.a_blanc_claude,
                                                    modele=a.modele_claude)
            if phoenix and not a.a_blanc_claude:
                for vd in resultat["juge_claude"]["verdicts"]:
                    for v in versions:
                        c = next(x for x in v["cas"] if x["cle"] == vd["cle"])
                        score = 0.5 if vd["meilleure"] == "egalite" else float(vd["meilleure"] == v["etiquette"])
                        # Le juge Claude a lu la sortie de la première répétition.
                        phoenix.ajouter_evaluation(c["repetitions"][0]["run_id"], "juge-claude", "LLM", score, vd["meilleure"],
                                                   vd["raison"], bc.maintenant(), bc.maintenant())

        dossier = os.path.join(bc.DOSSIER_BANC, "resultats")
        os.makedirs(dossier, exist_ok=True)
        fichier = os.path.join(dossier, f"{time.strftime('%Y%m%d-%H%M%S')}-{a.competence}.json")
        with open(fichier, "w", encoding="utf-8") as f:
            json.dump(resultat, f, ensure_ascii=False, indent=1)
        for v in versions:
            print(f"Version {v['etiquette']} ({v['empreinte']}) : score {v['score']:.3f} +/- {v['ecart_type']:.3f}"
                  f" sur {v['repetitions']} répétition(s) ({' / '.join(f'{s:.3f}' for s in v['scores_repetitions'])})"
                  f" en {v['duree_s']:.0f} s")
        if "comparaison" in resultat:
            c = resultat["comparaison"]
            print(f"B - A = {c['ecart']:+.3f} (écart-type combiné {c['ecart_type_combine']:.3f}, "
                  f"{'dépassé' if c['depasse_un_ecart_type'] else 'non dépassé'}) ; reculs : {c['reculs'] or 'aucun'} ; "
                  f"B retenue : {'oui' if c['b_meilleure_sans_regression'] else 'non'}")
        print(f"Résultat : {fichier}")
        if retour is not None:
            retour.update(resultat, fichier=fichier)
        return 0
    except bc.ErreurBanc as e:
        print(f"erreur : {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
