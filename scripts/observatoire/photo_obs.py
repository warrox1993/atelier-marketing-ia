"""Photo en lecture seule de l'entreprise Observatoire (3100) : GET + SQL lecture seule. Usage : python3 -I photo_obs.py <sortie.json> <url-api> <id-entreprise> (PGPASSWORD dans l'environnement)"""
import json, os, re, subprocess, sys, urllib.parse, urllib.request

def lire_cle_fichier(port) -> str | None:
    """Clé board lue dans un fichier 0600 hors dépôt : ATELIER_CLE_BOARD_FICHIER, sinon ~/.config/atelier/board-<port>.key.

    Absent : None (mode local_trusted, comportement historique). Fichier qui ne m'appartient pas, ouvert au groupe
    ou aux autres, ou contenu invalide : ignoré avec un avertissement. Créé par scripts/passer-en-mode-authentifie.sh.
    (Recopié dans chaque script : ils tournent en `python3 -I`.)
    """
    chemin = os.environ.get("ATELIER_CLE_BOARD_FICHIER") or os.path.join(
        os.path.expanduser("~"), ".config", "atelier", f"board-{port}.key")
    try:
        st = os.stat(chemin)
    except OSError:
        return None
    if st.st_uid != os.getuid() or st.st_mode & 0o077:
        print(f"AVERTISSEMENT : {chemin} ignoré (il doit m'appartenir et être en 0600).", file=sys.stderr)
        return None
    try:
        with open(chemin, encoding="utf-8") as f:
            cle = f.read().strip()
    except OSError:
        return None
    if not re.fullmatch(r"[A-Za-z0-9_.-]{16,512}", cle):
        print(f"AVERTISSEMENT : contenu de {chemin} invalide : clé non envoyée.", file=sys.stderr)
        return None
    return cle


def ajouter_cle_tableau(req):
    """Mode authentifié : ajoute la clé d'API du tableau (board), facultative.

    Source : PAPERCLIP_BOARD_KEY si elle est définie, sinon le fichier de clé de l'instance visée
    (lire_cle_fichier, seulement vers la boucle locale). Sans clé, la requête part sans jeton (local_trusted).
    La clé n'est envoyée que vers http://127.0.0.1:<port>, http://localhost:<port> ou https://<nom>.ts.net ;
    ailleurs, rien n'est envoyé (avertissement sans la clé). L'en-tête est « non redirigeable » : il n'est
    jamais recopié lors d'une redirection. (Recopié dans chaque script : ils tournent en `python3 -I`.)
    """
    u = urllib.parse.urlsplit(req.full_url)
    h = (u.hostname or "").lower()
    boucle_locale = u.scheme == "http" and h in ("127.0.0.1", "localhost") and u.port is not None
    cle = os.environ.get("PAPERCLIP_BOARD_KEY") or (lire_cle_fichier(u.port) if boucle_locale else None)
    if not cle:
        return
    if boucle_locale:
        autorise = True
    else:
        autorise = u.scheme == "https" and h.endswith(".ts.net") and len(h) > len(".ts.net")
    if autorise:
        req.add_unredirected_header("Authorization", "Bearer " + cle)
    else:
        print("AVERTISSEMENT : PAPERCLIP_BOARD_KEY non envoyée (destination hors 127.0.0.1, localhost et *.ts.net : "
              + (u.hostname or "?") + ").", file=sys.stderr)


def get(ch):
    req = urllib.request.Request(API + ch)
    ajouter_cle_tableau(req)  # mode authentifié : clé board facultative, boucle locale seulement
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)

def sql(req):
    """Rend les lignes en JSON (une requete SELECT qui renvoie json_agg)."""
    p = subprocess.run(["psql", "-h", "127.0.0.1", "-p", "54329", "-U", "paperclip", "-d", "paperclip", "-At", "-c", req],
                       capture_output=True, text=True, env=ENV, timeout=60)
    if p.returncode:
        return {"_erreur": p.stderr[:300]}
    return json.loads(p.stdout.strip() or "null")

def agg(table_sql):
    return sql(f"select coalesce(json_agg(t),'[]'::json) from ({table_sql}) t")

# APP-2 : taux de PASS de la porte au premier passage, par auteur de la révision évaluée et par semaine (docs/observatoire/agents.md, Indicateurs).
# Premier passage = première évaluation de la porte d'une tâche de livrable ; auteur = created_by_agent_id de la révision native évaluée.
def indicateurs_porte_sql(obs):
    return f"""with premiere as (
  select distinct on (ev.issue_id) ev.issue_id, ev.decision, ev.cree_le, dr.created_by_agent_id agent,
    count(*) over (partition by ev.issue_id) evaluations
  from plugin_atelier_f0322cc62c.evaluations_porte ev left join document_revisions dr on dr.id = ev.revision_id
  where ev.company_id = '{obs}' order by ev.issue_id, ev.cree_le, ev.id)
select coalesce(a.name, 'inconnu') agent, to_char(date_trunc('week', p.cree_le), 'YYYY-MM-DD') semaine, count(*) livrables,
  count(*) filter (where p.decision = 'PASS') pass_premier_passage,
  round(100.0 * count(*) filter (where p.decision = 'PASS') / count(*)) taux_pct, round(avg(p.evaluations), 1) evaluations_par_livrable
from premiere p left join agents a on a.id = p.agent group by 1, 2 order by 2, 1"""

if __name__ == "__main__":
    API, OBS = sys.argv[2].rstrip("/"), sys.argv[3]
    ENV = {**os.environ, "PGOPTIONS": "-c default_transaction_read_only=on", "PGPASSWORD": os.environ["PGPASSWORD"]}
    photo = {
        "horodatage": sql("select to_json(now()::text)"),
        "agents": [{k: a.get(k) for k in ("id", "name", "status", "lifecycleState", "lifecycleHolds")} for a in get(f"/companies/{OBS}/agents")],
        "issues_par_statut": agg(f"select status, count(*) n from issues where company_id='{OBS}' group by 1"),
        "runs_par_statut": agg(f"select status, count(*) n from heartbeat_runs where company_id='{OBS}' group by 1"),
        "demandes_reveil": agg(f"select count(*) n from agent_wakeup_requests where company_id='{OBS}'"),
        "depenses_cents": agg(f"select coalesce(sum(cost_cents),0) cents, count(*) evenements from cost_events where company_id='{OBS}'"),
        "approbations": agg(f"select status, count(*) n from approvals where company_id='{OBS}' group by 1"),
        "indicateurs_porte": agg(indicateurs_porte_sql(OBS)),
        "obs_tables": agg("select relname, n_live_tup from pg_stat_user_tables where relname like 'obs\\_%' order by 1"),
    }
    json.dump(photo, open(sys.argv[1], "w"), ensure_ascii=False, indent=1)
    print(json.dumps({k: v for k, v in photo.items() if k != "agents"}, ensure_ascii=False))
    print(sorted((a["name"], a["status"]) for a in photo["agents"]))
