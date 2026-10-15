#!/usr/bin/env bash
# Tests du lot B (organisation, compétences, bootstrap). Aucun appel de modèle.
#
# Usage :
#   scripts/bootstrap-tests.sh                 format + cas négatifs (hors ligne)
#   scripts/bootstrap-tests.sh --instance      + idempotence, export, aller-retour d'import
#                                              (instance Paperclip lancée, port de config/atelier.env)
#   scripts/bootstrap-tests.sh --instance --remise-a-zero
#                                              + suppression de l'organisation de démonstration
#                                              puis reconstruction complète (deux passes)
#
# Instance d'essai isolée (PAPERCLIP_HOME, identifiant, port 3160) : voir
# scripts/bootstrap-instance-test.sh ; exporter ses variables avant --instance :
#   eval "$(scripts/bootstrap-instance-test.sh env)"
set -uo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PY=(python3 -I)
INSTANCE=0
REMISE=0
for a in "$@"; do
  case "${a}" in
    --instance) INSTANCE=1 ;;
    --remise-a-zero) REMISE=1 ;;
    *) echo "Option inconnue : ${a}" >&2; exit 2 ;;
  esac
done

BASE_TMP="${TMPDIR:-/tmp}"
TRAVAIL="$(mktemp -d "${BASE_TMP%/}/atelier-lotb-tests-XXXXXX")"
nettoyer() { case "${TRAVAIL}" in */atelier-lotb-tests-*) rm -rf -- "${TRAVAIL}" ;; esac; }
trap nettoyer EXIT

reussis=0
echecs=0
ok() { echo "RÉUSSI  $*"; reussis=$((reussis + 1)); }
ko() { echo "ÉCHEC   $*"; echecs=$((echecs + 1)); }

# 1. Format et cohérence du modèle d'organisation.
if "${PY[@]}" "${RACINE}/scripts/verifier-organisation.py" > "${TRAVAIL}/verif.txt" 2>&1; then
  ok "vérificateur : $(tail -1 "${TRAVAIL}/verif.txt")"
else
  ko "vérificateur"; cat "${TRAVAIL}/verif.txt"
fi

# 2. Cas négatifs : le vérificateur doit refuser des défauts injectés dans une copie.
copie() {
  local d="${TRAVAIL}/copie-$1"
  mkdir -p "${d}/scripts" "${d}/docs" "${d}/paperclip/packages/adapters/claude-local/src" "${d}/paperclip/server/src/services"
  cp -a "${RACINE}/organisation" "${d}/"
  cp -a "${RACINE}/scripts/bootstrap-organisation.py" "${RACINE}/scripts/verifier-organisation.py" "${d}/scripts/"
  cp -a "${RACINE}/paperclip/packages/adapters/claude-local/src/index.ts" "${d}/paperclip/packages/adapters/claude-local/src/"
  cp -a "${RACINE}/paperclip/server/src/services/company-portability.ts" "${d}/paperclip/server/src/services/"
  echo "${d}"
}
attendre_refus() {
  local nom="$1" d="$2" motif="$3"
  if "${PY[@]}" "${d}/scripts/verifier-organisation.py" --racine "${d}" > "${d}.txt" 2>&1; then
    ko "cas négatif « ${nom} » accepté à tort"
  elif grep -q -- "${motif}" "${d}.txt"; then
    ok "cas négatif « ${nom} » refusé (${motif})"
  else
    ko "cas négatif « ${nom} » refusé pour une autre raison"; tail -5 "${d}.txt"
  fi
}

d="$(copie rubrique)"
sed -i 's/^## Limites$/## Remarques/' "${d}/organisation/skills/audit-seo/SKILL.md"
"${PY[@]}" "${d}/scripts/bootstrap-organisation.py" generer > /dev/null
attendre_refus "rubrique Limites absente" "${d}" "rubriques attendues"

d="$(copie hierarchie)"
"${PY[@]}" - "${d}/organisation/registre/agents.json" <<'PY'
import json, sys
p = sys.argv[1]
r = json.load(open(p, encoding="utf-8"))
for a in r["agents"]:
    if a["slug"] == "relecteur":
        a["rapporteA"] = "contenus"
