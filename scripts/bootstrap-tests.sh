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

d="$(copie controleur-coordinateur)"
"${PY[@]}" - "${d}/organisation/registre/agents.json" <<'PY'
import json, sys
p = sys.argv[1]
r = json.load(open(p, encoding="utf-8"))
for a in r["agents"]:
    if a["slug"] == "exigences":
        a["rapporteA"] = "coordinateur"
json.dump(r, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
PY
"${PY[@]}" "${d}/scripts/bootstrap-organisation.py" generer > /dev/null
attendre_refus "contrôleur rattaché au coordinateur" "${d}" "dépend du coordinateur ou d'un producteur"

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
# La route est citée dans le texte du rôle ET dans les consignes communes (recopiées par « generer » sous le marqueur,
# donc seule leur source survit à la régénération) : on retire la mention aux deux endroits.
sed -i 's|/donnees-connexion|/donnees|g' "${d}/organisation/agents/mesure/AGENTS.md" "${d}/organisation/registre/consignes-communes.md"
"${PY[@]}" "${d}/scripts/bootstrap-organisation.py" generer > /dev/null
attendre_refus "consigne de dépôt des réponses absente" "${d}" "consigne manquante dans AGENTS.md : dépôt"

# Contrats v1.5 : dépôt avec les arguments exacts, et parcours complet d'une diffusion réelle.
d="$(copie connexion-arguments)"
sed -i 's|"arguments"|"args"|g' "${d}/organisation/agents/mesure/AGENTS.md"
"${PY[@]}" "${d}/scripts/bootstrap-organisation.py" generer > /dev/null
attendre_refus "dépôt sans les arguments exacts de l'appel" "${d}" "consigne manquante dans AGENTS.md : arguments exacts"

d="$(copie diffusion-preuve)"
sed -i 's|preuve_approbation|preuve|g' "${d}/organisation/agents/crm-conversion/AGENTS.md"
"${PY[@]}" "${d}/scripts/bootstrap-organisation.py" generer > /dev/null
attendre_refus "diffusion réelle sans la preuve jointe à l'appel" "${d}" "consigne de diffusion réelle manquante dans AGENTS.md : preuve jointe"

d="$(copie diffusion-reessai)"
sed -i "s|ne réessaie jamais à l'aveugle|réessaie si besoin|" "${d}/organisation/agents/crm-conversion/AGENTS.md"
"${PY[@]}" "${d}/scripts/bootstrap-organisation.py" generer > /dev/null
attendre_refus "diffusion réelle sans l'interdiction de réessayer à l'aveugle" "${d}" "aucun nouvel essai à l'aveugle"

# Contrats v1.6 (15/10/2026) : l'humain approuve l'empreinte de l'appel exact. Parcours complet exigé des rôles qui écrivent
# (crm-conversion et contenus) : proposition par tache.appels.proposer, liste de révocation récente jointe à l'appel de la
# passerelle, nouvelle approbation si la preuve est expirée ou révoquée, dépôt avec arguments et compte, jamais une réponse
# d'écriture. Chaque cas retire UNE consigne dans une copie et attend le refus du vérificateur.
cas_diffusion_v16() {
  local nom="$1" agent="$2" expression="$3" motif="$4" d
  d="$(copie "v16-${agent}-${nom// /-}")"
  sed -i "${expression}" "${d}/organisation/agents/${agent}/AGENTS.md"
  "${PY[@]}" "${d}/scripts/bootstrap-organisation.py" generer > /dev/null
  attendre_refus "${agent} : ${nom}" "${d}" "agent ${agent} : consigne de diffusion réelle manquante dans AGENTS.md : ${motif}"
}
for agent in crm-conversion contenus; do
  cas_diffusion_v16 "appel non proposé au serveur" "${agent}" 's|/appels`|/propositions`|g' "proposition de l'appel exact"
  cas_diffusion_v16 "empreinte de l'appel non approuvée" "${agent}" 's|empreinte de CET appel|appel|g' "l'humain approuve l'empreinte"
  cas_diffusion_v16 "liste de révocation non lue" "${agent}" 's|/preuves/revocations|/preuves/liste|g' "liste de révocation récente lue juste avant l'appel"
  cas_diffusion_v16 "liste de révocation non jointe" "${agent}" 's|revocations_approbation|revocations|g' "liste de révocation jointe à l'appel d'outil"
  cas_diffusion_v16 "fraîcheur de la liste non dite" "${agent}" 's|5 minutes|quelques minutes|g' "fraîcheur de la liste de révocation"
  cas_diffusion_v16 "preuve expirée ou révoquée sans nouvelle approbation" "${agent}" 's|Preuve expirée ou révoquée : nouvelle approbation|Preuve expirée ou révoquée|g' "preuve expirée ou révoquée : nouvelle approbation de l'humain"
  cas_diffusion_v16 "dépôt sans compte" "${agent}" 's|arguments` et `compte`|arguments`|g' "dépôt de données avec arguments et compte"
  cas_diffusion_v16 "dépôt d'une réponse d'écriture permis" "${agent}" "s|JAMAIS la réponse d'un outil d'écriture|parfois la réponse d'un outil|g" "jamais le dépôt de la réponse d'un outil d'écriture"
done

# Ordre du parcours : la liste de révocation citée avant la proposition de l'appel est refusée.
for agent in crm-conversion contenus; do
  d="$(copie "v16-${agent}-desordre")"
  sed -i '0,/^## Diffusion réelle : parcours complet$/s||## Diffusion réelle : parcours complet\n\nListe lue d'"'"'abord : /preuves/revocations puis revocations_approbation.|' "${d}/organisation/agents/${agent}/AGENTS.md"
  "${PY[@]}" "${d}/scripts/bootstrap-organisation.py" generer > /dev/null
  attendre_refus "${agent} : parcours de diffusion dans le désordre" "${d}" "agent ${agent} : parcours de diffusion réelle dans le désordre"
done

# Décision de l'opérateur du 15/10/2026 : Contenus publie (Facebook, Instagram, LinkedIn) sur approbation de l'appel exact,
# mais jamais de message privé Facebook ; le parcours de diffusion est exigé pour lui comme pour crm-conversion.
d="$(copie message-prive)"
"${PY[@]}" - "${d}/organisation/registre/agents.json" <<'PY3'
import json, sys
p = sys.argv[1]
r = json.load(open(p, encoding="utf-8"))
del next(a for a in r["agents"] if a["slug"] == "contenus")["outilsBloques"]
json.dump(r, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
PY3
"${PY[@]}" "${d}/scripts/bootstrap-organisation.py" generer > /dev/null
attendre_refus "message privé interdit pour Contenus" "${d}" "facebook_envoyer_message doit être bloqué"

d="$(copie contenus-preuve)"
sed -i 's|preuve_approbation|preuve|g' "${d}/organisation/agents/contenus/AGENTS.md"
"${PY[@]}" "${d}/scripts/bootstrap-organisation.py" generer > /dev/null
attendre_refus "Contenus : publication sans la preuve jointe à l'appel" "${d}" "agent contenus : consigne de diffusion réelle manquante dans AGENTS.md : preuve jointe"

d="$(copie diffusion-lecture)"
# Le titre est inséré AVANT le marqueur des consignes communes : tout ce qui le suit est régénéré par « generer ».
sed -i '0,/^<!-- Consignes communes : /s||## Diffusion réelle : parcours complet\n\n&|' "${d}/organisation/agents/mesure/AGENTS.md"
"${PY[@]}" "${d}/scripts/bootstrap-organisation.py" generer > /dev/null
attendre_refus "parcours de diffusion réelle dans un rôle en lecture seule" "${d}" "rôle en lecture seule"

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


# 2e. Sous-commande « assurer-connexions » et « Gardien des connexions » contre une fausse API Paperclip
#     (état en mémoire : aucun serveur réel). On vérifie : réservation d'une connexion ouverte à
#     tous (accès natif, installations, politique « block » d'un rôle en lecture), deuxième passage
#     sans écriture, connexions étrangères ignorées, verrou tenu par « appliquer » (on passe), attente
#     d'un humain devant le Gardien, création et approbation du Gardien, idempotence, dérive
#     réalignée, pause humaine respectée.
if "${PY[@]}" - "${RACINE}" "${TRAVAIL}" > "${TRAVAIL}/gardien.txt" 2>&1 <<'PY'
import contextlib, fcntl, importlib.util, io, json, os, sys, threading, time, urllib.parse
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
racine, travail = Path(sys.argv[1]), Path(sys.argv[2])
sys.dont_write_bytecode = True
reg_agents = json.load(open(racine / "organisation/registre/agents.json", encoding="utf-8"))
reg_orga = json.load(open(racine / "organisation/registre/organisation.json", encoding="utf-8"))
ent = reg_orga["entreprise"]
CID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
ids = {a["slug"]: f"{i:08x}-0000-4000-8000-000000000000" for i, a in enumerate(reg_agents["agents"], 1)}
etat = {"entreprise": True, "agents": {a["slug"]: {"id": ids[a["slug"]], "name": a["nom"], "status": "paused"} for a in reg_agents["agents"]},
        "connexions": {}, "installs": {}, "profils": {}, "politiques": [], "ecritures": [], "approbations": {}, "detail": {}}
def connexion(cx, carte, nom):
    etat["connexions"][cx] = {"id": cx, "status": "active", "name": nom, "config": {"sourceTemplateKey": carte}}
    etat["installs"][cx] = [{"targetType": "company", "targetId": CID}]
    etat["profils"][cx] = {"profileKey": f"app:{cx}", "bindings": [{"targetType": "company", "targetId": CID}],
                           "entries": [{"effect": "include", "selectorType": "catalog_entry", "catalogEntryId": f"{cx}-e1"}]}
class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def rep(self, code, corps):
        brut = json.dumps(corps).encode(); self.send_response(code); self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(brut))); self.end_headers(); self.wfile.write(brut)
    def corps(self):
        n = int(self.headers.get("Content-Length") or 0); return json.loads(self.rfile.read(n) or b"null")
    def do_GET(self):
        u = urllib.parse.urlparse(self.path).path; q = u[len("/api"):]
        if q == "/companies":
            return self.rep(200, [{"id": CID, "name": etat.get("nom", ent["nom"]), "description": etat.get("description", ent["description"])}] if etat["entreprise"] else [])
        if q == f"/companies/{CID}/agents":
            return self.rep(200, [dict(a) for a in etat["agents"].values()])
        if q == f"/companies/{CID}/tools/policies": return self.rep(200, {"policies": etat["politiques"]})
        if q == f"/companies/{CID}/tools/profiles": return self.rep(200, {"profiles": list(etat["profils"].values())})
        if q == f"/companies/{CID}/tools/connections": return self.rep(200, {"connections": list(etat["connexions"].values())})
        if q == f"/companies/{CID}/approvals": return self.rep(200, list(etat["approbations"].values()))
        if q.startswith("/tool-connections/") and q.endswith("/catalog"):
            cx = q.split("/")[2]; return self.rep(200, {"catalog": [{"id": f"{cx}-e1"}]})
        if q.startswith("/tool-connections/") and q.endswith("/installs"):
            return self.rep(200, {"installs": etat["installs"][q.split("/")[2]]})
        if q.startswith("/agents/"): return self.rep(200, etat["detail"][q.split("/")[2]])
        self.rep(404, {"error": q})
    def do_POST(self):
        q = urllib.parse.urlparse(self.path).path[len("/api"):]; c = self.corps(); etat["ecritures"].append(("POST", q))
        if q.startswith(f"/companies/{CID}/tools/apps/") and q.endswith("/finish"):
            cx = q.split("/")[-2]
            etat["profils"][cx]["bindings"] = [{"targetType": "agent", "targetId": i} for i in c["access"]["agentIds"]]
            return self.rep(200, {})
        if q == f"/companies/{CID}/tools/policies":
            etat["politiques"].append(c); return self.rep(201, c)
        if q == f"/companies/{CID}/agent-hires":
            aid = "99999999-0000-4000-8000-000000000000"
            d = dict(c, id=aid, status="pending_approval"); etat["detail"][aid] = d
            etat["agents"][aid] = {"id": aid, "name": c["name"], "status": "pending_approval"}
            etat["approbations"]["ap1"] = {"id": "ap1", "type": "hire_agent", "payload": {"agentId": aid}}
            return self.rep(201, {"agent": {"id": aid, "status": "pending_approval"}, "approval": {"id": "ap1"}})
        if q == "/approvals/ap1/approve":
            aid = etat["approbations"]["ap1"]["payload"]["agentId"]
            etat["detail"][aid]["status"] = "idle"; etat["agents"][aid]["status"] = "idle"; return self.rep(200, {})
        self.rep(404, {"error": q})
    def do_PUT(self):
        q = urllib.parse.urlparse(self.path).path[len("/api"):]; c = self.corps(); etat["ecritures"].append(("PUT", q))
        if q.startswith("/tool-connections/") and q.endswith("/installs"):
            etat["installs"][q.split("/")[2]] = c["installs"]; return self.rep(200, {})
        self.rep(404, {"error": q})
    def do_PATCH(self):
        q = urllib.parse.urlparse(self.path).path[len("/api"):]; c = self.corps(); etat["ecritures"].append(("PATCH", q))
        aid = q.split("/")[2]; etat["detail"][aid].update({k: v for k, v in c.items() if k != "replaceAdapterConfig"})
        # L'API masque l'environnement : on le range tel quel (la comparaison l'ignore).
        self.rep(200, {})
serveur = HTTPServer(("127.0.0.1", 0), H); port = serveur.server_address[1]
threading.Thread(target=serveur.serve_forever, daemon=True).start()
donnees = travail / "donnees-gardien"; donnees.mkdir()
os.environ["ATELIER_API"] = f"http://127.0.0.1:{port}/api"; os.environ["ATELIER_DONNEES_LOCALES"] = str(donnees)
spec = importlib.util.spec_from_file_location("b", racine / "scripts/bootstrap-organisation.py")
b = importlib.util.module_from_spec(spec); spec.loader.exec_module(b)

def lancer(*args):
    sortie = io.StringIO()
    with contextlib.redirect_stdout(sortie), contextlib.redirect_stderr(sortie):
        code = b.main(list(args))
    return code, sortie.getvalue()
def ecritures(): n = len(etat["ecritures"]); return n

# 1. Facebook (rôle Contenus, écriture sur accord sauf message privé) et HubSpot (CRM conversion, écriture sur accord) ouverts à tous.
connexion("cx-fb", "atelier-facebook", "Facebook (démonstration)")
connexion("cx-crm", "atelier-hubspot", "HubSpot (démonstration)")
connexion("cx-autre", "mcp-externe", "Connexion étrangère")  # ni carte ni boucle locale : ignorée
code, sortie = lancer("assurer-connexions")
assert code == 0 and "assurer-connexions : 5 écriture(s) sur 2 connexion(s)" in sortie, (code, sortie)
assert [i["targetId"] for i in etat["installs"]["cx-fb"]] == [ids["contenus"]], etat["installs"]["cx-fb"]
assert [i["targetId"] for i in etat["installs"]["cx-crm"]] == [ids["crm-conversion"]]
assert [x["targetId"] for x in etat["profils"]["cx-fb"]["bindings"]] == [ids["contenus"]], "accès natif non resserré"
assert etat["installs"]["cx-autre"] == [{"targetType": "company", "targetId": CID}], "connexion étrangère modifiée"
blocs = [p["name"] for p in etat["politiques"]]
# Contenus écrit sur accord : seul le message privé est bloqué (par outil) ; CRM : écriture sur accord, aucun « block »
assert blocs == ["atelier-outil-interdit:cx-fb:contenus:facebook_envoyer_message"], blocs
bloc = etat["politiques"][0]
assert bloc["policyType"] == "block" and bloc["selectors"] == {"connectionId": "cx-fb", "toolName": "facebook_envoyer_message"}, bloc
assert bloc["conditions"] == {"actor": {"agentId": ids["contenus"]}}, bloc  # ne touche que Contenus, et pas facebook_publier
print("1. connexions ouvertes à tous réservées aux rôles prévus (accès natif, installations, block par outil du message privé) ; étrangère intacte")
# 2. Idempotence : le battement suivant n'écrit rien.
avant = ecritures()
code, sortie = lancer("assurer-connexions")
assert code == 0 and "0 écriture(s) sur 2 connexion(s)" in sortie and ecritures() == avant, (sortie, ecritures() - avant)
print("2. deuxième passage : aucune écriture")
# 3. Une connexion de plus, ouverte à tous : reprise au passage suivant, sans toucher aux autres.
connexion("cx-ga4", "atelier-google-analytics", "Analytics (démonstration)")
code, sortie = lancer("assurer-connexions")
assert code == 0 and sorted(i["targetId"] for i in etat["installs"]["cx-ga4"]) == sorted([ids["seo-local-geo"], ids["mesure"]]), etat["installs"]["cx-ga4"]
assert sum(1 for p in etat["politiques"] if p["name"].startswith("atelier-lecture-seule:cx-ga4:")) == 2
print("3. connexion ajoutée plus tard : réservée à SEO local GEO et Mesure (lecture seule pour les deux)")
# 4. Verrou tenu par « appliquer » : on passe sans rien écrire (code 0) ; verrou étranger idem.
verrou = open(donnees / ".bootstrap-ecriture.lock", "a+"); fcntl.flock(verrou.fileno(), fcntl.LOCK_EX); verrou.seek(0); verrou.truncate()
verrou.write("appliquer pid=1\n"); verrou.flush()
connexion("cx-ga4", "atelier-google-analytics", "Analytics (démonstration)")  # rouverte à tous
avant = ecritures()
code, sortie = lancer("assurer-connexions")
assert code == 0 and "passage au prochain battement" in sortie and ecritures() == avant, (code, sortie)
print("4. verrou tenu par appliquer : passage sans écriture, code 0")
# 5. Verrou tenu par le Gardien : une écriture humaine ATTEND au lieu d'être refusée.
verrou.seek(0); verrou.truncate(); verrou.write("assurer-connexions pid=2\n"); verrou.flush()
libere = threading.Timer(1.5, lambda: (fcntl.flock(verrou.fileno(), fcntl.LOCK_UN), verrou.close()))
libere.start()
t0 = time.monotonic()
with b.verrou_ecriture("appliquer"):
    attente = time.monotonic() - t0
assert 1.0 <= attente < 10, attente
print(f"5. écriture humaine : attente de {attente:.1f} s derrière le Gardien, puis exécutée")
# 6. Aucune organisation : rien à faire, code 0 ; agent du registre absent : erreur claire, code 2.
etat["entreprise"] = False
code, sortie = lancer("assurer-connexions")
assert code == 0 and "rien à faire" in sortie, (code, sortie)
etat["entreprise"] = True
sauve = etat["agents"].pop("veille")
code, sortie = lancer("assurer-connexions")
assert code == 2 and "agents du registre absents" in sortie and "veille" in sortie, (code, sortie)
etat["agents"]["veille"] = sauve
print("6. sans organisation : rien à faire ; agent du registre absent : erreur claire (code 2)")
# 6b. Lancée par le Gardien, la commande agit sur l'entreprise de l'agent (PAPERCLIP_COMPANY_ID),
#     même si son nom n'est pas celui du registre (seconde entreprise de démonstration) ;
#     une entreprise inconnue est une erreur claire, jamais un repli sur la recherche par nom.
etat["nom"], etat["description"] = "Autre entreprise (démonstration)", "sans le marqueur du registre"
code, sortie = lancer("assurer-connexions")
assert code == 0 and "rien à faire" in sortie, (code, sortie)  # à la main : recherche par nom, rien trouvé
os.environ["PAPERCLIP_COMPANY_ID"] = CID
try:
    code, sortie = lancer("assurer-connexions")
    assert code == 0 and "écriture(s) sur 3 connexion(s)" in sortie, (code, sortie)
    os.environ["PAPERCLIP_COMPANY_ID"] = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
    code, sortie = lancer("assurer-connexions")
    assert code == 2 and "entreprise du Gardien introuvable" in sortie, (code, sortie)
finally:
    del os.environ["PAPERCLIP_COMPANY_ID"]
    del etat["nom"], etat["description"]
print("6b. depuis le Gardien : agit sur sa propre entreprise (PAPERCLIP_COMPANY_ID), quel que soit son nom")
# 7. Définition du Gardien : process, aucun modèle, aucun droit, battement de 60 s, commande fixée.
api = b.Api(os.environ["ATELIER_API"])
voulu = b.corps_gardien(api)
assert voulu["adapterType"] == "process" and "model" not in voulu["adapterConfig"] and voulu["budgetMonthlyCents"] == 0
assert voulu["permissions"] == {"canCreateAgents": False, "canCreateSkills": False}
assert voulu["runtimeConfig"]["heartbeat"]["enabled"] is True and voulu["runtimeConfig"]["heartbeat"]["intervalSec"] == 60
assert voulu["adapterConfig"]["args"][-1] == "assurer-connexions" and voulu["adapterConfig"]["args"][0] == "-I"
assert voulu["adapterConfig"]["env"]["ATELIER_API"] == api.base
print("7. définition du Gardien : process sans modèle, permissions nulles, battement 60 s, commande assurer-connexions")
# 8. Création (embauche + approbation), idempotence, dérive réalignée, pause respectée.
ecr, msg = b.assurer_gardien(api, CID)
assert ecr == 2 and msg == "créé et approuvé" and etat["agents"]["99999999-0000-4000-8000-000000000000"]["status"] == "idle", (ecr, msg)
avant = ecritures()
ecr, msg = b.assurer_gardien(api, CID)
assert (ecr, msg) == (0, "conforme") and ecritures() == avant, (ecr, msg)
aid = "99999999-0000-4000-8000-000000000000"
etat["detail"][aid]["runtimeConfig"]["heartbeat"]["intervalSec"] = 3600  # dérive faite dans l'interface
etat["detail"][aid]["permissions"] = {"canCreateAgents": True, "canCreateSkills": False}
ecr, msg = b.assurer_gardien(api, CID)
assert msg.startswith("réaligné") and "heartbeat.intervalSec" in msg, msg
assert etat["detail"][aid]["runtimeConfig"]["heartbeat"]["intervalSec"] == 60
assert ("PATCH", f"/agents/{aid}/permissions") in etat["ecritures"], "permissions non réalignées"
etat["detail"][aid]["status"] = "paused"
avant = ecritures()
ecr, msg = b.assurer_gardien(api, CID)
assert "EN PAUSE" in msg and etat["detail"][aid]["status"] == "paused", msg
assert not any(w[1].endswith("/resume") for w in etat["ecritures"]), "le Gardien en pause a été réactivé"
print("8. Gardien : créé et approuvé, idempotent, dérive réalignée (battement, permissions), pause humaine respectée")
# 9. Le Gardien n'est pas un « agent hors registre ».
assert b.GARDIEN_SLUG not in {a["slug"] for a in reg_agents["agents"]}
print("assurer-connexions et Gardien : 10 vérifications contre une fausse API, toutes réussies")
PY
then
  ok "assurer-connexions et Gardien des connexions : $(tail -1 "${TRAVAIL}/gardien.txt")"
else
  ko "assurer-connexions et Gardien des connexions"; tail -30 "${TRAVAIL}/gardien.txt"
fi


# 2f. Sous-commande « cles » contre une fausse API Paperclip (secrets et configuration du plugin en
#     mémoire, vrai openssl). On vérifie : à blanc sans écriture, création des deux paires, droits 0600,
#     cohérence de chaque paire (signature openssl vérifiée avec la clé publique enregistrée), configuration
#     du plugin et de la passerelle, idempotence, réparation des droits, rotation en trois temps des deux clés,
#     refus clairs, et qu'AUCUNE sortie ne contient une clé privée.
if "${PY[@]}" - "${RACINE}" "${TRAVAIL}" > "${TRAVAIL}/cles.txt" 2>&1 <<'PY'
import base64, contextlib, importlib.util, io, json, os, re, stat, subprocess, sys, threading, urllib.parse
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
racine, travail = Path(sys.argv[1]), Path(sys.argv[2])
sys.dont_write_bytecode = True
reg_orga = json.load(open(racine / "organisation/registre/organisation.json", encoding="utf-8"))
ent = reg_orga["entreprise"]
CID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
CID2 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"  # seconde entreprise (un client de plus)
etat = {"secrets": {}, "config": {}, "ecritures": [], "n": 0, "plugin": True}
class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def rep(self, code, corps):
        brut = json.dumps(corps).encode(); self.send_response(code); self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(brut))); self.end_headers(); self.wfile.write(brut)
    def corps(self):
        n = int(self.headers.get("Content-Length") or 0); return json.loads(self.rfile.read(n) or b"null")
    def do_GET(self):
        u = urllib.parse.urlparse(self.path); q = u[2][len("/api"):]
        if q == "/companies": return self.rep(200, [{"id": CID, "name": ent["nom"], "description": ent["description"]}, {"id": CID2, "name": "Second client", "description": ""}])
        m = re.fullmatch(r"/companies/([^/]+)/secrets", q)
        if m:  # la liste ne renvoie JAMAIS la valeur
            return self.rep(200, [{k: v for k, v in s.items() if k != "value"} for s in etat["secrets"].values() if s["companyId"] == m.group(1)])
        if q == "/plugins/atelier.marketing-ia/config":
            if not etat["plugin"]: return self.rep(404, {"error": "Plugin not found"})
            cible = urllib.parse.parse_qs(u[4])["companyId"][0]
            return self.rep(200, etat["config"].get(cible))
        self.rep(404, {"error": q})
    def do_POST(self):
        q = urllib.parse.urlparse(self.path)[2][len("/api"):]; c = self.corps(); etat["ecritures"].append(("POST", q))
        m = re.fullmatch(r"/companies/([^/]+)/secrets", q)
        if m:
            etat["n"] += 1; sid = f"{etat['n']:08x}-0000-4000-8000-000000000000"
            etat["secrets"][sid] = {"id": sid, "companyId": m.group(1), "key": c["key"], "name": c["name"], "value": c["value"]}
            return self.rep(201, {k: v for k, v in etat["secrets"][sid].items() if k != "value"})
        if q == "/plugins/atelier.marketing-ia/config":
            assert c["companyId"] in (CID, CID2) and isinstance(c["configJson"], dict)
            ref = c["configJson"].get("approbationClePrivee")
            if ref is not None:  # comme le serveur : la référence doit viser un secret actif DE CETTE entreprise
                assert ref["type"] == "secret_ref" and etat["secrets"][ref["secretId"]]["companyId"] == c["companyId"], ref
            assert len(c["configJson"].get("passerelleClesPubliques", [])) <= 5
            etat["config"][c["companyId"]] = {"companyId": c["companyId"], "configJson": c["configJson"]}
            return self.rep(200, etat["config"][c["companyId"]])
        self.rep(404, {"error": q})
    def do_DELETE(self):
        q = urllib.parse.urlparse(self.path)[2][len("/api"):]; etat["ecritures"].append(("DELETE", q))
        sid = q.split("/")[2]
        if sid not in etat["secrets"]: return self.rep(404, {"error": "Secret not found"})
        del etat["secrets"][sid]; return self.rep(200, {"ok": True})
