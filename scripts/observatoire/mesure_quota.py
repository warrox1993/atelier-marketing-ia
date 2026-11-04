"""Usage Claude des runs de l'usine depuis un instant UTC (methode de consommation-abonnement-23102026.md) :
agrege message.usage des transcriptions instance/claude-config/**/*.jsonl, dedoublonne par (message.id, requestId).
Poids = entree + ecriture cache x1,25 + lecture cache x0,1 + sortie x5 (approximation). Usage : python3 -I mesure_quota.py <ISO-UTC> [--par-agent]"""
import glob, json, os, sys, collections
depuis = sys.argv[1]
racine = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "instance", "claude-config")
vus, tot, par = set(), collections.Counter(), collections.defaultdict(collections.Counter)
for f in glob.glob(racine + "/**/*.jsonl", recursive=True):
    if os.path.getmtime(f) < 1.0e9: continue
    agent = f[len(racine) + 1:].split("/")[0]
    for l in open(f, encoding="utf-8", errors="replace"):
        if '"usage"' not in l: continue
        try: e = json.loads(l)
        except ValueError: continue
        m = e.get("message") or {}
        u = m.get("usage")
        if not u or (e.get("timestamp") or "") < depuis: continue
        cle = (m.get("id"), e.get("requestId"))
        if cle in vus: continue
        vus.add(cle)
        for c in (tot, par[(agent, m.get("model"))]):
            c["appels"] += 1
            c["entree"] += u.get("input_tokens", 0); c["ecr_cache"] += u.get("cache_creation_input_tokens", 0)
            c["lec_cache"] += u.get("cache_read_input_tokens", 0); c["sortie"] += u.get("output_tokens", 0)
def poids(c): return round(c["entree"] + 1.25 * c["ecr_cache"] + 0.1 * c["lec_cache"] + 5 * c["sortie"])
print("TOTAL", dict(tot), "poids", poids(tot))
if "--par-agent" in sys.argv:
    for k, c in sorted(par.items(), key=lambda x: -poids(x[1])): print(k, dict(c), "poids", poids(c))
