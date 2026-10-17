#!/usr/bin/env python3
"""Exporte le journal de l'atelier vers Phoenix (traces OpenTelemetry, sur le PC seulement).

Source : la table « journal » du plugin (schéma plugin_atelier_*), lue en LECTURE SEULE par psql dans une
transaction BEGIN READ ONLY (même accès que scripts/bootstrap-organisation.py : --pg-port, mot de passe dans
PGPASSWORD uniquement, ATELIER_PSQL remplace « psql » pour les tests). Le journal porte déjà les évènements
utiles : verdicts du relecteur (revue.reussie / revue.echouee), verdicts de la porte (porte.franchie /
porte.refusee / porte.bloquee), décisions humaines (decision.approuver / decision.demander_correction /
decision.rejeter), relances et cycles de correction (correction.relancee, cycles.epuises), etc.

Destination : Phoenix local (OTLP/HTTP protobuf sur http://127.0.0.1:6006/v1/traces ; toute adresse hors de la
boucle locale est refusée). Une trace par tâche : un span racine « tache » (envoyé une fois) et un span enfant
par entrée du journal. Les entrées sans tâche forment chacune leur propre trace.

Aucune donnée personnelle : la requête ne lit ni commentaire, ni texte libre, ni nom ; seuls des identifiants
(UUID), des codes et des nombres sont extraits, puis chaque valeur texte est revérifiée (motif de code strict,
sans espace ni « @ ») avant l'envoi ; un acteur qui n'est pas un agent n'apparaît que sous forme d'empreinte.

Idempotent : le dernier « seq » exporté et les racines déjà envoyées sont gardés dans un fichier d'état local
(hors dépôt, par défaut ~/.local/state/atelier-phoenix/), mis à jour après chaque lot accepté par Phoenix.

Usage (interpréteur du venv Phoenix, qui fournit opentelemetry-proto) :
    PGPASSWORD=... ~/.local/share/atelier-phoenix/venv/bin/python -I scripts/phoenix-exporter.py --pg-port 54329
Options : --a-blanc (rien n'est envoyé ni mémorisé), --entreprise UUID, --schema, --phoenix URL, --projet NOM,
--etat FICHIER, --lot N.
Codes de sortie : 0 succès, 1 erreur, 2 état incohérent (journal plus court que le dernier seq mémorisé).
"""
import argparse
import hashlib
import json
import os
import re
import shlex
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request

PG_HOTE, PG_UTILISATEUR, PG_BASE = "127.0.0.1", "paperclip", "paperclip"
RE_UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
RE_SCHEMA = re.compile(r"^plugin_atelier_[a-z0-9]{1,40}$")
# Valeur texte admise dans un span : un code (lettres, chiffres, « _ . : - »), jamais d'espace ni de « @ ».
RE_CODE = re.compile(r"^[A-Za-z0-9_.:-]{1,80}$")
RE_EMPREINTE = re.compile(r"^[0-9a-f]{64}$")
HOTES_LOCAUX = {"127.0.0.1", "localhost", "::1"}

# Évènements qui comptent comme une correction pour la tâche (cumul affiché sur chaque span).
TYPES_CORRECTION = ("revue.echouee", "porte.refusee", "decision.demander_correction", "correction.relancee")
# Clés de « donnees » extraites (codes et nombres seulement ; jamais de texte libre).
CLES_DONNEES = ("role", "verdict", "decision", "mode", "motifs", "leviers", "cyclesEpuises", "cyclesConsommes",
                "cycles", "maximum", "maximumAvant", "maximumApres", "revisionNumber")
PREFIXE_ID = "atelier-phoenix"


class ErreurExport(Exception):
    pass


# ---------------------------------------------------------------------------------------------------------------
# Lecture du journal (psql, lecture seule)


def commande_psql(port: int) -> list:
    base = shlex.split(os.environ.get("ATELIER_PSQL") or "psql")
    return [*base, "-h", PG_HOTE, "-p", str(port), "-U", PG_UTILISATEUR, "-d", PG_BASE, "-X", "-q", "-A", "-t", "-w",
            "-v", "ON_ERROR_STOP=1"]