serveur = HTTPServer(("127.0.0.1", 0), H); port = serveur.server_address[1]
threading.Thread(target=serveur.serve_forever, daemon=True).start()
donnees = travail / "donnees-cles"; donnees.mkdir()
os.environ["ATELIER_API"] = f"http://127.0.0.1:{port}/api"; os.environ["ATELIER_DONNEES_LOCALES"] = str(donnees)
spec = importlib.util.spec_from_file_location("b", racine / "scripts/bootstrap-organisation.py")
b = importlib.util.module_from_spec(spec); spec.loader.exec_module(b)
sorties = []
def lancer(*args):
    sortie = io.StringIO()
    with contextlib.redirect_stdout(sortie), contextlib.redirect_stderr(sortie):
        code = b.main(list(args))
    sorties.append(sortie.getvalue()); return code, sortie.getvalue()
def droits(chemin): return stat.S_IMODE(os.stat(chemin).st_mode)
def pub_de_pem(pem: str) -> str:
    der = subprocess.run(["openssl", "pkey", "-pubout", "-outform", "DER"], input=pem.encode(), capture_output=True, check=True).stdout
    return base64.b64encode(der).decode()
def signer_verifier(pem: str, publique_b64: str) -> bool:
    """Signe avec la privée (openssl), vérifie avec la publique ENREGISTRÉE : la paire est cohérente."""
    t = travail / "msg-cles"; t.write_bytes(b"essai de coherence")
    cle = travail / "cle-cles.pem"; cle.write_text(pem); cle.chmod(0o600)
    sig = subprocess.run(["openssl", "pkeyutl", "-sign", "-rawin", "-inkey", str(cle), "-in", str(t)], capture_output=True, check=True).stdout
    pubpem = subprocess.run(["openssl", "pkey", "-pubin", "-inform", "DER"], input=base64.b64decode(publique_b64), capture_output=True, check=True).stdout
    (travail / "pub-cles.pem").write_bytes(pubpem); (travail / "sig-cles").write_bytes(sig)
    r = subprocess.run(["openssl", "pkeyutl", "-verify", "-rawin", "-pubin", "-inkey", str(travail / "pub-cles.pem"), "-in", str(t), "-sigfile", str(travail / "sig-cles")], capture_output=True)
    cle.unlink(); return r.returncode == 0