json.dump(r, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
PY
"${PY[@]}" "${d}/scripts/bootstrap-organisation.py" generer > /dev/null
attendre_refus "relecteur subordonné à un producteur" "${d}" "subordonné à un producteur"

d="$(copie modele)"
modifier_registre() {
  "${PY[@]}" - "$1" "$2" <<'PY'
import json, sys
chemin, cas = sys.argv[1], sys.argv[2]
r = json.load(open(chemin, encoding="utf-8"))
veille = next(a for a in r["agents"] if a["slug"] == "veille")
if cas == "fable":
    veille["modele"]["id"] = "claude-fable-5-1"
elif cas == "outils":
    veille["outils"]["recherche"].append("Write")
    veille["outils"]["mutation"].remove("Write")
json.dump(r, open(chemin, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
PY
}
modifier_registre "${d}/organisation/registre/agents.json" fable
"${PY[@]}" "${d}/scripts/bootstrap-organisation.py" generer > /dev/null
attendre_refus "modèle Fable" "${d}" "Fable est suspendu"

d="$(copie outils)"
modifier_registre "${d}/organisation/registre/agents.json" outils
"${PY[@]}" "${d}/scripts/bootstrap-organisation.py" generer > /dev/null
attendre_refus "outil de mutation classé en recherche" "${d}" "outil de mutation classé en recherche"

d="$(copie derive)"
echo "# ajout manuel" >> "${d}/organisation/.paperclip.yaml"
attendre_refus "dérive d'un fichier généré" "${d}" "écart avec le registre"

d="$(copie permission)"
sed -i 's/^metadata:$/allowed-tools: "Bash"\nmetadata:/' "${d}/organisation/skills/charte-marque/SKILL.md"
"${PY[@]}" "${d}/scripts/bootstrap-organisation.py" generer > /dev/null
attendre_refus "compétence qui s'accorde une permission" "${d}" "allowed-tools"

# Connexions de la passerelle : un rôle sans connexion ne reçoit pas les outils de connexion,
# et un rôle avec connexions a des consignes complètes (dépôt de chaque réponse).
d="$(copie connexion-outils)"
"${PY[@]}" - "${d}/organisation/registre/agents.json" <<'PY2'
import json, sys
p = sys.argv[1]
r = json.load(open(p, encoding="utf-8"))
next(a for a in r["agents"] if a["slug"] == "veille")["outils"]["recherche"].append("mcp__paperclip-assigned")
json.dump(r, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
PY2
"${PY[@]}" "${d}/scripts/bootstrap-organisation.py" generer > /dev/null
attendre_refus "outils de connexion sans connexion déclarée" "${d}" "outils de connexion autorisés sans connexion"

d="$(copie connexion-consigne)"
sed -i 's|/donnees-connexion|/donnees|' "${d}/organisation/agents/mesure/AGENTS.md"
"${PY[@]}" "${d}/scripts/bootstrap-organisation.py" generer > /dev/null
attendre_refus "consigne de dépôt des réponses absente" "${d}" "consigne manquante dans AGENTS.md : dépôt"

d="$(copie hygiene)"
printf '\nContact : %s\n' "jean@exemple.be" >> "${d}/organisation/demo/marque.md"
attendre_refus "adresse électronique réelle" "${d}" "adresse électronique non fictive"


# 2b. Verrou d'écriture : un second « appliquer » pendant qu'un autre tient le verrou est refusé
#     avec un message clair, sans rien modifier ; une fois le verrou rendu, il n'est plus refusé
#     pour cette raison (il échoue ensuite sur l'API, volontairement injoignable ici).
DONNEES_TEST="${TRAVAIL}/donnees-verrou"
mkdir -p "${DONNEES_TEST}"
"${PY[@]}" - "${DONNEES_TEST}/.bootstrap-ecriture.lock" > "${TRAVAIL}/detenteur.txt" 2>&1 <<'PY' &
import fcntl, sys, time
f = open(sys.argv[1], "a+")
fcntl.flock(f.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
print("pret", flush=True)
time.sleep(60)
PY
DETENTEUR=$!
for _ in $(seq 1 50); do grep -q pret "${TRAVAIL}/detenteur.txt" 2>/dev/null && break; sleep 0.1; done
ATELIER_DONNEES_LOCALES="${DONNEES_TEST}" ATELIER_API="http://localhost:1/api" \
  "${PY[@]}" "${RACINE}/scripts/bootstrap-organisation.py" appliquer > "${TRAVAIL}/verrou-refus.txt" 2>&1
code_refus=$?
if [[ "${code_refus}" -eq 2 ]] && grep -q "déjà en cours" "${TRAVAIL}/verrou-refus.txt"; then
  ok "verrou : second « appliquer » refusé pendant qu'un verrou est tenu (code 2, message clair)"
else
  ko "verrou : code=${code_refus}"; cat "${TRAVAIL}/verrou-refus.txt"
fi
ATELIER_DONNEES_LOCALES="${DONNEES_TEST}" ATELIER_API="http://localhost:1/api" \
  "${PY[@]}" "${RACINE}/scripts/bootstrap-organisation.py" reinitialiser --confirmer "Rénovation Liège (démonstration)" > "${TRAVAIL}/verrou-refus2.txt" 2>&1
if grep -q "déjà en cours" "${TRAVAIL}/verrou-refus2.txt"; then
  ok "verrou : « reinitialiser » refusé aussi pendant qu'un verrou est tenu"
else
  ko "verrou : reinitialiser non refusé"; cat "${TRAVAIL}/verrou-refus2.txt"
fi
kill "${DETENTEUR}" 2>/dev/null; wait "${DETENTEUR}" 2>/dev/null
ATELIER_DONNEES_LOCALES="${DONNEES_TEST}" ATELIER_API="http://localhost:1/api" \
  "${PY[@]}" "${RACINE}/scripts/bootstrap-organisation.py" appliquer > "${TRAVAIL}/verrou-libre.txt" 2>&1
if ! grep -q "déjà en cours" "${TRAVAIL}/verrou-libre.txt" && grep -q "API injoignable" "${TRAVAIL}/verrou-libre.txt"; then
  ok "verrou : rendu à la fin du détenteur (le lancement suivant n'est plus refusé)"
else
  ko "verrou : non rendu"; cat "${TRAVAIL}/verrou-libre.txt"
fi

# 2c. Lecture sûre du YAML exporté : « on », « yes », « no », clés numériques, « 1:30 », « 0777 »
#     et dates restent du texte ; témoin : PyYAML standard les déforme (le test discrimine).
if "${PY[@]}" - "${RACINE}" > "${TRAVAIL}/yaml.txt" 2>&1 <<'PY'
import importlib.util, sys
from pathlib import Path
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("b", Path(sys.argv[1]) / "scripts" / "bootstrap-organisation.py")
b = importlib.util.module_from_spec(spec); spec.loader.exec_module(b)
import yaml
texte = """on: yes
123: "no"
1:30: 0777
agents:
  x:
    flag: on
    n: 12
    f: 1.5
    t: true
    d: 2026-10-15
    liste: [no, 0x1F, 1_000]
    off: off
"""
sur = b.charger_yaml_sur(texte)
attendu = {"on": "yes", "123": "no", "1:30": "0777",
           "agents": {"x": {"flag": "on", "n": 12, "f": 1.5, "t": True, "d": "2026-10-15",
                            "liste": ["no", 31, "1_000"], "off": "off"}}}
assert sur == attendu, sur
standard = yaml.safe_load(texte)
assert standard != attendu and True in standard and 123 in standard, "le témoin PyYAML devait déformer"
# Aller-retour par l'écriture du paquet : aucune clé ni valeur ne change de sens.
relu = b.charger_yaml_sur(b.yaml_texte_libre(sur))
assert relu == attendu, relu
# Clé en double : refus explicite.
try:
    b.charger_yaml_sur("a: 1\na: 2\n")
    raise SystemExit("clé en double acceptée")
except b.ErreurAtelier:
    pass
print("clés on/123/1:30 et valeurs yes/no/0777/dates conservées en texte, aller-retour identique, doublon refusé")
PY
then
  ok "YAML exporté : $(tail -1 "${TRAVAIL}/yaml.txt")"
else
  ko "YAML exporté"; cat "${TRAVAIL}/yaml.txt"
fi

# 2d. Fichiers Paperclip d'une entreprise : seule l'entreprise visée est supprimée ; un
#     identifiant invalide, un lien symbolique ou un dossier voisin ne sont jamais touchés.
if "${PY[@]}" - "${RACINE}" "${TRAVAIL}" > "${TRAVAIL}/fichiers-entreprise.txt" 2>&1 <<'PY'
import importlib.util, os, sys
from pathlib import Path
racine, travail = Path(sys.argv[1]), Path(sys.argv[2])
home = travail / "home-fichiers"
os.environ["PAPERCLIP_HOME"] = str(home)
os.environ["PAPERCLIP_INSTANCE_ID"] = "atelier-essai"
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("b", racine / "scripts" / "bootstrap-organisation.py")
b = importlib.util.module_from_spec(spec); spec.loader.exec_module(b)
cibles = home / "instances" / "atelier-essai" / "companies"
a, voisine = "11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"
for u in (a, voisine):
    (cibles / u / "agents" / "x" / "instructions").mkdir(parents=True)
    (cibles / u / "agents" / "x" / "instructions" / "AGENTS.md").write_text("x")
print(b.supprimer_fichiers_entreprise(a))
assert not (cibles / a).exists(), "dossier de l'entreprise non supprimé"
assert (cibles / voisine / "agents" / "x" / "instructions" / "AGENTS.md").exists(), "entreprise voisine touchée"
print(b.supprimer_fichiers_entreprise(a))  # déjà absent : sans erreur
for mauvais in ("../..", "..", "", "11111111-1111-4111-8111-11111111111", "/etc"):
    assert b.dossier_fichiers_entreprise(mauvais) is None, mauvais
    assert "ignoré" in b.supprimer_fichiers_entreprise(mauvais)
assert (cibles / voisine).exists()
# Lien symbolique à la place du dossier : refus, cible intacte.
dehors = travail / "dehors"; dehors.mkdir(); (dehors / "garder.txt").write_text("x")
lien = "33333333-3333-4333-8333-333333333333"
(cibles / lien).symlink_to(dehors)
try:
    b.supprimer_fichiers_entreprise(lien)
    raise SystemExit("lien symbolique accepté")
except b.ErreurAtelier:
    pass
assert (dehors / "garder.txt").exists(), "cible du lien supprimée"
print("suppression limitée à l'entreprise visée ; identifiants invalides ignorés ; lien symbolique refusé")
PY
then
  ok "fichiers Paperclip d'entreprise : $(tail -1 "${TRAVAIL}/fichiers-entreprise.txt")"
else
  ko "fichiers Paperclip d'entreprise"; cat "${TRAVAIL}/fichiers-entreprise.txt"
fi


# 3. Isolement des consignes personnelles, sans aucun appel de modèle : le vrai « claude » est lancé
#    dans un dossier situé sous ~, avec une configuration dédiée, une clé
#    factice et ANTHROPIC_BASE_URL vers un serveur local qui enregistre la requête et répond
#    par une erreur. Témoin sans réglage (doit contenir le fichier de consignes globales de l'utilisateur), puis avec les
#    réglages du registre (ne doit plus le contenir).
isolement() {
  local nom="$1" avec_reglages="$2"
  local base="${RACINE}/instance/.test-isolement-$$"
  mkdir -p "${base}/espace" "${base}/config" "${base}/requetes"
  chmod 700 "${base}/config"
  if [[ "${avec_reglages}" -eq 1 ]]; then
    "${PY[@]}" -c 'import json,sys; r=json.load(open(sys.argv[1],encoding="utf-8")); json.dump(r["adaptateur"]["reglagesConfigClaude"], open(sys.argv[2],"w"))'       "${RACINE}/organisation/registre/agents.json" "${base}/config/settings.json"
  fi
  local port
  port="$("${PY[@]}" -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])')"
  "${PY[@]}" - "${base}/requetes" "${port}" <<'PY' &
import http.server, itertools, os, sys
dossier, port = sys.argv[1], int(sys.argv[2])
n = itertools.count()
class H(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        corps = self.rfile.read(int(self.headers.get("Content-Length") or 0))
        open(os.path.join(dossier, f"r{next(n)}.json"), "wb").write(corps)
        self.send_response(400); self.send_header("Content-Type", "application/json"); self.end_headers()
        self.wfile.write(b'{"type":"error","error":{"type":"invalid_request_error","message":"capture locale"}}')
    do_GET = do_POST
    def log_message(self, *a): pass
http.server.HTTPServer(("127.0.0.1", port), H).serve_forever()
PY
  local pid=$!
  sleep 1
  (cd "${base}/espace" && timeout 60 env -i HOME="${HOME}" PATH="${PATH}" LANG=C.UTF-8      CLAUDE_CONFIG_DIR="${base}/config" DISABLE_TELEMETRY=1 CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1      ANTHROPIC_BASE_URL="http://127.0.0.1:${port}" ANTHROPIC_API_KEY=cle-factice-capture-locale      claude -p --permission-mode dontAsk --max-turns 1 "test d'isolement" > /dev/null 2>&1)
  kill "${pid}" 2>/dev/null; wait "${pid}" 2>/dev/null
  local n_req n_perso
  n_req="$(ls "${base}/requetes" | wc -l)"
  n_perso="$(cat "${base}"/requetes/* 2>/dev/null | grep -c 'Contents of [^ ]*/\.claude/CLAUDE\.md')"
  case "${base}" in "${RACINE}"/instance/.test-isolement-*) rm -rf -- "${base}" ;; esac
  echo "${n_req} ${n_perso}"
}
if command -v claude > /dev/null 2>&1 && [[ -f "${HOME}/.claude/CLAUDE.md" ]]; then
  read -r req perso <<< "$(isolement temoin 0)"
  if [[ "${req}" -ge 1 && "${perso}" -ge 1 ]]; then
    ok "isolement, témoin sans réglage : fichier de consignes globales de l'utilisateur présent dans la requête capturée (le test discrimine)"
  else
    ko "isolement, témoin : requêtes=${req}, occurrences=${perso} (le test ne discrimine pas)"
  fi
  read -r req perso <<< "$(isolement reglages 1)"
  if [[ "${req}" -ge 1 && "${perso}" -eq 0 ]]; then
    ok "isolement avec claudeMdExcludes : aucune consigne personnelle dans la requête capturée"
  else
    ko "isolement avec réglages : requêtes=${req}, occurrences=${perso}"
  fi
else
  echo "NON EXÉCUTÉ isolement : commande claude ou fichier de consignes globales absent"
fi

if [[ "${INSTANCE}" -eq 1 ]]; then
  # 4. Idempotence sur l'instance : la deuxième passe ne doit rien écrire.
  if [[ "${REMISE}" -eq 1 ]]; then
    # Identifiant de l'entreprise et dossier de ses fichiers Paperclip AVANT la remise à zéro.
    read -r ID_AVANT DOSSIER_AVANT <<< "$("${PY[@]}" - "${RACINE}" <<'PY'
import importlib.util, sys
from pathlib import Path
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("b", Path(sys.argv[1]) / "scripts" / "bootstrap-organisation.py")
b = importlib.util.module_from_spec(spec); spec.loader.exec_module(b)
api = b.Api(b.url_api())
e = b.trouver_entreprise(api, b.registres()[1])
print(e["id"] if e else "-", b.dossier_fichiers_entreprise(e["id"]) if e else "-")
PY
)"
    if "${PY[@]}" "${RACINE}/scripts/bootstrap-organisation.py" reinitialiser \
         --confirmer "Rénovation Liège (démonstration)" > "${TRAVAIL}/remise.txt" 2>&1; then
      ok "remise à zéro : $(head -1 "${TRAVAIL}/remise.txt")"
    else
      ko "remise à zéro"; cat "${TRAVAIL}/remise.txt"
    fi
    if [[ "${ID_AVANT}" == "-" ]]; then
      echo "NON EXÉCUTÉ suppression des fichiers Paperclip : aucune entreprise avant la remise à zéro (relancer après un premier --instance)"
    elif [[ -d "${DOSSIER_AVANT}" ]]; then
      ko "remise à zéro : les fichiers Paperclip de l'entreprise ${ID_AVANT} subsistent (${DOSSIER_AVANT})"
    else
      ok "remise à zéro : fichiers Paperclip de l'entreprise ${ID_AVANT} supprimés"
    fi
  fi
  for passe in 1 2; do
    if "${PY[@]}" "${RACINE}/scripts/bootstrap-organisation.py" appliquer > "${TRAVAIL}/passe${passe}.txt" 2>&1; then
      ok "bootstrap passe ${passe} : $(grep 'Écritures API totales' "${TRAVAIL}/passe${passe}.txt")"
    else
      ko "bootstrap passe ${passe}"; cat "${TRAVAIL}/passe${passe}.txt"
    fi
  done
  if grep -q 'Écritures API totales : 0$' "${TRAVAIL}/passe2.txt"; then
    ok "idempotence : deuxième passe sans aucune écriture"
  else
    ko "idempotence : la deuxième passe a écrit"
  fi
  if "${PY[@]}" "${RACINE}/scripts/bootstrap-organisation.py" etat > "${TRAVAIL}/etat.txt" 2>&1 \
     && [[ "$(grep -c '^  agent ' "${TRAVAIL}/etat.txt")" -eq 11 ]] \
     && grep -q '  objectifs : 3$' "${TRAVAIL}/etat.txt" \
     && grep -q '  projets : 2$' "${TRAVAIL}/etat.txt" \
     && grep -q '  routines : 3$' "${TRAVAIL}/etat.txt"; then
    ok "état : 11 agents (10 + porte), 3 objectifs, 2 projets, 3 routines (aucun doublon)"
  else
    ko "état inattendu"; cat "${TRAVAIL}/etat.txt"
  fi
  if ! grep -E '^  agent ' "${TRAVAIL}/etat.txt" | grep -vq 'statut=paused'; then
    ok "tous les agents réels sont en pause"
  else
    ko "un agent n'est pas en pause"
  fi


  # 5. Chemin « mise à jour en place » : dérives simulées dans l'interface, puis réalignement.
  if "${PY[@]}" - "${RACINE}" > "${TRAVAIL}/derive.txt" 2>&1 <<'PY'
import importlib.util, io, json, sys, contextlib, argparse
from pathlib import Path
racine = Path(sys.argv[1])
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("b", racine / "scripts" / "bootstrap-organisation.py")
b = importlib.util.module_from_spec(spec); spec.loader.exec_module(b)
api = b.Api(b.url_api())
_, reg_orga = b.registres()
cid = b.trouver_entreprise(api, reg_orga)["id"]
agents = b.agents_par_slug(api, cid)
veille, tech, exig = agents["veille"], agents["tests-techniques"], agents["exigences"]
# Dérives : modèle de Veille, cron d'une routine, instructions d'Exigences ; Tests techniques
# est activé (aucun jeton lié : un réveil éventuel échouerait à l'authentification).
api.appel("PATCH", f"/agents/{veille['id']}", {"adapterConfig": {"model": "claude-opus-5-5"}})
routine = next(r for r in b.routines_existantes(api, cid) if r["title"] == "Veille concurrentielle hebdomadaire")
declencheur = next(t for t in routine["triggers"] if t["kind"] == "schedule")
api.appel("PATCH", f"/routine-triggers/{declencheur['id']}", {"cronExpression": "0 6 * * 2"})
f = api.get(f"/agents/{exig['id']}/instructions-bundle/file?path=AGENTS.md")
api.appel("PUT", f"/agents/{exig['id']}/instructions-bundle/file",
          {"path": "AGENTS.md", "content": f["content"] + "\nLigne ajoutée hors dépôt.", "baseHash": f["contentHash"]})
api.appel("POST", f"/agents/{tech['id']}/resume", {})
try:
    sortie = io.StringIO()
    with contextlib.redirect_stdout(sortie):
        code = b.cmd_appliquer(argparse.Namespace(mode="reel"))
    texte = sortie.getvalue()
    print(texte)
    assert code == 0, "appliquer a échoué"
    assert "configuration modifiée hors registre : veille (adapterConfig.model)" in texte, "dérive du modèle non détectée"
    assert api.get(f"/agents/{veille['id']}")["adapterConfig"]["model"] == "claude-sonnet-5-5", "modèle non rétabli"
    r2 = next(r for r in b.routines_existantes(api, cid) if r["title"] == "Veille concurrentielle hebdomadaire")
    assert next(t for t in r2["triggers"] if t["kind"] == "schedule")["cronExpression"] == "0 8 * * 1", "cron non rétabli"
    contenu = api.get(f"/agents/{exig['id']}/instructions-bundle/file?path=AGENTS.md")["content"]
    assert contenu == b.corps_instructions("exigences"), "instructions non rétablies"
    assert api.get(f"/agents/{tech['id']}")["status"] != "paused", "la mise à jour a remis en pause un agent activé"
    sortie = io.StringIO()
    with contextlib.redirect_stdout(sortie):
        b.cmd_appliquer(argparse.Namespace(mode="reel"))
    assert "Écritures API totales : 0" in sortie.getvalue(), "la passe suivante écrit encore"
    print("dérives détectées et corrigées ; agent activé resté actif ; passe suivante sans écriture")
finally:
    api.appel("POST", f"/agents/{tech['id']}/pause", {})
PY
  then
    ok "mise à jour en place : $(tail -1 "${TRAVAIL}/derive.txt")"
  else
    ko "mise à jour en place"; tail -30 "${TRAVAIL}/derive.txt"
  fi

  # 6. Export natif, contrôle, puis aller-retour d'import dans une entreprise jetable.
  EXPORT="${TRAVAIL}/export"
  if "${PY[@]}" "${RACINE}/scripts/bootstrap-organisation.py" exporter --sortie "${EXPORT}" > "${TRAVAIL}/export.txt" 2>&1 \
     && "${PY[@]}" "${RACINE}/scripts/verifier-organisation.py" --export "${EXPORT}" > "${TRAVAIL}/export-verif.txt" 2>&1; then
    ok "export contrôlé : $(grep 'Aperçu' "${TRAVAIL}/export.txt")"
  else
    ko "export"; cat "${TRAVAIL}/export.txt" "${TRAVAIL}/export-verif.txt"
  fi
  if "${PY[@]}" - "${RACINE}" "${EXPORT}" > "${TRAVAIL}/aller-retour.txt" 2>&1 <<'PY'
import importlib.util, json, sys
from pathlib import Path
racine, export = Path(sys.argv[1]), Path(sys.argv[2])
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("b", racine / "scripts" / "bootstrap-organisation.py")
b = importlib.util.module_from_spec(spec); spec.loader.exec_module(b)
api = b.Api(b.url_api())
nom = "Aller-retour lot B (à supprimer)"
if any(c["name"] == nom for c in api.get("/companies")):
    raise SystemExit("entreprise d'aller-retour déjà présente")
fichiers = {p.relative_to(export).as_posix(): p.read_text(encoding="utf-8")
            for p in export.rglob("*") if p.is_file() and p.suffix in (".md", ".yaml", ".yml", ".json")}
r = api.appel("POST", "/companies/import", {
    "source": {"type": "inline", "files": fichiers, "expectedFileCount": len(fichiers)},
    "include": {"company": True, "agents": True, "projects": True, "issues": True, "skills": True},
    "target": {"mode": "new_company", "newCompanyName": nom},
    "collisionStrategy": "rename", "pauseAutomations": True})
cid = r["company"]["id"]
try:
    agents = api.get(f"/companies/{cid}/agents")
    skills = api.get(f"/companies/{cid}/skills")
    projets = api.get(f"/companies/{cid}/projects")
    routines = api.get(f"/companies/{cid}/routines")
    routines = routines if isinstance(routines, list) else routines.get("items", [])
    print(f"agents={len(agents)} competences={len(skills)} projets={len(projets)} routines={len(routines)}")
    coord = next(a["id"] for a in agents if a["name"] == "Coordinateur")
    hierarchie = {a["name"]: a.get("reportsTo") for a in agents}
    if any(v not in (None, coord) for v in hierarchie.values()):
        raise SystemExit("hiérarchie : un agent rend compte à un autre que le coordinateur")
    # 16 compétences du dépôt + 8 intégrées vendorisées par l'export + 8 réinstallées = 32.
    ok = len(agents) == 11 and len(projets) == 2 and len(routines) == 3 and len(skills) == 32 \
        and all(a.get("status") == "paused" for a in agents)
    print("hiérarchie conservée :", sum(1 for v in hierarchie.values() if v) == 6)
    if not ok or sum(1 for v in hierarchie.values() if v) != 6:
        raise SystemExit("aller-retour incomplet")
finally:
    api.appel("DELETE", f"/companies/{cid}")
    print("entreprise d'aller-retour supprimée :", not any(c["id"] == cid for c in api.get("/companies")))
PY
  then
    ok "aller-retour export puis import : $(head -1 "${TRAVAIL}/aller-retour.txt")"
  else
    ko "aller-retour export puis import"; cat "${TRAVAIL}/aller-retour.txt"
  fi
fi

echo "Bilan : ${reussis} réussi(s), ${echecs} échec(s)."
[[ "${echecs}" -eq 0 ]]
