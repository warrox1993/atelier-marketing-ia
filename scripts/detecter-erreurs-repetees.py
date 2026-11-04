#!/usr/bin/env python3
"""Détecteur quotidien des erreurs répétées des agents (APP-3 de l'audit du 29/10/2026), sans modèle ni quota.

Lit en lecture seule les journaux de runs du socle (run-logs/<entreprise>/<agent>/<run>.ndjson) des N derniers jours
et regroupe chaque erreur par signature : agent, route appelée (identifiants remplacés), code HTTP et code d'erreur,
refus d'outil, compétence inconnue. Une signature vue dans au moins 2 runs est une erreur répétée : à corriger dans les
consignes, puis à garder comme cas de non-régression. Le rapport ne garde que route et code, jamais le corps des
réponses ni la commande entière.

Usage : python3 -I scripts/detecter-erreurs-repetees.py [--journaux DOSSIER] [--jours 7] [--seuil 2] [--sortie FICHIER]
Sortie par défaut : ~/.local/share/atelier-erreurs-repetees/AAAA-MM-JJ.json
Codes de sortie : 0 aucune erreur répétée, 1 erreurs répétées (résumé sur la sortie standard, l'unité systemd alerte),
2 argument ou dossier invalide.
"""
import argparse
import datetime
import json
import os
import re
import sys
import time
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
JOURNAUX_DEFAUT = RACINE / "instance" / "instances" / "atelier" / "data" / "run-logs"
RE_UUID = re.compile(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")
RE_SLUG = re.compile(r"agents-atelier/[^/]+/([a-z0-9-]{1,80})")
RE_CODE = re.compile(r'"(?:error|code)"\s*:\s*"([a-z_]{3,40})"')
PREFIXE_PLUGIN = "/api/plugins/atelier.marketing-ia/api"


def route(commande):
    """`METHODE /chemin` d'une commande curl, identifiants remplacés ; `?` si aucune URL."""
    url = re.search(r"\{\{PAPERCLIP_API_URL\}\}(/[^'\"\s?\\]*)", commande) or re.search(r"https?://[^/\s'\"]+(/[^'\"\s?\\]*)", commande)
    methode = re.search(r"-X\s*'?([A-Z]+)", commande)
    m = methode.group(1) if methode else ("POST" if re.search(r"(--data|-d )", commande) else "GET")
    chemin = url.group(1) if url else "?"
    chemin = RE_UUID.sub(":id", chemin)
    chemin = re.sub(r"/[A-Z]+-\d+", "/:cle", chemin)
    chemin = re.sub(r"/\d+", "/:n", chemin)
    return f"{m} {chemin.replace(PREFIXE_PLUGIN, '/P')}"


def evenements(fichier):
    """(slug de l'agent ou None, [signature sans agent]) d'un journal de run."""
    morceaux = []
    with open(fichier, encoding="utf-8", errors="replace") as f:
        for ligne in f:
            try:
                o = json.loads(ligne)
            except ValueError:
                continue
            if o.get("stream") == "stdout":
                morceaux.append(o.get("chunk", ""))
    slug, appels, signatures = None, {}, []
    for ligne in "".join(morceaux).split("\n"):
        if not ligne.startswith("{"):
            continue
        try:
            j = json.loads(ligne)
        except ValueError:
            continue
        if not isinstance(j, dict):
            continue
        if j.get("type") == "system" and j.get("subtype") == "init":
            m = RE_SLUG.search(str(j.get("cwd", "")))
            slug = m.group(1) if m else slug
        message = j.get("message")
        contenu = (message.get("content") if isinstance(message, dict) else None) or []
        if j.get("type") == "assistant":
            for c in contenu:
                if isinstance(c, dict) and c.get("type") == "tool_use":
                    appels[c.get("id")] = (str(c.get("name")), json.dumps(c.get("input"), ensure_ascii=False))
        elif j.get("type") == "user" and isinstance(contenu, list):
            for c in contenu:
                if isinstance(c, dict) and c.get("type") == "tool_result":
                    s = signature(c, *appels.get(c.get("tool_use_id"), ("?", "")))
                    if s:
                        signatures.append(s)
    return slug, signatures


def signature(resultat, outil, entree):
    texte = resultat.get("content")
    if isinstance(texte, list):
        texte = " ".join(x.get("text", "") for x in texte if isinstance(x, dict))
    texte = str(texte or "")
    if "Unknown skill" in texte:
        return f"competence-inconnue {outil}"
    http = [c for c in re.findall(r"HTTP (\d{3})", texte) if c[0] in "45"]
    if outil == "Bash" and http:
        code = RE_CODE.search(texte)
        return f"HTTP {http[-1]} {route(entree)}" + (f" {code.group(1)}" if code else "")
    if resultat.get("is_error"):
        bas = texte.lower()
        refus = any(m in bas for m in ("refus", "blocked", "denied", "permission"))
        return f"{'refus-outil' if refus else 'erreur-outil'} {outil}" + (f" {route(entree)}" if outil == "Bash" else "")
    return None


def detecter(dossier, jours, seuil, maintenant=None):
    limite = (maintenant or time.time()) - jours * 86400
    runs = {}  # signature → ensemble des runs
    for fichier in sorted(Path(dossier).glob("*/*/*.ndjson")):
        if fichier.stat().st_mtime < limite:
            continue
        slug, signatures = evenements(fichier)
        agent = slug or fichier.parent.name
        for s in set(signatures):
            runs.setdefault(f"{agent} | {s}", set()).add(fichier.stem)
    repetees = [{"signature": s, "runs": len(r), "exemples": sorted(r)[:5]} for s, r in runs.items() if len(r) >= seuil]
    return sorted(repetees, key=lambda x: (-x["runs"], x["signature"])), len(runs)


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--journaux", default=str(JOURNAUX_DEFAUT))
    p.add_argument("--jours", type=int, default=7)
    p.add_argument("--seuil", type=int, default=2)
    p.add_argument("--sortie")
    a = p.parse_args(argv)
    if not Path(a.journaux).is_dir() or a.jours < 1 or a.seuil < 2:
        print(f"ERREUR : dossier de journaux absent ({a.journaux}), ou --jours < 1, ou --seuil < 2", file=sys.stderr)
        return 2
    repetees, total = detecter(a.journaux, a.jours, a.seuil)
    jour = datetime.date.today().isoformat()
    sortie = Path(a.sortie or Path.home() / ".local" / "share" / "atelier-erreurs-repetees" / f"{jour}.json")
    sortie.parent.mkdir(parents=True, exist_ok=True)
    rapport = {"jour": jour, "jours": a.jours, "seuil": a.seuil, "signatures": total, "repetees": repetees}
    sortie.write_text(json.dumps(rapport, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    os.chmod(sortie, 0o600)
    print(f"{len(repetees)} erreur(s) répétée(s) sur {total} signature(s), {a.jours} jour(s) ; rapport : {sortie}")
    for r in repetees[:20]:
        print(f"- {r['runs']} runs : {r['signature']}")
    return 1 if repetees else 0


if __name__ == "__main__":
    sys.exit(main())
