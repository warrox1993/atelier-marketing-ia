# Construit sujets/NN-<slug>.json et sujets/LISEZ-MOI.md à partir des sujets bruts (dossier --sources, hors dépôt).
# Usage : python3 -I construire.py --sources <dossier des NN-*.json bruts>
# Seules les requêtes HTTP de vérification des alias sont émises (curl), jamais vers 127.0.0.1 ni la base.
import argparse, json, glob, os, re, subprocess, sys
from urllib.parse import quote

ICI = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sujets")
_p = argparse.ArgumentParser(description="Construit les 10 sujets du département Observatoire")
_p.add_argument("--sources", required=True, help="dossier des sujets bruts NN-*.json")
SUJETS = _p.parse_args().sources
CACHE = {}

def code_http(url):
    if url not in CACHE:
        r = subprocess.run(["curl", "-sS", "-o", "/dev/null", "-w", "%{http_code}", "-L", "--max-time", "15", url],
                           capture_output=True, text=True)
        CACHE[url] = r.stdout.strip() if r.returncode == 0 else f"erreur-curl-{r.returncode}"
    return CACHE[url]

def candidats(sujet):
    """Alias déduits des seules sources primaires du sujet (aucun alias inventé)."""
    vus, res = set(), []
    def ajouter(type_, valeur, test):
        if (type_, valeur) not in vus:
            vus.add((type_, valeur)); res.append((type_, valeur, test))
    for s in sujet["sources"]:
        if s["type"] != "primaire":
            continue
        u = s["url"]
        m = re.match(r"https://github\.com/([^/]+)/([^/]+)/", u)
        if m:
            ajouter("github", f"{m[1]}/{m[2]}", f"https://api.github.com/repos/{m[1]}/{m[2]}"); continue
        m = re.match(r"https://registry\.npmjs\.org/(.+)$", u)
        if m:
            ajouter("npm", m[1], f"https://registry.npmjs.org/{m[1].replace('/', '%2F')}"); continue
        ajouter("site", u, u)
    return res

# Paquet réel inconnu (point ouvert connu) : on teste le nom cité par le journal de Cursor, il sera refusé s'il répond 404.
EXTRA = {4: [("npm", "@cursor/agent-sdk", "https://registry.npmjs.org/@cursor%2Fagent-sdk")]}

PLAN = [
    "Ce qui est annoncé ou publié : les faits datés, tels que la source les énonce",
    "Ce que cela change pour un développeur : usage concret, uniquement à partir des faits listés",
    "Ce que cela change pour un décideur : choix, coûts, risques, uniquement à partir des faits listés",
    "Ce qui n'est pas établi : points ouverts, chiffres d'éditeur non mesurés de façon indépendante",
    "Sources et méthode de vérification : liste des URL lues le 27/10/2026",
]

resume = []
for f in sorted(glob.glob(os.path.join(SUJETS, "[0-9][0-9]-*.json"))):
    s = json.load(open(f, encoding="utf-8"))
    n = s["numero"]
    cands = candidats(s) + EXTRA.get(n, [])
    retenus, refuses = [], []
    for t, v, test in cands:
        c = code_http(test)
        (retenus if c == "200" else refuses).append({"type": t, "valeur": v} if c == "200" else {"type": t, "valeur": v, "code": c})
    slug_projet = f"article-{n}-{s['slug']}"
    projet = None
    motif = None
    if retenus:
        projet = {"companyId": "<OBS>", "slug": slug_projet, "nom": s["titre_provisoire"], "alias": retenus}
    else:
        motif = "Aucun alias de collecte n'a répondu 200."
    brief = {
        "tache": f"Rédiger l'article n° {n} du magazine : {s['titre_provisoire']}",
        "categorie": s["categorie"],
        "publie_le": s["publie_le"],
        "angle": s["angle"] + " Texte à écrire pour deux lecteurs : le développeur (ce qu'il peut faire ou doit vérifier) et le décideur (ce que cela change pour un choix d'outil, de coût ou de conformité), sans rien ajouter qui ne figure pas dans les faits ci-dessous.",
        "plan": PLAN,
        "faits": [{"texte": x["texte"], "source_url": x["source_url"], "extrait_exact": x["extrait_exact"],
                   "statut_propose": x["statut_propose"]} for x in s["faits"]],
        "points_ouverts": s["questions_ouvertes"],
        "regles": "Aucun fait, date ou chiffre hors des faits listés. Chaque affirmation renvoie à un fait et à son extrait exact. Pas de tiret cadratin.",
    }
    out = {"numero": n, "slug": s["slug"], "projet": projet, "motifSansProjet": motif,
           "aliasRefuses": refuses, "brief": brief}
    with open(os.path.join(ICI, f"{n:02d}-{s['slug']}.json"), "w", encoding="utf-8") as g:
        json.dump(out, g, ensure_ascii=False, indent=2); g.write("\n")
    resume.append((n, s["slug"], retenus, refuses, len(s["faits"]), len(s["questions_ouvertes"])))

def fmt(l): return ", ".join(f"{a['type']}:{a['valeur']}" for a in l) or "aucun"
def fmtr(l): return ", ".join(f"{a['type']}:{a['valeur']} ({a['code']})" for a in l) or "aucun"
ordre = sorted(resume, key=lambda r: (len(r[3]) > 0, r[0]))
L = ["# Matériel de rédaction des 10 articles du département Observatoire", "",
     "Généré le 27/10/2026 par `construire.py` à partir des sujets bruts (`--sources`). Rien n'a été écrit sur l'instance 3100.",
     "`companyId` vaut `\"<OBS>\"` dans chaque `projet` : à remplacer au moment de l'envoi. Le slug du projet suit `article-<numero>-<slug>` (numéro sans zéro initial, exigé par le format des clés d'article).", "",
     "| N° | Slug | Alias retenus | Alias refusés | Faits | Points ouverts |", "| --- | --- | --- | --- | --- | --- |"]
for n, sl, ret, ref, nf, npo in resume:
    L.append(f"| {n:02d} | {sl} | {fmt(ret)} | {fmtr(ref)} | {nf} | {npo} |")
L += ["", "## Ordre conseillé", "",
      "Sujets dont tous les alias testés répondent 200 d'abord, puis les autres, par numéro.", ""]
for i, (n, sl, ret, ref, nf, npo) in enumerate(ordre, 1):
    L.append(f"{i}. {n:02d} {sl}" + (" (alias refusé : à lever avant publication)" if ref else ""))
L += ["", "## Points ouverts connus", "",
      "- 05 : poids de Mistral Large 4 absents de Hugging Face au 27/10.", ""]
open(os.path.join(ICI, "LISEZ-MOI.md"), "w", encoding="utf-8").write("\n".join(L))
print("ok", len(resume))