def executer_lecture(port: int, requetes: str) -> list:
    """Exécute des SELECT dans une transaction en lecture seule ; rend les objets JSON des lignes qui en sont."""
    script = "BEGIN READ ONLY ISOLATION LEVEL REPEATABLE READ;\n" + requetes + "COMMIT;\n"
    try:
        r = subprocess.run(commande_psql(port), input=script, capture_output=True, text=True, check=False, timeout=600)
    except (OSError, subprocess.SubprocessError) as e:
        raise ErreurExport(f"lecture du journal impossible (psql) : {e}") from None
    if r.returncode != 0:
        raise ErreurExport(f"psql a échoué (code {r.returncode}) : {r.stderr.strip()[:300]}. "
                           "Mot de passe dans PGPASSWORD, bon --pg-port ?")
    objets = []
    for ligne in r.stdout.splitlines():
        if not ligne.startswith("{"):
            continue
        try:
            objets.append(json.loads(ligne))
        except ValueError:
            raise ErreurExport("réponse de psql illisible") from None
    return objets


def trouver_schema(port: int) -> str:
    objets = executer_lecture(port, "SELECT json_build_object('schemas', coalesce(json_agg(nspname ORDER BY nspname), '[]'::json)) "
                                    "FROM pg_namespace WHERE nspname LIKE 'plugin\\_atelier\\_%';\n")
    schemas = [s for o in objets for s in (o.get("schemas") or []) if isinstance(s, str) and RE_SCHEMA.fullmatch(s)]
    if len(schemas) != 1:
        raise ErreurExport(f"{len(schemas)} schéma(s) plugin_atelier_* trouvé(s) : préciser --schema")
    return schemas[0]


def requete_journal(schema: str, apres_seq: int, lot: int, entreprise) -> str:
    if not RE_SCHEMA.fullmatch(schema):
        raise ErreurExport("schéma invalide")
    if entreprise is not None and not RE_UUID.fullmatch(entreprise):
        raise ErreurExport("--entreprise doit être un UUID")
    s = schema
    types = ", ".join(f"'{t}'" for t in TYPES_CORRECTION)
    donnees = ", ".join(f"'{c}', j.donnees->'{c}'" for c in CLES_DONNEES)
    filtre = f" AND j.company_id = '{entreprise}'" if entreprise else ""
    return (
        f"SELECT json_build_object('max_seq', (SELECT coalesce(max(seq), 0) FROM {s}.journal));\n"
        "SELECT json_build_object("
        "'seq', j.seq, 'company_id', j.company_id, 'type', j.type, 'entite', j.entite, 'issue_id', j.issue_id, "
        "'run_id', j.run_id, 'cree_le_us', (extract(epoch FROM j.cree_le) * 1000000)::bigint, "
        "'acteur_agent_id', CASE WHEN aa.id IS NOT NULL THEN aa.id END, "
        "'acteur_empreinte', CASE WHEN j.acteur IS NOT NULL AND aa.id IS NULL "
        "THEN encode(sha256(convert_to(j.acteur, 'UTF8')), 'hex') END, "
        "'service', se.service_slug, 'agent_id', i.assignee_agent_id, 'agent_role', ag.role, "
        "'competences', ag.metadata->'atelier'->'competencesObligatoires', "
        f"'donnees', jsonb_strip_nulls(jsonb_build_object({donnees})), "
        "'corrections', j.corrections)\n"
        f"FROM (SELECT x.seq, x.company_id, x.type, x.entite, x.issue_id, x.run_id, x.acteur, x.donnees, x.cree_le, "
        f"count(*) FILTER (WHERE x.type IN ({types})) OVER (PARTITION BY x.company_id, x.issue_id ORDER BY x.seq) AS corrections "
        f"FROM {s}.journal x) j\n"
        "LEFT JOIN public.issues i ON i.id = j.issue_id AND i.company_id = j.company_id\n"
        "LEFT JOIN public.agents ag ON ag.id = i.assignee_agent_id\n"
        "LEFT JOIN public.agents aa ON aa.id::text = j.acteur AND aa.company_id = j.company_id\n"
        f"LEFT JOIN {s}.services_entreprises se ON se.company_id = j.company_id\n"
        f"WHERE j.seq > {int(apres_seq)}{filtre}\nORDER BY j.seq LIMIT {int(lot)};\n"
    )


# ---------------------------------------------------------------------------------------------------------------
# Construction des spans (sans dépendance : dictionnaires simples, convertis en protobuf à l'envoi)


def ident(*parties: str, octets: int) -> bytes:
    return hashlib.sha256("|".join((PREFIXE_ID, *parties)).encode("utf-8")).digest()[:octets]


def code(v):
    """Rend la valeur si c'est un code sûr (texte court sans espace ni @, nombre, booléen), sinon None."""
    if isinstance(v, bool) or (isinstance(v, int) and not isinstance(v, bool)):
        return v
    if isinstance(v, str) and RE_CODE.fullmatch(v):
        return v
    return None