D = donnees / "cles"
def etat_cles(): return json.loads((D / "etat-cles.json").read_text())
def appr(cid=CID): return etat_cles()["approbation"][cid]
def cfg(cid=CID): return etat["config"][cid]["configJson"]
def valeur_secret(sid): return etat["secrets"][sid]["value"]

# 0. Plugin absent : message clair, rien d'écrit.
etat["plugin"] = False
code, s = lancer("cles")
assert code == 2 and "introuvable" in s and not etat["ecritures"], (code, s)
etat["plugin"] = True
# 1. À blanc : aucune écriture, aucun fichier.
code, s = lancer("cles")
assert code == 0 and "à blanc" in s and not etat["ecritures"] and not D.exists(), (code, s)
print("1. à blanc : état affiché, aucune écriture (API ni fichiers)")
# 2. Création.
code, s = lancer("cles", "--confirmer")
assert code == 0, s
assert len(etat["secrets"]) == 1 and next(iter(etat["secrets"].values()))["key"] == "atelier-approbation-cle-privee"
sid = next(iter(etat["secrets"]))
assert valeur_secret(sid).startswith("-----BEGIN PRIVATE KEY-----"), "secret : PEM PKCS#8 attendu"
for f in ("passerelle-signature.pem", "approbation-publiques.pub", "etat-cles.json"):
    assert droits(D / f) == 0o600, (f, oct(droits(D / f)))