def liste_codes(v):
    if not isinstance(v, list):
        return None
    sortie = [x for x in v if isinstance(x, str) and RE_CODE.fullmatch(x)]
    return sortie or None


def attributs_communs(e: dict) -> dict:
    a = {}
    if isinstance(e.get("company_id"), str) and RE_UUID.fullmatch(e["company_id"]):
        a["atelier.entreprise_id"] = e["company_id"]
    if code(e.get("service")) is not None:
        a["atelier.service"] = e["service"]
    if isinstance(e.get("issue_id"), str) and RE_UUID.fullmatch(e["issue_id"]):
        a["atelier.tache_id"] = e["issue_id"]
    if isinstance(e.get("agent_id"), str) and RE_UUID.fullmatch(e["agent_id"]):
        a["atelier.agent_id"] = e["agent_id"]
    if code(e.get("agent_role")) is not None:
        a["atelier.agent_role"] = e["agent_role"]
    comp = liste_codes(e.get("competences"))
    if comp:  # compétences déclarées de l'agent assigné (registre des agents) ; la tâche n'en désigne pas une seule
        a["atelier.competences"] = comp
    return a


def attributs_evenement(e: dict) -> dict:
    a = attributs_communs(e)
    t = e.get("type")
    a["atelier.evenement"] = t if code(t) is not None else "inconnu"
    a["atelier.seq"] = int(e["seq"])
    if code(e.get("entite")) is not None:
        a["atelier.entite"] = e["entite"]
    if isinstance(e.get("run_id"), str) and RE_UUID.fullmatch(e["run_id"]):
        a["atelier.run_id"] = e["run_id"]
    if isinstance(e.get("acteur_agent_id"), str) and RE_UUID.fullmatch(e["acteur_agent_id"]):
        a["atelier.acteur.type"] = "agent"
        a["atelier.acteur.id"] = e["acteur_agent_id"]
    elif isinstance(e.get("acteur_empreinte"), str) and RE_EMPREINTE.fullmatch(e["acteur_empreinte"]):
        a["atelier.acteur.type"] = "autre"
        a["atelier.acteur.empreinte"] = e["acteur_empreinte"][:16]
    d = e.get("donnees") if isinstance(e.get("donnees"), dict) else {}
    if isinstance(t, str) and t.startswith("revue.") and code(d.get("verdict")) is not None:
        a["atelier.verdict"] = d["verdict"]
        a["atelier.verdict.source"] = "relecteur"
        if code(d.get("role")) is not None:
            a["atelier.revue.role"] = d["role"]
    if isinstance(t, str) and t.startswith("porte.") and code(d.get("decision")) is not None:
        a["atelier.verdict"] = d["decision"]
        a["atelier.verdict.source"] = "porte"
        motifs = liste_codes(d.get("motifs"))
        if motifs:
            a["atelier.porte.motifs"] = motifs
    if isinstance(t, str) and t.startswith("decision.") and code(t.split(".", 1)[1]) is not None:
        a["atelier.decision_humaine"] = t.split(".", 1)[1]
    for cle, nom in (("mode", "atelier.mode"), ("cyclesEpuises", "atelier.cycles_epuises"),
                     ("cyclesConsommes", "atelier.cycles_consommes"), ("cycles", "atelier.cycles"),
                     ("maximum", "atelier.cycles_maximum"), ("maximumAvant", "atelier.cycles_maximum_avant"),
                     ("maximumApres", "atelier.cycles_maximum_apres"), ("revisionNumber", "atelier.revision")):
        if code(d.get(cle)) is not None:
            a[nom] = d[cle]
    leviers = liste_codes(d.get("leviers"))
    if leviers:
        a["atelier.correction.leviers"] = leviers
    if a.get("atelier.tache_id") and isinstance(e.get("corrections"), int):
        a["atelier.corrections"] = e["corrections"]
    a["openinference.span.kind"] = "EVALUATOR" if "atelier.verdict" in a else "CHAIN"
    return a


def construire_spans(entrees: list, racines_envoyees: set) -> tuple:
    """Rend (spans, nouvelles_racines). Un span = dict(trace_id, span_id, parent, nom, debut, fin, attributs)."""
    spans, nouvelles = [], []
    for e in entrees:
        if not isinstance(e.get("seq"), int) or not isinstance(e.get("cree_le_us"), int):
            raise ErreurExport("entrée du journal sans seq ou date : export refusé")
        debut = e["cree_le_us"] * 1000
        entreprise = e.get("company_id") if isinstance(e.get("company_id"), str) and RE_UUID.fullmatch(e["company_id"]) else "?"
        tache = e.get("issue_id") if isinstance(e.get("issue_id"), str) and RE_UUID.fullmatch(e["issue_id"]) else None
        span_id = ident("seq", entreprise, str(e["seq"]), octets=8)
        if tache:
            trace_id = ident("trace", entreprise, tache, octets=16)
            racine = ident("racine", entreprise, tache, octets=8)
            cle = f"{entreprise}/{tache}"
            if cle not in racines_envoyees and cle not in nouvelles:
                a = attributs_communs(e)
                a["openinference.span.kind"] = "CHAIN"
                spans.append({"trace_id": trace_id, "span_id": racine, "parent": b"", "nom": "tache",
                              "debut": debut, "fin": debut + 1_000_000, "attributs": a})
                nouvelles.append(cle)
            parent = racine
        else:
            trace_id = ident("trace-seq", entreprise, str(e["seq"]), octets=16)
            parent = b""
        nom = e["type"] if code(e.get("type")) is not None else "evenement"
        spans.append({"trace_id": trace_id, "span_id": span_id, "parent": parent, "nom": nom,
                      "debut": debut, "fin": debut + 1_000_000, "attributs": attributs_evenement(e)})
    return spans, nouvelles


# ---------------------------------------------------------------------------------------------------------------
# Envoi OTLP/HTTP protobuf


def valeur_otlp(v):
    from opentelemetry.proto.common.v1 import common_pb2
    if isinstance(v, bool):
        return common_pb2.AnyValue(bool_value=v)
    if isinstance(v, int):
        return common_pb2.AnyValue(int_value=v)
    if isinstance(v, list):
        return common_pb2.AnyValue(array_value=common_pb2.ArrayValue(values=[valeur_otlp(x) for x in v]))
    return common_pb2.AnyValue(string_value=str(v))


def requete_otlp(spans: list, projet: str) -> bytes:
    from opentelemetry.proto.collector.trace.v1 import trace_service_pb2
    from opentelemetry.proto.common.v1 import common_pb2
    from opentelemetry.proto.resource.v1 import resource_pb2
    from opentelemetry.proto.trace.v1 import trace_pb2

    def kv(k, v):
        return common_pb2.KeyValue(key=k, value=valeur_otlp(v))

    pb = []
    for s in spans:
        pb.append(trace_pb2.Span(
            trace_id=s["trace_id"], span_id=s["span_id"], parent_span_id=s["parent"], name=s["nom"],
            kind=trace_pb2.Span.SPAN_KIND_INTERNAL, start_time_unix_nano=s["debut"], end_time_unix_nano=s["fin"],
            attributes=[kv(k, v) for k, v in sorted(s["attributs"].items())]))
    ressource = resource_pb2.Resource(attributes=[kv("service.name", "atelier-marketing-ia"),
                                                  kv("openinference.project.name", projet)])
    req = trace_service_pb2.ExportTraceServiceRequest(resource_spans=[trace_pb2.ResourceSpans(
        resource=ressource,
        scope_spans=[trace_pb2.ScopeSpans(scope=common_pb2.InstrumentationScope(name="atelier.phoenix-exporter"),
                                          spans=pb)])])
    return req.SerializeToString()


def verifier_url_locale(url: str) -> str:
    p = urllib.parse.urlsplit(url)
    if p.scheme != "http" or p.hostname not in HOTES_LOCAUX:
        raise ErreurExport(f"--phoenix doit viser la boucle locale en http (reçu « {url} ») : tout reste sur le PC")
    return url.rstrip("/")