assert droits(D) == 0o700 and droits(donnees / "passerelle.env") == 0o600
assert not any((D / f).exists() for f in os.listdir(D) if "approbation" in f and f.endswith(".pem")), "clé privée d'approbation écrite sur disque"
pub_appr = (D / "approbation-publiques.pub").read_text().split()
assert len(pub_appr) == 1 and pub_appr[0] == pub_de_pem(valeur_secret(sid)), "clé publique d'approbation incohérente avec le secret"
assert signer_verifier(valeur_secret(sid), pub_appr[0]), "paire d'approbation incohérente"
pem_pass = (D / "passerelle-signature.pem").read_text()
assert "ED25519" in subprocess.run(["openssl", "pkey", "-text", "-noout"], input=pem_pass.encode(), capture_output=True).stdout.decode().upper()
assert cfg()["passerelleClesPubliques"] == [pub_de_pem(pem_pass)], cfg()
assert signer_verifier(pem_pass, cfg()["passerelleClesPubliques"][0]), "paire de la passerelle incohérente"
assert cfg()["approbationClePrivee"] == {"type": "secret_ref", "secretId": sid}
env = (donnees / "passerelle.env").read_text()
assert f"PASSERELLE_SIGNATURE_CLE_PRIVEE_FICHIER={D / 'passerelle-signature.pem'}" in env and f"PASSERELLE_APPROBATION_CLE_PUBLIQUE_FICHIER={D / 'approbation-publiques.pub'}" in env
print("2. création : secret natif PKCS#8, fichiers 0600 dans un dossier 0700, paires cohérentes (signature openssl vérifiée), configuration du plugin et de la passerelle")
# 3. Idempotence.
avant = len(etat["ecritures"]); empreintes = (D / "passerelle-signature.pem").read_bytes()
code, s = lancer("cles", "--confirmer")
assert code == 0 and "Rien à faire" in s and "Redémarrez" not in s and len(etat["ecritures"]) == avant and (D / "passerelle-signature.pem").read_bytes() == empreintes, (code, s)
print("3. deuxième passage : aucune écriture, clés inchangées")
# 4. Droits trop larges réparés ; configuration du plugin effacée à la main : refaite sans nouvelle clé.
os.chmod(D / "passerelle-signature.pem", 0o644)
etat["config"][CID] = {"companyId": CID, "configJson": {"autre": 1}}
code, s = lancer("cles", "--confirmer")
assert code == 0 and droits(D / "passerelle-signature.pem") == 0o600 and cfg()["autre"] == 1 and cfg()["approbationClePrivee"]["secretId"] == sid and len(etat["secrets"]) == 1, (code, s)
assert "Redémarrez" in s
print("4. droits ramenés à 0600 ; configuration du plugin reconstituée sans toucher à ses autres clés ni créer de secret")
# 4 bis. Un second client : son propre secret et sa propre clé d'approbation, la clé de la passerelle est commune.
code, s = lancer("cles", "--confirmer", "--entreprise", CID2)
assert code == 0 and len(etat["secrets"]) == 2 and cfg(CID2)["passerelleClesPubliques"] == cfg()["passerelleClesPubliques"], (code, s)
sid2 = cfg(CID2)["approbationClePrivee"]["secretId"]
assert sid2 != sid and etat["secrets"][sid2]["companyId"] == CID2 and appr(CID2)["actif"]["secretId"] == sid2
assert len((D / "approbation-publiques.pub").read_text().split()) == 2 and (D / "approbation-publiques.pub").read_text().split()[1] == pub_de_pem(valeur_secret(sid2))
assert pub_de_pem(valeur_secret(sid2)) != pub_de_pem(valeur_secret(sid)), "deux entreprises, deux clés distinctes"
avant = len(etat["ecritures"]); code, s = lancer("cles", "--confirmer", "--entreprise", CID2)
assert code == 0 and "Rien à faire" in s and len(etat["ecritures"]) == avant
print("4b. seconde entreprise : son secret et sa clé d'approbation propres, clé de la passerelle commune, idempotent")
# 5. Rotation de la clé de la passerelle en trois temps.
ancienne_pub = etat_cles()["passerelle"]["actif"]["publique"]
code, s = lancer("cles", "--confirmer", "--rotation", "passerelle")
assert code == 0 and len(cfg()["passerelleClesPubliques"]) == 2 and cfg()["passerelleClesPubliques"][0] == ancienne_pub, (code, s)
assert cfg(CID2)["passerelleClesPubliques"] == cfg()["passerelleClesPubliques"], "la seconde entreprise doit aussi faire confiance à la nouvelle clé"
assert droits(D / "passerelle-signature.suivante.pem") == 0o600 and pub_de_pem((D / "passerelle-signature.pem").read_text()) == ancienne_pub
code, s = lancer("cles", "--confirmer", "--rotation", "passerelle")
assert code == 2 and "déjà préparée" in s
code, s = lancer("cles", "--confirmer", "--basculer", "passerelle")
nouvelle_pub = etat_cles()["passerelle"]["actif"]["publique"]
assert code == 0 and nouvelle_pub != ancienne_pub and pub_de_pem((D / "passerelle-signature.pem").read_text()) == nouvelle_pub
assert not (D / "passerelle-signature.suivante.pem").exists() and ancienne_pub in cfg()["passerelleClesPubliques"], "l'ancienne clé publique doit rester vérifiable"
code, s = lancer("cles", "--confirmer", "--retirer-anciennes")
assert code == 0 and cfg()["passerelleClesPubliques"] == [nouvelle_pub] and cfg(CID2)["passerelleClesPubliques"] == [nouvelle_pub], cfg()
assert signer_verifier((D / "passerelle-signature.pem").read_text(), nouvelle_pub)
avant = len(etat["ecritures"]); code, s = lancer("cles", "--confirmer", "--retirer-anciennes")
assert code == 0 and "aucune ancienne clé" in s and len(etat["ecritures"]) == avant
print("5. rotation passerelle : nouvelle clé publique ajoutée AVANT tout retrait, bascule, puis retrait de l'ancienne (et rien à retirer ensuite)")
# 6. Rotation de la clé d'approbation en trois temps.
ancien_secret = sid; ancienne_ligne = (D / "approbation-publiques.pub").read_text().split()[0]
ligne_autre = (D / "approbation-publiques.pub").read_text().split()[1]  # clé de la seconde entreprise : ne doit jamais bouger
code, s = lancer("cles", "--confirmer", "--rotation", "approbation")
lignes = (D / "approbation-publiques.pub").read_text().split()
assert code == 0 and len(lignes) == 3 and lignes[0] == ancienne_ligne and len(etat["secrets"]) == 3 and cfg()["approbationClePrivee"]["secretId"] == ancien_secret, (code, s)
assert "Redémarrez" in s
lignes = [lignes[0], lignes[2]]  # ancienne et nouvelle de la première entreprise
nouveau_secret = appr()["suivant"]["secretId"]
assert nouveau_secret != ancien_secret and lignes[1] == pub_de_pem(valeur_secret(nouveau_secret))
code, s = lancer("cles", "--confirmer", "--basculer", "approbation")
assert code == 0 and cfg()["approbationClePrivee"]["secretId"] == nouveau_secret and ancien_secret in etat["secrets"], (code, s)
code, s = lancer("cles", "--confirmer", "--retirer-anciennes")
assert code == 0 and (D / "approbation-publiques.pub").read_text().split() == [ligne_autre, lignes[1]] and sorted(etat["secrets"]) == sorted([nouveau_secret, sid2]), (code, s)
assert ("DELETE", f"/secrets/{ancien_secret}") in etat["ecritures"]
assert signer_verifier(valeur_secret(nouveau_secret), lignes[1])
print("6. rotation approbation : nouvelle clé publique ajoutée au fichier avant la bascule, référence changée, puis ancienne clé et ancien secret retirés")
# 7. Refus clairs.
code, s = lancer("cles", "--confirmer", "--basculer", "approbation")
assert code == 2 and "aucune rotation préparée" in s
sauve = (D / "approbation-publiques.pub").read_text()
os.unlink(D / "approbation-publiques.pub")
code, s = lancer("cles", "--confirmer")
assert code == 2 and "ne contient plus" in s
(D / "approbation-publiques.pub").write_text(sauve); os.chmod(D / "approbation-publiques.pub", 0o600)
os.replace(D / "passerelle-signature.pem", D / "ailleurs.pem")
code, s = lancer("cles", "--confirmer")
assert code == 2 and "a disparu" in s
print("7. refus clairs : rotation non préparée, fichier public perdu, fichier privé perdu")
# 8. Aucune sortie ne contient de clé privée ni le contenu d'un secret.
tout = "\n".join(sorties)
assert "PRIVATE" not in tout and "BEGIN" not in tout, "clé privée dans une sortie"
for s_ in list(etat["secrets"].values()) + [{"value": pem_pass}]:
    corps = [l for l in s_["value"].splitlines() if not l.startswith("-----")]
    assert all(l not in tout for l in corps), "contenu de clé privée dans une sortie"
print("8. aucune sortie (ni message d'erreur) ne contient une clé privée")
print("cles : 10 vérifications contre une fausse API et un vrai openssl, toutes réussies")
PY
then
  ok "cles : $(tail -1 "${TRAVAIL}/cles.txt")"
else
  ko "cles"; tail -30 "${TRAVAIL}/cles.txt"
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
    qualite = next(a["id"] for a in agents if a["name"] == "Relecteur")
    hierarchie = {a["name"]: a.get("reportsTo") for a in agents}
    # Deux branches : 7 producteurs -> Coordinateur ; Exigences, Tests techniques, Porte -> Responsable qualité (Relecteur).
    attendu = {n: coord for n in ("Veille", "Prospection", "Mesure", "Contenus", "SEA", "SEO local GEO", "CRM conversion")}
    attendu.update({n: qualite for n in ("Exigences", "Tests techniques", "Porte")})
    attendu.update({"Coordinateur": None, "Relecteur": None})
    if hierarchie != attendu:
        raise SystemExit(f"hiérarchie : écart avec les deux branches attendues : {hierarchie}")
    # 19 compétences du dépôt + 8 intégrées vendorisées par l'export + 8 réinstallées = 35 (lot P10 : +3).
    ok = len(agents) == 12 and len(projets) == 2 and len(routines) == 3 and len(skills) == 35 \
        and all(a.get("status") == "paused" for a in agents)
    print("hiérarchie conservée :", sum(1 for v in hierarchie.values() if v) == 10)
    if not ok or sum(1 for v in hierarchie.values() if v) != 10:
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