def envoyer(url: str, corps: bytes) -> None:
    req = urllib.request.Request(url + "/v1/traces", data=corps, method="POST",
                                 headers={"Content-Type": "application/x-protobuf"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            if not 200 <= r.status < 300:
                raise ErreurExport(f"Phoenix a répondu {r.status}")
    except urllib.error.HTTPError as e:
        raise ErreurExport(f"Phoenix a refusé le lot (HTTP {e.code})") from None
    except (urllib.error.URLError, OSError) as e:
        raise ErreurExport(f"Phoenix injoignable ({e}) : « systemctl --user status atelier-phoenix »") from None


# ---------------------------------------------------------------------------------------------------------------
# État local (hors dépôt)


def chemin_etat_defaut(port: int, schema: str) -> str:
    base = os.environ.get("XDG_STATE_HOME") or os.path.join(os.path.expanduser("~"), ".local", "state")
    return os.path.join(base, "atelier-phoenix", f"exporteur-{port}-{schema}.json")


def lire_etat(chemin: str) -> dict:
    try:
        with open(chemin, encoding="utf-8") as f:
            etat = json.load(f)
    except FileNotFoundError:
        return {"dernier_seq": 0, "racines": []}
    except (OSError, ValueError) as e:
        raise ErreurExport(f"fichier d'état illisible ({chemin}) : {e}") from None
    if not isinstance(etat.get("dernier_seq"), int) or not isinstance(etat.get("racines"), list):
        raise ErreurExport(f"fichier d'état invalide ({chemin})")
    return etat


def ecrire_etat(chemin: str, etat: dict) -> None:
    os.makedirs(os.path.dirname(chemin), mode=0o700, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(chemin), prefix=".etat-")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        json.dump(etat, f, indent=1, sort_keys=True)
        f.write("\n")
    os.replace(tmp, chemin)


# ---------------------------------------------------------------------------------------------------------------


def exporter(args) -> int:
    url = verifier_url_locale(args.phoenix)
    schema = args.schema or trouver_schema(args.pg_port)
    if not RE_SCHEMA.fullmatch(schema):
        raise ErreurExport("--schema invalide (attendu plugin_atelier_...)")
    chemin = args.etat or chemin_etat_defaut(args.pg_port, schema)
    etat = lire_etat(chemin)
    racines = set(etat["racines"])
    total_entrees = total_spans = 0
    while True:
        objets = executer_lecture(args.pg_port, requete_journal(schema, etat["dernier_seq"], args.lot, args.entreprise))
        max_seq = next((o["max_seq"] for o in objets if "max_seq" in o), None)
        if not isinstance(max_seq, int):
            raise ErreurExport("réponse de psql sans max_seq")
        if max_seq < etat["dernier_seq"]:
            print(f"Journal plus court ({max_seq}) que le dernier seq exporté ({etat['dernier_seq']}) : base recréée ? "
                  f"Supprimer {chemin} pour tout réexporter.", file=sys.stderr)
            return 2
        entrees = [o for o in objets if "seq" in o]
        if not entrees:
            break
        spans, nouvelles = construire_spans(entrees, racines)
        dernier = max(e["seq"] for e in entrees)
        if args.a_blanc:
            for s in spans:
                print(json.dumps({"trace": s["trace_id"].hex(), "span": s["span_id"].hex(), "nom": s["nom"],
                                  "attributs": s["attributs"]}, ensure_ascii=False, sort_keys=True))
        else:
            envoyer(url, requete_otlp(spans, args.projet))
            racines.update(nouvelles)
            etat = {"dernier_seq": dernier, "racines": sorted(racines), "schema": schema}
            ecrire_etat(chemin, etat)
        if args.a_blanc:
            etat = {**etat, "dernier_seq": dernier}
            racines.update(nouvelles)
        total_entrees += len(entrees)
        total_spans += len(spans)
        if len(entrees) < args.lot:
            break
    verbe = "à envoyer (à blanc, rien envoyé ni mémorisé)" if args.a_blanc else "envoyés à Phoenix"
    print(f"{total_entrees} entrée(s) du journal, {total_spans} span(s) {verbe} ; projet « {args.projet} », "
          f"dernier seq {etat['dernier_seq']}.")
    return 0


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description="Exporte le journal de l'atelier vers Phoenix local (OpenTelemetry).")
    p.add_argument("--pg-port", type=int, required=True, dest="pg_port",
                   help="port PostgreSQL de l'instance (54329 pour 3100) ; mot de passe dans PGPASSWORD")
    p.add_argument("--schema", default=None, help="schéma du plugin (par défaut : le seul plugin_atelier_* trouvé)")
    p.add_argument("--entreprise", default=None, help="UUID d'une entreprise (par défaut : toutes)")
    p.add_argument("--phoenix", default="http://127.0.0.1:6006", help="URL locale de Phoenix")
    p.add_argument("--projet", default="atelier", help="projet Phoenix (défaut : atelier)")
    p.add_argument("--etat", default=None, help="fichier d'état local (défaut : ~/.local/state/atelier-phoenix/...)")
    p.add_argument("--lot", type=int, default=1000, help="entrées lues par lot (défaut 1000)")
    p.add_argument("--a-blanc", action="store_true", dest="a_blanc", help="afficher sans rien envoyer ni mémoriser")
    args = p.parse_args(argv)
    if not 1 <= args.lot <= 10000:
        p.error("--lot doit être entre 1 et 10000")
    try:
        return exporter(args)
    except ErreurExport as e:
        print(f"phoenix-exporter : {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