# Permissions des agents claude_local (revue de sécurité du 16/10/2026) : jamais de règle sans
# chemin en mode dontAsk, refus des secrets, mémoire automatique coupée.
if "${PY[@]}" - "${RACINE}" > "${TRAVAIL}/permissions.txt" 2>&1 <<'PY'
import importlib.util, json, re, sys
from pathlib import Path
racine = Path(sys.argv[1])
spec = importlib.util.spec_from_file_location("bootstrap", racine / "scripts" / "bootstrap-organisation.py")
mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
reg = json.loads((racine / "organisation/registre/agents.json").read_text(encoding="utf-8"))
nus = {"Read", "Grep", "Glob", "Write", "Edit", "Write(./**)"}
for agent in reg["agents"]:
    if agent.get("deterministe"):
        continue
    args = mod.arguments_outils(agent, reg["adaptateur"])
    autorises = args[args.index("--allowedTools") + 1:args.index("--disallowedTools")]
    nus_presents = [a for a in autorises if a in nus]
    if nus_presents:
        raise SystemExit(f"{agent['slug']} : règle sans chemin dans allowedTools : {nus_presents}")
reglages = mod.reglages_agent(reg, racine / "instance" / "claude-config" / "essai")
if reglages.get("autoMemoryEnabled") is not False:
    raise SystemExit("autoMemoryEnabled doit valoir false")
refus = reglages["permissions"]["deny"]
for motif in ("Read(~/.ssh/**)", "Read(~/.claude/**)", "Read(~/.config/**)", "Edit(~/.claude.json)", "Read(**/*.env)"):
    if motif not in refus:
        raise SystemExit(f"refus manquant : {motif}")
if not any(r.startswith("Read(//") and r.endswith("/instances/*/secrets/**)") for r in refus):
    raise SystemExit("refus des secrets d'instance manquant")
print("aucune règle nue ; refus et mémoire automatique coupée présents")
PY
then
  ok "permissions des agents : $(tail -1 "${TRAVAIL}/permissions.txt")"
else
  ko "permissions des agents"; cat "${TRAVAIL}/permissions.txt"
fi

echo "Bilan : ${reussis} réussi(s), ${echecs} échec(s)."
[[ "${echecs}" -eq 0 ]]
