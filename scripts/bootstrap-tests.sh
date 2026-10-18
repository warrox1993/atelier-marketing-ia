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
# La route est citée dans le texte du rôle ET dans le complément marketing des consignes communes (recopié par « generer »
# sous le marqueur, donc seule sa source survit à la régénération) : on retire la mention aux deux endroits.
sed -i 's|/donnees-connexion|/donnees|g' "${d}/organisation/agents/mesure/AGENTS.md" "${d}/organisation/consignes/marketing.md"
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
printf '\nContact : %s\n' "jean@exemple.be" >> "${d}/organisation/COMPANY.md"
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


# Faux psql pour « exporter --entreprise » (tables du socle : activity_log, approvals, cost_events). Il lit le script SQL sur
# l'entrée standard, exige « BEGIN READ ONLY » et l'identifiant d'entreprise, rend une ligne JSON par table, et journalise
# ses appels (FAUX_PSQL_JOURNAL). FAUX_PSQL_MODE : « compte_faux » (compte différent des lignes) ou « echec » (code 1).
cat > "${TRAVAIL}/faux-psql.py" <<'FAUXPSQL'
import json, os, re, sys
script = sys.stdin.read()
j = os.environ.get("FAUX_PSQL_JOURNAL")
if j:
    open(j, "a").write(json.dumps({"argv": sys.argv[1:], "script": script, "pgpassword": os.environ.get("PGPASSWORD")}) + "\n")
mode = os.environ.get("FAUX_PSQL_MODE", "")
if mode == "echec":
    sys.stderr.write("faux psql : connexion refusée\n"); sys.exit(1)
if not script.startswith("BEGIN READ ONLY") or not script.rstrip().endswith("COMMIT;"):
    sys.stderr.write("faux psql : transaction en lecture seule exigée\n"); sys.exit(3)
if re.search(r"\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE)\b", script):
    sys.stderr.write("faux psql : écriture interdite\n"); sys.exit(4)
cid = re.search(r"company_id = '([0-9a-f-]{36})'", script).group(1)
tailles = {"activity_log": 5, "approvals": 2, "cost_events": 3}
for t in re.findall(r"'table', '(\w+)'", script):
    n = tailles[t]
    lignes = [{"id": f"{t}-{i}", "company_id": cid, "detail": "x"} for i in range(n)]
    print(json.dumps({"table": t, "compte": n + (1 if mode == "compte_faux" else 0), "lignes": lignes}))
FAUXPSQL
export ATELIER_PSQL="python3 -I ${TRAVAIL}/faux-psql.py"

# 2g. Sous-commande « nouveau-client » contre une fausse API Paperclip (entreprises, plugin et budgets en
#     mémoire ; l'application de l'organisation des agents, déjà couverte par ailleurs, est remplacée par une
#     doublure qui crée l'entreprise comme l'import natif). On vérifie : fiche valide à blanc (écritures listées,
#     aucune écriture réelle), BCE invalide et courtier sans FSMA refusés (code non nul, aucun appel d'API),
#     mode réel sans --reel refusé, création, deuxième passage sans aucune création ni réécriture (budget,
#     référentiel), et refus d'une entreprise du client qui appartient à la démonstration.
if "${PY[@]}" - "${RACINE}" "${TRAVAIL}" > "${TRAVAIL}/nouveau-client.txt" 2>&1 <<'PY'
import contextlib, copy, importlib.util, io, json, os, re, sys, threading, urllib.parse
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
racine, travail = Path(sys.argv[1]), Path(sys.argv[2])
sys.dont_write_bytecode = True
reg_orga = json.load(open(racine / "organisation/registre/organisation.json", encoding="utf-8"))
ent = reg_orga["entreprise"]
etat = {"societes": [], "requetes": [], "ecritures": [], "creations": 0, "marques": {}, "appels_coeur": 0}
class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def rep(self, code, corps):
        brut = json.dumps(corps).encode(); self.send_response(code); self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(brut))); self.end_headers(); self.wfile.write(brut)
    def corps(self):
        n = int(self.headers.get("Content-Length") or 0); return json.loads(self.rfile.read(n) or b"null")
    def do_GET(self):
        q = urllib.parse.urlparse(self.path)[2][len("/api"):]; etat["requetes"].append(("GET", q))
        if q == "/companies": return self.rep(200, etat["societes"])
        if q == "/plugins/atelier.marketing-ia": return self.rep(200, {"pluginKey": "atelier.marketing-ia", "status": "ready"})
        self.rep(404, {"error": q})
    def do_POST(self):
        q = urllib.parse.urlparse(self.path)[2][len("/api"):]; c = self.corps(); etat["requetes"].append(("POST", q))
        m = re.fullmatch(r"/plugins/atelier.marketing-ia/data/atelier.marque", q)
        if m:  # lecture seule : pas une écriture
            return self.rep(200, {"data": {"marque": etat["marques"].get(c["companyId"])}})
        etat["ecritures"].append(("POST", q))
        if q == "/plugins/atelier.marketing-ia/actions/atelier.marque.enregistrer":
            cid = c["companyId"]; ancienne = etat["marques"].get(cid)
            # Comme le serveur : version, identifiant et valeurs par défaut ajoutés à la saisie.
            marque = {**copy.deepcopy(c["params"]), "id": "x", "companyId": cid, "version": (ancienne["version"] + 1) if ancienne else 1, "creeLe": "2026-10-16T08:00:00.000Z"}
            marque["offres"] = [{**o, "argumentsValides": []} for o in marque["offres"]]
            etat["marques"][cid] = marque
            return self.rep(200, {"data": marque})
        self.rep(404, {"error": q})
    def do_PATCH(self):
        q = urllib.parse.urlparse(self.path)[2][len("/api"):]; c = self.corps(); etat["ecritures"].append(("PATCH", q))
        m = re.fullmatch(r"/companies/([^/]+)/budgets", q)
        if m:
            for s_ in etat["societes"]:
                if s_["id"] == m.group(1): s_["budgetMonthlyCents"] = c["budgetMonthlyCents"]; return self.rep(200, s_)
        self.rep(404, {"error": q})
serveur = HTTPServer(("127.0.0.1", 0), H); port = serveur.server_address[1]
threading.Thread(target=serveur.serve_forever, daemon=True).start()
donnees = travail / "donnees-client"; donnees.mkdir()
os.environ["ATELIER_API"] = f"http://127.0.0.1:{port}/api"; os.environ["ATELIER_DONNEES_LOCALES"] = str(donnees)
spec = importlib.util.spec_from_file_location("b", racine / "scripts/bootstrap-organisation.py")
b = importlib.util.module_from_spec(spec); spec.loader.exec_module(b)

def coeur_double(api, reg_agents, reg_client, fichiers, mode, dossier_etat):
    """Doublure de appliquer_organisation : crée l'entreprise du client comme l'import natif, ou la retrouve."""
    etat["appels_coeur"] += 1
    e = reg_client["entreprise"]
    assert e["marqueur"].startswith("atelier-client:") and e["nom"] != ent["nom"], e
    assert "COMPANY.md" in fichiers and ent["nom"] not in fichiers["COMPANY.md"] and e["marqueur"] in fichiers["COMPANY.md"], "COMPANY.md du client"
    assert all(ent["nom"] not in o["titre"] for o in reg_client["objectifs"])
    slug = e["slug"]
    assert dossier_etat.name == slug and dossier_etat.parent.name == "atelier-client", dossier_etat
    trouvee = b.trouver_entreprise(api, reg_client)
    if trouvee is None:
        etat["creations"] += 1
        trouvee = {"id": f"{etat['creations']:08x}-0000-4000-8000-000000000000", "name": e["nom"], "description": e["description"], "budgetMonthlyCents": 0}
        etat["societes"].append(trouvee)
    assert trouvee["id"] in str(b.dossiers_agent(trouvee["id"], "coordinateur")[0]), "dossiers locaux propres à l'entreprise du client"
    return trouvee["id"]
b.appliquer_organisation = coeur_double

avant_lancement = [0]
def lancer(*args):
    avant_lancement[0] = len(etat["requetes"])
    sortie = io.StringIO()
    with contextlib.redirect_stdout(sortie), contextlib.redirect_stderr(sortie):
        code = b.main(list(args))
    return code, sortie.getvalue()
def ecrire_fiche(nom, modif=None):
    f = json.load(open(racine / "organisation/modeles/fiche-client.exemple.json", encoding="utf-8"))
    if modif: modif(f)
    chemin = travail / nom; chemin.write_text(json.dumps(f, ensure_ascii=False), encoding="utf-8"); return str(chemin)
def sans_appel():
    """Le dernier lancement n'a pas touché l'API (refus avant tout appel) et rien n'a jamais été écrit."""
    assert len(etat["requetes"]) == avant_lancement[0] and not etat["ecritures"] and etat["appels_coeur"] == 0, etat

valide = ecrire_fiche("fiche-valide.json")
# 1. Fiche valide à blanc : écritures listées, rien d'écrit (le modèle du dépôt est lui-même une fiche valide).
code, s = lancer("nouveau-client", "--fiche", str(racine / "organisation/modeles/fiche-client.exemple.json"), "--a-blanc")
assert code == 0 and "À blanc" in s and "créer l'entreprise" in s and "budget IA mensuel" in s and "référentiel de marque" in s and "intermediaire_assurance" in s, (code, s)
assert not etat["ecritures"] and etat["creations"] == 0 and etat["appels_coeur"] == 0, etat
print("1. fiche valide à blanc : écritures prévues listées (entreprise, organisation, budget, référentiel), aucune écriture")
# 2. BCE invalide : refus, aucun appel d'API.
code, s = lancer("nouveau-client", "--fiche", ecrire_fiche("bce.json", lambda f: f.update(numeroBce="0123.456.748")))
assert code != 0 and "BCE" in s and "rien n'est écrit" in s, (code, s); sans_appel()
print("2. BCE invalide (modulo 97) : refus, code", code, ", aucun appel d'API")
# 3. Courtier sans FSMA : refus.
code, s = lancer("nouveau-client", "--fiche", ecrire_fiche("fsma.json", lambda f: f.pop("numeroFsma")))
assert code != 0 and "numeroFsma" in s, (code, s); sans_appel()
code, s = lancer("nouveau-client", "--fiche", ecrire_fiche("fsma2.json", lambda f: f.update(numeroFsma="12")))
assert code != 0 and "numeroFsma" in s, (code, s); sans_appel()
print("3. courtier sans numéro FSMA (ou numéro mal formé) : refus, aucun appel d'API")
# 3 bis. Plus de mode démonstration : une fiche en mode « demonstration » ou un code FSMA de démonstration sont refusés, sans appel.
code, s = lancer("nouveau-client", "--fiche", ecrire_fiche("demo-mode.json", lambda f: f.update(mode="demonstration")))
assert code != 0 and "mode" in s and "démonstration" in s, (code, s); sans_appel()
code, s = lancer("nouveau-client", "--fiche", ecrire_fiche("demo-fsma.json", lambda f: f.update(numeroFsma="DEMO-0100")), "--a-blanc")
assert code != 0 and "numeroFsma" in s, (code, s); sans_appel()
code, s = lancer("nouveau-client", "--fiche", ecrire_fiche("langue.json", lambda f: f.update(langues=["DE"])))
assert code != 0 and "langues" in s, (code, s); sans_appel()
code, s = lancer("nouveau-client", "--fiche", str(travail / "absente.json"))
assert code != 0 and "introuvable" in s, (code, s); sans_appel()
print("3 bis. mode réel sans --reel, FSMA de démonstration en réel, langue inconnue, fiche absente : refus sans appel d'API")
# 3 ter. m3 / m4 : nom et listes de la fiche contrôlés (textes recopiés tels quels dans COMPANY.md et le référentiel).
def refus_fiche(nom, modif, motif):
    code, s = lancer("nouveau-client", "--fiche", ecrire_fiche(nom, modif))
    assert code != 0 and motif in s and "rien n'est écrit" in s, (nom, code, s); sans_appel()
refus_fiche("n1.json", lambda f: f.update(nomCommercial="Client\nAutre ligne"), "nomCommercial")
refus_fiche("n2.json", lambda f: f.update(nomCommercial="Client\x07Bip"), "nomCommercial")
refus_fiche("n3.json", lambda f: f.update(nomCommercial="C" * 121), "nomCommercial")
refus_fiche("n4.json", lambda f: f.update(nomCommercial="Client Autre"), "nomCommercial")
refus_fiche("z1.json", lambda f: f.update(zones="Liège"), "zones")
refus_fiche("z2.json", lambda f: f.update(zones=["a"] * 51), "zones")
refus_fiche("z3.json", lambda f: f.update(zones=[1]), "zones")
refus_fiche("z4.json", lambda f: f.update(zones=["x" * 121]), "zones")
refus_fiche("z5.json", lambda f: f.update(zones=["a\nb"]), "zones")
refus_fiche("c1.json", lambda f: f["segmentsCibles"][0].update(nace="6920"), "nace")
refus_fiche("c2.json", lambda f: f["segmentsCibles"][0].update(nace=[69]), "nace")
refus_fiche("c3.json", lambda f: f["segmentsCibles"][0].update(nace=["1"] * 51), "nace")
refus_fiche("c4.json", lambda f: f["segmentsCibles"][0].update(nace=["x" * 21]), "nace")
refus_fiche("t1.json", lambda f: f.update(ton=["a"]), "ton")
refus_fiche("t2.json", lambda f: f.update(ton="t" * 501), "ton")
refus_fiche("d1.json", lambda f: f["offres"][0].update(description=12), "description")
refus_fiche("d2.json", lambda f: f["offres"][0].update(description="d" * 1001), "description")
code, s = lancer("nouveau-client", "--fiche", ecrire_fiche("ok-limites.json", lambda f: f.update(nomCommercial="N" * 120, zones=["z" * 120] * 50)), "--a-blanc")
assert code == 0, (code, s)
texte_agents = (racine / "organisation/registre/agents.json").read_text(encoding="utf-8")
assert "claude-config/<slug>" not in texte_agents and "claude-config/<id entreprise>/<slug>" in texte_agents, "m6 : disposition par entreprise"
print("3 ter. nom, zones, nace, ton et description bornés et typés : refus sans appel d'API ; agents.json décrit la disposition par entreprise")
# 4. Création réelle : entreprise, budget, référentiel, une seule fois chacun.
code, s = lancer("nouveau-client", "--fiche", valide)
assert code == 0, s
assert etat["creations"] == 1 and len(etat["societes"]) == 1, etat
cid = etat["societes"][0]["id"]
assert "atelier-client:courtage-exemple-fiche-fictive" in etat["societes"][0]["description"] and "atelier-demo" not in etat["societes"][0]["description"]
assert [e for e in etat["ecritures"] if e[1].endswith("/budgets")] == [("PATCH", f"/companies/{cid}/budgets")] and etat["societes"][0]["budgetMonthlyCents"] == 5000
marque = etat["marques"][cid]
assert [e for e in etat["ecritures"] if "atelier.marque.enregistrer" in e[1]] and marque["version"] == 1
assert marque["modulesConformite"][0]["code"] == "intermediaire_assurance" and marque["entites"][0]["identifiants"][1] == {"type": "fsma", "libelle": None, "valeur": "100100"}
assert marque["entites"][0]["identifiants"][0]["valeur"] == "0123.456.749" and all(o["confirmee"] is False for o in marque["offres"]) and all(x["confirme"] is False for x in marque["etablissements"])
assert marque["etablissements"][0]["position"] == {"lat": 50.0, "lon": 5.5} and marque["etablissements"][0]["segmentsSuivis"] == ["professions-liberales"]
assert "rénovation" not in json.dumps(marque).lower() and "liège" not in json.dumps(marque).lower()
print("4. création : entreprise marquée atelier-client:<slug>, budget 5000 centimes, référentiel v1 (module de conformité, offres non confirmées)")
# 5. Deuxième passage : aucune création, aucune réécriture.
avant = list(etat["ecritures"]); creations = etat["creations"]
code, s = lancer("nouveau-client", "--fiche", valide)
assert code == 0 and etat["creations"] == creations == 1 and len(etat["societes"]) == 1, (code, s)
assert etat["ecritures"] == avant, "le deuxième passage a écrit : " + str(etat["ecritures"][len(avant):])
assert "déjà à 5000" in s and "déjà à jour" in s, s
code, s = lancer("nouveau-client", "--fiche", valide, "--a-blanc")
assert code == 0 and "aucune création" in s and "aucune écriture" in s and "créer l'entreprise" not in s, s
assert etat["ecritures"] == avant
print("5. deuxième passage : aucune création, budget et référentiel inchangés (aucune écriture) ; à blanc : « aucune création »")
# 5 bis. Fiche modifiée : seul ce qui change est réécrit (nouvelle version du référentiel, pas de seconde entreprise).
code, s = lancer("nouveau-client", "--fiche", ecrire_fiche("fiche-v2.json", lambda f: f["offres"][0].update(nom="Assurance professionnelle (v2)")))
assert code == 0 and etat["creations"] == 1 and etat["marques"][cid]["version"] == 2, (code, s)
print("5 bis. fiche modifiée : nouvelle version du référentiel, toujours une seule entreprise")
# 6. Une entreprise portant le marqueur du client mais appartenant à la démonstration : refus, rien d'écrit.
etat["societes"].append({"id": "dddddddd-0000-4000-8000-000000000000", "name": "Autre client", "description": f"atelier-client:autre-client {ent['marqueur']}", "budgetMonthlyCents": 0})
avant = list(etat["ecritures"]); creations = etat["creations"]; coeur = etat["appels_coeur"]
code, s = lancer("nouveau-client", "--fiche", ecrire_fiche("autre.json", lambda f: f.update(nomCommercial="Autre client")))
assert code != 0 and "modèle" in s and etat["ecritures"] == avant and etat["creations"] == creations and etat["appels_coeur"] == coeur, (code, s)
code, s = lancer("nouveau-client", "--fiche", ecrire_fiche("demo.json", lambda f: f.update(nomCommercial=ent["nom"])))
assert code != 0 and "modèle" in s and etat["ecritures"] == avant and etat["appels_coeur"] == coeur, (code, s)
code, s = lancer("nouveau-client", "--fiche", ecrire_fiche("demo2.json", lambda f: f.update(nomCommercial=ent["nom"])), "--a-blanc")
assert code != 0 and "modèle" in s and etat["ecritures"] == avant, (code, s)
print("6. entreprise du client appartenant à la démonstration (marqueur ou nom) : refus, rien d'écrit")
# 7. M2 : registre local écrit à la création (hors de portée des agents : dossier 0700, fichier 0600).
import shutil
reg_dir = donnees / "atelier-client" / "courtage-exemple-fiche-fictive"; fichier_reg = reg_dir / "entreprise.json"
assert fichier_reg.is_file(), "registre local absent après la création"
rg = json.load(open(fichier_reg, encoding="utf-8"))
assert rg["entrepriseId"] == cid and rg["numeroBce"] == "0123456749" and rg["creeLe"], rg
assert (fichier_reg.stat().st_mode & 0o777) == 0o600 and (reg_dir.stat().st_mode & 0o777) == 0o700, "droits du registre"
print("7. registre local instance/atelier-client/<slug>/entreprise.json : id, BCE, date ; dossier 0700, fichier 0600")
# 8. m1 : même nom, BCE différent : refus ; même BCE écrit autrement : accepté.
autre_bce = next(f"{n:010d}" for n in range(1000000000, 1000001000) if b.bce_valide(f"{n:010d}") and f"{n:010d}" != "0123456749")
avant = list(etat["ecritures"]); coeur = etat["appels_coeur"]
for extra in ((), ("--a-blanc",)):
    code, s = lancer("nouveau-client", "--fiche", ecrire_fiche("bce2.json", lambda f: f.update(numeroBce=autre_bce)), *extra)
    assert code != 0 and "BCE" in s and "registre" in s and etat["ecritures"] == avant and etat["appels_coeur"] == coeur, (extra, code, s)
code, s = lancer("nouveau-client", "--fiche", ecrire_fiche("bce3.json", lambda f: f.update(numeroBce="BE0123.456.749")))
assert code == 0, s
print("8. même nom, BCE différent du registre : refus (à blanc aussi), rien d'écrit ; même BCE autrement écrit : accepté")
# 9. M2 : entreprise portant le marqueur sans registre, ou désignée par un autre identifiant : refus.
etat["societes"].append({"id": "eeeeeeee-0000-4000-8000-000000000000", "name": "Client Usurpé",
                         "description": "Entreprise cliente. Marqueur de périmètre : atelier-client:client-usurpe.", "budgetMonthlyCents": 0})
avant = list(etat["ecritures"]); coeur = etat["appels_coeur"]; fiche_usurpe = ecrire_fiche("usurpe.json", lambda f: f.update(nomCommercial="Client Usurpé"))
code, s = lancer("nouveau-client", "--fiche", fiche_usurpe)
assert code != 0 and "registre" in s and etat["ecritures"] == avant and etat["appels_coeur"] == coeur, (code, s)
d_us = donnees / "atelier-client" / "client-usurpe"; d_us.mkdir()
(d_us / "entreprise.json").write_text(json.dumps({"entrepriseId": "ffffffff-0000-4000-8000-000000000000", "numeroBce": "0123456749", "slug": "client-usurpe", "creeLe": "2026-10-16T08:00:00Z"}), encoding="utf-8")
code, s = lancer("nouveau-client", "--fiche", fiche_usurpe)
assert code != 0 and "registre" in s and etat["ecritures"] == avant and etat["appels_coeur"] == coeur, (code, s)
shutil.rmtree(d_us); etat["societes"].pop()
print("9. marqueur d'un client posé sur une entreprise sans registre ou avec un autre identifiant : refus, rien d'écrit")
# 10. Marqueur en mot entier : « zeta-plus » n'est pas « zeta ».
etat["societes"].append({"id": "11111111-0000-4000-8000-0000000000aa", "name": "Zeta Plus",
                         "description": "Entreprise cliente. Marqueur de périmètre : atelier-client:zeta-plus.", "budgetMonthlyCents": 0})
creations = etat["creations"]
code, s = lancer("nouveau-client", "--fiche", ecrire_fiche("zeta.json", lambda f: f.update(nomCommercial="Zeta")))
assert code == 0 and etat["creations"] == creations + 1 and (donnees / "atelier-client/zeta/entreprise.json").is_file(), (code, s)
print("10. marqueur atelier-client:zeta distinct de atelier-client:zeta-plus : création acceptée, registre écrit")
# 11. Migration : --enregistrer-existante crée le registre d'une entreprise d'avant le correctif, après contrôle du BCE.
ANC = "22222222-0000-4000-8000-0000000000bb"
etat["societes"].append({"id": ANC, "name": "Client Ancien", "description": "Entreprise cliente. Marqueur de périmètre : atelier-client:client-ancien.", "budgetMonthlyCents": 0})
etat["marques"][ANC] = {"version": 1, "entites": [{"identifiants": [{"type": "bce", "libelle": None, "valeur": "0123.456.749"}]}]}
def fiche_anc(**kw): return ecrire_fiche("ancien.json", lambda f: f.update(nomCommercial="Client Ancien", **kw))
reg_anc = donnees / "atelier-client" / "client-ancien" / "entreprise.json"
avant = list(etat["ecritures"]); coeur = etat["appels_coeur"]
def refus_enreg(args_, motif):
    code, s = lancer("nouveau-client", *args_)
    assert code != 0 and motif in s and not reg_anc.exists() and etat["ecritures"] == avant and etat["appels_coeur"] == coeur, (args_, code, s)
refus_enreg(["--enregistrer-existante", "--fiche", fiche_anc()], "--entreprise")
refus_enreg(["--entreprise", ANC, "--fiche", fiche_anc()], "--enregistrer-existante")
refus_enreg(["--enregistrer-existante", "--entreprise", "pas-un-uuid", "--fiche", fiche_anc()], "UUID")
refus_enreg(["--enregistrer-existante", "--entreprise", "99999999-0000-4000-8000-000000000009", "--fiche", fiche_anc()], "introuvable")
refus_enreg(["--enregistrer-existante", "--entreprise", ANC, "--fiche", fiche_anc(numeroBce=autre_bce)], "BCE")
marque_ancien = etat["marques"].pop(ANC)
refus_enreg(["--enregistrer-existante", "--entreprise", ANC, "--fiche", fiche_anc()], "BCE")
etat["marques"][ANC] = marque_ancien
etat["societes"].append({"id": "33333333-0000-4000-8000-0000000000cc", "name": "Client Ancien", "description": "créée à la main", "budgetMonthlyCents": 0})
refus_enreg(["--enregistrer-existante", "--entreprise", "33333333-0000-4000-8000-0000000000cc", "--fiche", fiche_anc()], "marqueur")
etat["societes"].pop()
etat["societes"].append({"id": "44444444-0000-4000-8000-0000000000dd", "name": ent["nom"], "description": ent["marqueur"], "budgetMonthlyCents": 0})
refus_enreg(["--enregistrer-existante", "--entreprise", "44444444-0000-4000-8000-0000000000dd", "--fiche", fiche_anc()], "modèle")
etat["societes"].pop()
code, s = lancer("nouveau-client", "--enregistrer-existante", "--entreprise", ANC, "--fiche", fiche_anc(), "--a-blanc")
assert code == 0 and not reg_anc.exists() and etat["ecritures"] == avant, (code, s)
code, s = lancer("nouveau-client", "--enregistrer-existante", "--entreprise", ANC, "--fiche", fiche_anc())
assert code == 0 and etat["ecritures"] == avant and etat["appels_coeur"] == coeur, (code, s)
rg = json.load(open(reg_anc, encoding="utf-8")); assert rg["entrepriseId"] == ANC and rg["numeroBce"] == "0123456749", rg
assert (reg_anc.stat().st_mode & 0o777) == 0o600 and (reg_anc.parent.stat().st_mode & 0o777) == 0o700
code, s = lancer("nouveau-client", "--enregistrer-existante", "--entreprise", ANC, "--fiche", fiche_anc()); assert code == 0, s
code, s = lancer("nouveau-client", "--fiche", fiche_anc()); assert code == 0 and etat["creations"] == creations + 1, (code, s)
print("11. --enregistrer-existante : refus sans --entreprise, UUID invalide, entreprise inconnue, BCE différent ou non vérifiable, sans marqueur, démonstration ; succès sans écriture API")
print("nouveau-client : 8 groupes de vérifications contre une fausse API, tous réussis")
PY
then
  ok "nouveau-client : $(tail -1 "${TRAVAIL}/nouveau-client.txt")"
else
  ko "nouveau-client"; tail -30 "${TRAVAIL}/nouveau-client.txt"
fi

# 2g bis. « nouveau-client » avec plusieurs services (une entreprise par service) et purge de TOUTES les entreprises du
#     client, contre une fausse API (l'application des agents est remplacée par des doublures qui créent l'entreprise
#     comme l'import natif et préparent les vrais dossiers locaux). On vérifie : un service (compatibilité : nom commercial,
#     marqueur historique), trois services plus la Direction (noms, marqueurs, registre local, budgets, hiérarchie des
#     agents, confinement, consignes lues dans organisation/services), idempotence (rien créé, aucune écriture), consigne
#     manquante (avertissement et consigne minimale), fiches refusées, isolation des dossiers par entreprise, migration de
#     l'ancien registre, purge de toutes les entreprises (exports contrôlés avant la première suppression).
if "${PY[@]}" - "${RACINE}" "${TRAVAIL}" > "${TRAVAIL}/services.txt" 2>&1 <<'PY'
import contextlib, copy, importlib.util, io, json, os, re, shutil, sys, threading, urllib.parse
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
racine, travail = Path(sys.argv[1]), Path(sys.argv[2])
sys.dont_write_bytecode = True
TABLES = ("prospects", "journal")
etat = {"societes": [], "ecritures": [], "creations": 0, "paquets": {}, "agents": {}, "appels": [], "marques": {}, "supprimees": [], "configs": {}}
class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def rep(self, code, corps):
        brut = json.dumps(corps).encode(); self.send_response(code); self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(brut))); self.end_headers(); self.wfile.write(brut)
    def corps(self):
        n = int(self.headers.get("Content-Length") or 0); return json.loads(self.rfile.read(n) or b"null")
    def chemin(self): return urllib.parse.urlparse(self.path)[2][len("/api"):]
    def do_GET(self):
        q = self.chemin()
        if q == "/companies": return self.rep(200, etat["societes"])
        if q == "/plugins/atelier.marketing-ia": return self.rep(200, {"pluginKey": "atelier.marketing-ia", "status": "ready"})
        if re.fullmatch(r"/companies/[^/]+/projects", q): return self.rep(200, [])
        if q == "/plugins/atelier.marketing-ia/config":  # configuration du plugin par entreprise, null si absente
            cid = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)["companyId"][0]
            return self.rep(200, etat["configs"].get(cid))
        self.rep(404, {"error": q})
    def do_POST(self):
        q = self.chemin(); c = self.corps()
        if q == "/plugins/atelier.marketing-ia/config":
            etat["ecritures"].append(("POST", q)); etat["configs"][c["companyId"]] = {"companyId": c["companyId"], "configJson": c["configJson"]}
            return self.rep(200, etat["configs"][c["companyId"]])
        if q == "/plugins/atelier.marketing-ia/data/atelier.marque":
            return self.rep(200, {"data": {"marque": etat["marques"].get(c["companyId"])}})
        if q == "/plugins/atelier.marketing-ia/api/donnees/export":
            comptes = {t: 1 for t in TABLES}
            if c.get("table") is None: return self.rep(200, {"companyId": c["companyId"], "total": 2, "tables": comptes})
            return self.rep(200, {"companyId": c["companyId"], "table": c["table"], "total": 1, "decalage": 0, "limite": 3,
                                  "lignes": [{"company_id": c["companyId"], "rang": 0}], "suivant": None})
        if q == "/plugins/atelier.marketing-ia/api/donnees/purge":
            comptes = {t: 1 for t in TABLES}
            if c.get("aBlanc"): return self.rep(200, {"aBlanc": True, "supprime": False, "total": 2, "tables": comptes})
            etat["ecritures"].append(("PURGE", c["companyId"]))
            return self.rep(200, {"aBlanc": False, "supprime": True, "total": 2, "tables": comptes})
        if q.endswith("/exports"): return self.rep(200, {"files": {"COMPANY.md": "# Client\n"}, "warnings": []})
        if q == "/companies/import/preview": return self.rep(200, {"plan": {}, "manifest": {}, "errors": []})
        etat["ecritures"].append(("POST", q))
        if q == "/plugins/atelier.marketing-ia/actions/atelier.marque.enregistrer":
            marque = {**copy.deepcopy(c["params"]), "id": "x", "companyId": c["companyId"], "version": 1}
            marque["offres"] = [{**o, "argumentsValides": []} for o in marque["offres"]]
            etat["marques"][c["companyId"]] = marque
            return self.rep(200, {"data": marque})
        self.rep(404, {"error": q})
    def do_PATCH(self):
        q = self.chemin(); c = self.corps(); etat["ecritures"].append(("PATCH", q))
        m = re.fullmatch(r"/companies/([^/]+)/budgets", q)
        if m:
            for s_ in etat["societes"]:
                if s_["id"] == m.group(1): s_["budgetMonthlyCents"] = c["budgetMonthlyCents"]; return self.rep(200, s_)
        m = re.fullmatch(r"/companies/([^/]+)", q)
        if m:  # PATCH d'une entreprise (nom, description), comme le socle
            for s_ in etat["societes"]:
                if s_["id"] == m.group(1): s_.update(c); return self.rep(200, s_)
        self.rep(200, {})
    def do_DELETE(self):
        q = self.chemin(); m = re.fullmatch(r"/companies/([^/]+)", q); etat["ecritures"].append(("DELETE", q))
        etat["supprimees"].append(m.group(1)); etat["societes"][:] = [s_ for s_ in etat["societes"] if s_["id"] != m.group(1)]
        self.rep(200, {"ok": True})
serveur = HTTPServer(("127.0.0.1", 0), H); port = serveur.server_address[1]
threading.Thread(target=serveur.serve_forever, daemon=True).start()
donnees = travail / "donnees-services"; donnees.mkdir()
home = travail / "paperclip-services"
os.environ.update({"ATELIER_API": f"http://127.0.0.1:{port}/api", "ATELIER_DONNEES_LOCALES": str(donnees),
                   "PAPERCLIP_HOME": str(home), "PAPERCLIP_INSTANCE_ID": "essai"})
spec = importlib.util.spec_from_file_location("b", racine / "scripts/bootstrap-organisation.py")
b = importlib.util.module_from_spec(spec); spec.loader.exec_module(b)
services = {s["slug"]: s for s in json.load(open(racine / "organisation/registre/services.json", encoding="utf-8"))["services"]}

def creer(api, reg_s, categorie, fichiers, reg_agents):
    e = reg_s["entreprise"]
    trouvee = b.trouver_entreprise(api, reg_s)
    if trouvee is None:
        etat["creations"] += 1
        trouvee = {"id": f"{etat['creations']:08x}-0000-4000-8000-000000000000", "name": e["nom"], "description": e["description"], "budgetMonthlyCents": 0}
        etat["societes"].append(trouvee)
        (home / "instances" / "essai" / "companies" / trouvee["id"]).mkdir(parents=True)
    etat["appels"].append((categorie, e["nom"])); etat["paquets"][e["nom"]] = fichiers; etat["agents"][e["nom"]] = reg_agents
    b.preparer_dossiers_locaux(trouvee["id"], reg_agents)
    return trouvee["id"]
def double_marketing(api, reg_agents, reg_s, fichiers, mode, dossier_etat):
    assert "COMPANY.md" in fichiers and reg_s["entreprise"]["marqueur"] in fichiers["COMPANY.md"]
    return creer(api, reg_s, "marketing", fichiers, reg_agents)
def double_service(api, reg_agents, reg_s, fichiers, mode, dossier_etat):
    assert dossier_etat.parent.name == "services", dossier_etat
    return creer(api, reg_s, "service", fichiers, reg_agents)
b.appliquer_organisation = double_marketing; b.appliquer_service = double_service
b.cmd_generer = lambda a: 0  # les fichiers générés du dépôt sont contrôlés ailleurs

def lancer(*args):
    sortie = io.StringIO()
    with contextlib.redirect_stdout(sortie), contextlib.redirect_stderr(sortie):
        code = b.main(list(args))
    return code, sortie.getvalue()
def fiche(nom, **modif):
    f = json.load(open(racine / "organisation/modeles/fiche-client.exemple.json", encoding="utf-8"))
    f["nomCommercial"] = nom; f.update(modif)
    chemin = travail / (re.sub(r"\W+", "-", nom) + ".json"); chemin.write_text(json.dumps(f, ensure_ascii=False), encoding="utf-8"); return str(chemin)
def registre(slug): return json.loads((donnees / "atelier-client" / slug / "entreprise.json").read_text(encoding="utf-8"))
def sans_appel(avant):
    assert len(etat["appels"]) == avant[0] and len(etat["ecritures"]) == avant[1], (etat["appels"], etat["ecritures"])

# 1. Un service (compatibilité) : champ absent, puis ["marketing"] explicite. Nom commercial, marqueur historique, registre au nouveau format.
code, s = lancer("nouveau-client", "--fiche", fiche("Client Solo"))
assert code == 0 and etat["creations"] == 1 and [a[0] for a in etat["appels"]] == ["marketing"], (code, s)
assert etat["societes"][0]["name"] == "Client Solo" and "atelier-client:client-solo" in etat["societes"][0]["description"] and ":marketing" not in etat["societes"][0]["description"]
rg = registre("client-solo")
assert rg["version"] == 2 and rg["entrepriseId"] == etat["societes"][0]["id"] and list(rg["entreprises"]) == ["marketing"] and rg["entreprises"]["marketing"]["marqueur"] == "atelier-client:client-solo", rg
code, s = lancer("nouveau-client", "--fiche", fiche("Client Solo", services=["marketing"]))
assert code == 0 and etat["creations"] == 1, (code, s)
assert etat["configs"] == {}, "un seul service : aucun échange entre services, aucune configuration du plugin créée"
print("1. un service (champ absent ou [\"marketing\"]) : entreprise au nom commercial, marqueur historique, registre version 2, rien de recréé")

# 2. Trois services (+ Direction) : à blanc d'abord, puis création.
f3 = fiche("Client Trio", services=["marketing", "juridique", "commercial"], budgets={"juridique": 4242})
avant = (len(etat["appels"]), len(etat["ecritures"]))
code, s = lancer("nouveau-client", "--fiche", f3, "--a-blanc")
assert code == 0 and "4 entreprise(s) : marketing, direction, juridique, commercial" in s, s
for slug in ("marketing", "direction", "juridique", "commercial"):
    assert f"[{slug}] créer l'entreprise" in s, (slug, s)
assert "Client Trio · Juridique" in s and "atelier-client:client-trio:juridique" in s and "4242 centimes" in s and "consigne à rédiger" not in s, s
sans_appel(avant)
creations = etat["creations"]
code, s = lancer("nouveau-client", "--fiche", f3)
assert code == 0 and etat["creations"] == creations + 4 and "4 entreprise(s)" in s, (code, s)
noms = {c["name"]: c for c in etat["societes"]}
attendus = {"Client Trio · Marketing": "marketing", "Client Trio · Direction": "direction", "Client Trio · Juridique": "juridique", "Client Trio · Commercial": "commercial"}
assert set(attendus) <= set(noms), list(noms)
assert all("—" not in n and "–" not in n for n in noms), "aucun tiret cadratin"
rg = registre("client-trio")
assert set(rg["entreprises"]) == set(attendus.values()) and len({e["entrepriseId"] for e in rg["entreprises"].values()}) == 4, rg
for nom_, svc in attendus.items():
    assert rg["entreprises"][svc]["entrepriseId"] == noms[nom_]["id"] and rg["entreprises"][svc]["marqueur"] == f"atelier-client:client-trio:{svc}", (svc, rg)
    assert f"atelier-client:client-trio:{svc}" in noms[nom_]["description"] and f"Préfixe de service : {services[svc]['prefixe']}" in noms[nom_]["description"] or svc == "marketing"
assert (donnees / "atelier-client/client-trio/entreprise.json").stat().st_mode & 0o777 == 0o600
# Bureau de liaison : chaque entreprise du client reçoit une configuration du plugin (vide), sinon le facteur ne peut pas y agir.
assert {e["entrepriseId"] for e in rg["entreprises"].values()} == set(etat["configs"]) and all(v["configJson"] == {} for v in etat["configs"].values()), etat["configs"]
assert "Configuration du plugin (bureau de liaison) : 4 entreprise(s) configurée(s), 0 déjà configurée(s)" in s, s
# Budgets : fiche > budget IA (marketing) > somme des budgets des agents.
assert noms["Client Trio · Juridique"]["budgetMonthlyCents"] == 4242 and noms["Client Trio · Marketing"]["budgetMonthlyCents"] == 5000
somme = lambda nom_: sum(a["budgetMensuelCentimes"] for a in etat["agents"][nom_]["agents"])
assert noms["Client Trio · Commercial"]["budgetMonthlyCents"] == somme("Client Trio · Commercial") > 0
assert noms["Client Trio · Direction"]["budgetMonthlyCents"] == somme("Client Trio · Direction") > 0
# Organisation d'un service : agents du registre, coordinateur ceo, spécialistes qui lui rapportent, consignes du dépôt, confinement.
reg_j = etat["agents"]["Client Trio · Juridique"]["agents"]
assert [a["slug"] for a in reg_j] == services["juridique"]["agents"], reg_j
assert reg_j[0]["role"] == "ceo" and reg_j[0]["rapporteA"] is None and all(a["rapporteA"] == "coordinateur-juridique" and a["role"] != "ceo" for a in reg_j[1:])
paquet_j = etat["paquets"]["Client Trio · Juridique"]
fichiers_skills_j = {f.relative_to(racine / "organisation").as_posix() for a in reg_j for c in a["competences"] for f in (racine / "organisation/skills" / c).rglob("*") if f.is_file()}
assert set(paquet_j) == {"COMPANY.md", ".paperclip.yaml"} | {f"agents/{a['slug']}/AGENTS.md" for a in reg_j} | fichiers_skills_j, sorted(paquet_j)
assert 'filesystemScope: "workspace"' in paquet_j[".paperclip.yaml"] and 'networkScope: "allowlist"' in paquet_j[".paperclip.yaml"]
assert paquet_j["agents/lecture-contrats/AGENTS.md"].count('reportsTo: "coordinateur-juridique"') == 1 and "Première lecture" in paquet_j["agents/lecture-contrats/AGENTS.md"]
assert "Consigne à rédiger" not in "".join(paquet_j.values()) and b.MARQUEUR_CONSIGNES_COMMUNES in paquet_j["agents/lecture-contrats/AGENTS.md"]
assert "Client Trio · Juridique" in paquet_j["COMPANY.md"] and "Client Solo" not in "".join(paquet_j.values())
print("2. trois services + Direction : 4 entreprises (noms « client · service », marqueurs, registre), budgets, hiérarchie, consignes du dépôt, confinement")
# Compétences des services : celles de l'en-tête « skills: » de chaque AGENTS.md du dépôt, livrées comme au marketing.
def skills_depot(svc_, ag_):
    return b.competences_entete((racine / "organisation/services" / svc_ / "agents" / ag_ / "AGENTS.md").read_text(encoding="utf-8"), svc_, ag_)
skills_coord_d = skills_depot("direction", "coordinateur-direction")
assert {"cadrage-exigences", "planification-livrables"} <= set(skills_coord_d) and len(skills_coord_d) == len(set(skills_coord_d)), skills_coord_d
par_slug_d = {a["slug"]: a for a in etat["agents"]["Client Trio · Direction"]["agents"]}
# Compétences livrées = celles de l'en-tête, puis les compétences communes du générateur (décision de l'opérateur du 18/10/2026) ;
# un coordinateur n'écrit aucun fichier (Write et Edit interdits) : pas de memoire-para (revue du 18/10/2026, M2).
livrees_coord_d = b.avec_competences_communes(skills_coord_d, ecrit=False)
assert livrees_coord_d[: len(skills_coord_d)] == skills_coord_d and "recherche-connaissances" in livrees_coord_d
assert "memoire-para" not in livrees_coord_d
assert par_slug_d["coordinateur-direction"]["competences"] == livrees_coord_d
paquet_d = etat["paquets"]["Client Trio · Direction"]
entete_d = paquet_d["agents/coordinateur-direction/AGENTS.md"].split("\n---\n")[0]
assert "skills:\n" + "".join(f'  - "{c_}"\n' for c_ in livrees_coord_d) in entete_d + "\n", entete_d
for c_ in par_slug_d["coordinateur-direction"]["competences"]:
    assert f"skills/{c_}/SKILL.md" in paquet_d, c_
assert paquet_d["skills/cadrage-exigences/SKILL.md"] == (racine / "organisation/skills/cadrage-exigences/SKILL.md").read_text(encoding="utf-8")
# Agent dont la liste est vide (« skills: [] ») : aucune compétence, aucun dossier skills/ superflu.
par_slug_j = {a["slug"]: a for a in reg_j}
# Le dépôt ne garantit plus d'agent juridique sans compétence (lecture-contrats en a une) : la liste vide est vérifiée
# sur un en-tête synthétique, et sur les agents juridiques du dépôt qui déclarent « skills: [] » s'il en reste.
assert b.competences_entete('---\nkind: "agent"\nskills: []\n---\n', "juridique", "x") == []
for a_ in reg_j:
    if "skills: []" in (racine / "organisation/services/juridique/agents" / a_["slug"] / "AGENTS.md").read_text(encoding="utf-8").split("\n---\n")[0]:
        assert a_["competences"] == b.avec_competences_communes([], b.ecrit_des_fichiers(a_["outils"])) and skills_depot("juridique", a_["slug"]) == []
        assert "skills: []" not in paquet_j[f"agents/{a_['slug']}/AGENTS.md"].split("\n---\n")[0]
for a_ in reg_j:  # chaque agent juridique livre exactement les compétences de son en-tête, puis les communes, sans doublon
    # Communes : recherche-connaissances pour tous, memoire-para seulement pour un agent qui écrit (M2, 18/10/2026).
    assert a_["competences"] == b.avec_competences_communes(skills_depot("juridique", a_["slug"]), b.ecrit_des_fichiers(a_["outils"])), a_["slug"]
    assert ("memoire-para" in a_["competences"]) == b.ecrit_des_fichiers(a_["outils"]), a_["slug"]
    assert len(a_["competences"]) == len(set(a_["competences"])), a_["slug"]
assert not any(c_.startswith("skills/") and c_.split("/")[1] not in {x for a in reg_j for x in a["competences"]} for c_ in paquet_j)
assert b.competences_entete('---\nskills: ["cadrage-exigences", "audit-seo"]\n---\n', "direction", "x") == ["cadrage-exigences", "audit-seo"]  # liste en ligne
assert skills_depot("commercial", "preparation-rdv") == ["preparation-rendez-vous-b2b", "reponse-objection", "compte-rendu-rendez-vous"]
# Sans clé « skills » : aucune compétence. Compétence inconnue ou nom suspect : refus qui nomme l'agent et la compétence.
assert b.competences_entete('---\nkind: "agent"\nslug: "x"\n---\n\nCorps\n', "juridique", "x") == []
assert b.competences_entete('Sans en-tête\n', "juridique", "x") == []
for texte_, motif_ in (('---\nskills:\n  - "cadrage-exigences"\n  - "competence-fantome"\n---\n', "competence-fantome"),
                       ('---\nskills:\n  - "../registre"\n---\n', "../registre"),
                       ('---\nskills:\n  - "cadrage-exigences"\n  - "cadrage-exigences"\n---\n', "deux fois"),
                       ('---\nskills: cadrage-exigences\n---\n', "liste YAML")):
    try:
        b.competences_entete(texte_, "direction", "agent-essai")
    except b.ErreurAtelier as e_:
        assert "agent-essai" in str(e_) and "direction" in str(e_) and motif_ in str(e_), str(e_)
    else:
        raise AssertionError(f"refus attendu : {motif_}")
# Bout en bout : un AGENTS.md de service qui déclare une compétence absente fait refuser le plan, avec le nom de l'agent.
racine_orga_ = b.ORGA
faux_ = travail / "orga-fausse"; (faux_ / "services/direction/agents/synthese").mkdir(parents=True)
(faux_ / "skills").mkdir()
(faux_ / "services/direction/agents/synthese/AGENTS.md").write_text('---\nkind: "agent"\nskills:\n  - "inexistante"\n---\n\nCorps\n', encoding="utf-8")
b.ORGA = faux_
try:
    b.agents_service(json.load(open(racine_orga_ / "registre/agents.json", encoding="utf-8")), services["direction"])
except b.ErreurAtelier as e_:
    assert "synthese" in str(e_) and "inexistante" in str(e_), str(e_)
else:
    raise AssertionError("compétence absente : refus attendu")
finally:
    b.ORGA = racine_orga_
print("2a. compétences des services : liste « skills: » livrée (en-tête et dossiers skills/), liste vide ou absente = aucune, compétence inconnue = refus nommé")
# Consignes communes : tronc commun à tous les agents, complément marketing aux seuls agents du marketing.
communes_service, communes_marketing = b.consignes_communes(False), b.consignes_communes(True)
termes_marketing_ = ("## Faits du client", "api/marque", "atelier.marketing-ia", "/prospects", "donnees-connexion", "marque de l'atelier")
assert "[[" not in communes_service + communes_marketing and "hors-marketing" not in communes_service + communes_marketing
for titre_ in ("## Livrable en relecture", "## Appeler l'API de Paperclip", "## Fichiers temporaires", "ne lis jamais le code source du plugin", "--data-raw"):
    assert titre_ in communes_service and titre_ in communes_marketing, titre_
assert "## Échanges entre services" in communes_service and "`liaison.demander`" in communes_service and "demande-la à ton coordinateur" in communes_service
assert "## Échanges entre services" not in communes_marketing, "le marketing garde son texte d'origine"
assert all(m in communes_marketing for m in termes_marketing_) and not any(m in communes_service for m in termes_marketing_), [m for m in termes_marketing_ if m in communes_service]
for nom_, chemin_ in (("Client Trio · Juridique", "agents/lecture-contrats/AGENTS.md"), ("Client Trio · Juridique", "agents/coordinateur-juridique/AGENTS.md"),
                      ("Client Trio · Commercial", "agents/preparation-rdv/AGENTS.md"), ("Client Trio · Direction", "agents/synthese/AGENTS.md")):
    corps_ = etat["paquets"][nom_][chemin_].split(b.MARQUEUR_CONSIGNES_COMMUNES)[1].split(b.TITRE_FICHE_ROUTES)[0]
    assert corps_.strip("\n") == communes_service.strip("\n"), (nom_, chemin_)
    assert "## Échanges entre services" in corps_ and not any(m in corps_ for m in termes_marketing_), (nom_, chemin_)
for chemin_ in ("agents/coordinateur/AGENTS.md", "agents/mesure/AGENTS.md"):
    corps_ = etat["paquets"]["Client Trio · Marketing"][chemin_].split(b.MARQUEUR_CONSIGNES_COMMUNES)[1].split(b.TITRE_FICHE_ROUTES)[0]
    assert corps_.strip("\n") == communes_marketing.strip("\n") and "## Faits du client" in corps_ and "## Échanges entre services" not in corps_, chemin_
print("2b. consignes communes : tronc commun partout, complément marketing au seul marketing, rien de la marque ni des routes marketing chez un service")

# 3. Isolation : un dossier de travail et une configuration Claude distincts par entreprise, avec les règles deny.
ids = [c["id"] for c in etat["societes"] if c["name"].startswith("Client Trio")]
espaces = [donnees / "agents-atelier" / i / "coordinateur-juridique" for i in ids[:1]]
for i in ids:
    assert (donnees / "agents-atelier" / i).is_dir() and (donnees / "claude-config" / i).is_dir() and i in str(b.dossiers_agent(i, "x")[0])
j = noms["Client Trio · Juridique"]["id"]
reglages = json.loads((donnees / "claude-config" / j / "coordinateur-juridique" / "settings.json").read_text(encoding="utf-8"))
assert any(r.startswith("Read(~/.ssh") for r in reglages["permissions"]["deny"]) and reglages["autoMemoryEnabled"] is False
assert (donnees / "agents-atelier" / j / "coordinateur-juridique").is_dir() and not (donnees / "agents-atelier" / j / "coordinateur").exists()
assert len({str(p) for i in ids for p in (donnees / "agents-atelier" / i).iterdir()}) == sum(len(list((donnees / "agents-atelier" / i).iterdir())) for i in ids)
print("3. isolation : un espace et une configuration Claude par entreprise (règles deny présentes), aucun dossier partagé entre services")

# 4. Idempotence : relancer ne crée rien et n'écrit rien dans l'API ; à blanc : « aucune création ».
creations, ecr = etat["creations"], list(etat["ecritures"])
code, s = lancer("nouveau-client", "--fiche", f3)
assert code == 0 and etat["creations"] == creations and etat["ecritures"] == ecr, (code, s, etat["ecritures"][len(ecr):])
code, s = lancer("nouveau-client", "--fiche", f3, "--a-blanc")
assert code == 0 and "créer l'entreprise" not in s and s.count("aucune création") == 4, s
print("4. idempotence : aucune création, aucune écriture dans l'API ; à blanc : « aucune création » pour les 4 entreprises")

# 5. Ajouter des services à un client historique : le marketing garde son nom et son marqueur, le registre ancien est migré.
etat["societes"].append({"id": "aaaaaaaa-0000-4000-8000-0000000000a1", "name": "Client Ancien SA", "description": "Entreprise cliente. Marqueur de périmètre : atelier-client:client-ancien-sa.", "budgetMonthlyCents": 0})
d = donnees / "atelier-client" / "client-ancien-sa"; d.mkdir()
(d / "entreprise.json").write_text(json.dumps({"entrepriseId": "aaaaaaaa-0000-4000-8000-0000000000a1", "numeroBce": "0123456749", "slug": "client-ancien-sa", "creeLe": "2026-10-16T08:00:00Z"}), encoding="utf-8")
code, s = lancer("nouveau-client", "--fiche", fiche("Client Ancien SA", services=["marketing", "achats"]), "--a-blanc")
assert code == 0 and "migré vers le format" in s and "[marketing] entreprise « Client Ancien SA » déjà présente" in s and "[achats] créer l'entreprise « Client Ancien SA · Achats »" in s, s
creations = etat["creations"]
etat["configs"]["aaaaaaaa-0000-4000-8000-0000000000a1"] = {"companyId": "aaaaaaaa-0000-4000-8000-0000000000a1", "configJson": {"passerelleUrl": "http://127.0.0.1:3190"}}
code, s = lancer("nouveau-client", "--fiche", fiche("Client Ancien SA", services=["marketing", "achats"]))
assert code == 0 and etat["creations"] == creations + 2, (code, s)  # achats + direction
rg = registre("client-ancien-sa")
assert rg["version"] == 2 and rg["entreprises"]["marketing"]["entrepriseId"] == "aaaaaaaa-0000-4000-8000-0000000000a1" and rg["entreprises"]["marketing"]["marqueur"] == "atelier-client:client-ancien-sa" and set(rg["entreprises"]) == {"marketing", "achats", "direction"}, rg
assert any(c["name"] == "Client Ancien SA" for c in etat["societes"]) and not any(c["name"] == "Client Ancien SA · Marketing" for c in etat["societes"])
# Une configuration existante (secrets possibles) n'est jamais réécrite ; les entreprises sans configuration en reçoivent une.
assert etat["configs"]["aaaaaaaa-0000-4000-8000-0000000000a1"]["configJson"] == {"passerelleUrl": "http://127.0.0.1:3190"} and all(e["entrepriseId"] in etat["configs"] for e in rg["entreprises"].values())
print("5. client historique + nouveaux services : marketing inchangé (nom, marqueur), registre migré, Direction ajoutée")

# 6. Consigne manquante : avertissement et consigne minimale (services du dépôt copiés sans une consigne).
faux_orga = travail / "orga-sans-consigne"; shutil.copytree(racine / "organisation" / "services", faux_orga / "services")
shutil.copytree(racine / "organisation" / "skills", faux_orga / "skills")  # les compétences déclarées par les agents doivent exister
manquante = services["qualite"]["agents"][1]
(faux_orga / "services" / "qualite" / "agents" / manquante / "AGENTS.md").unlink()
vrai_orga = b.ORGA; b.ORGA = faux_orga
try:
    code, s = lancer("nouveau-client", "--fiche", fiche("Client Qualite", services=["qualite"]), "--a-blanc")
    assert code == 0 and f"consigne à rédiger pour l'agent {manquante} du service qualite" in s, s
    code, s = lancer("nouveau-client", "--fiche", fiche("Client Qualite", services=["qualite"]))
    assert code == 0 and f"AVERTISSEMENT : consigne à rédiger pour l'agent {manquante}" in s and "1 consigne(s) à rédiger" in s, s
finally:
    b.ORGA = vrai_orga
p = etat["paquets"]["Client Qualite · Qualité"][f"agents/{manquante}/AGENTS.md"]
assert "Consigne à rédiger" in p and "Décisions réservées à un humain" in p and f'slug: "{manquante}"' in p
autre = services["qualite"]["agents"][0]
assert "Consigne à rédiger" not in etat["paquets"]["Client Qualite · Qualité"][f"agents/{autre}/AGENTS.md"]
assert len(registre("client-qualite")["entreprises"]) == 1  # un seul service : pas de Direction
print("6. consigne manquante : avertissement (à blanc et réel), consigne minimale générée, les autres consignes lues dans le dépôt, pas de Direction pour un service")

# 7. Fiches refusées sans aucun appel d'API.
avant = (len(etat["appels"]), len(etat["ecritures"]))
for nom_, modif, motif in (("Refus A", {"services": ["inconnu"]}, "service inconnu"), ("Refus B", {"services": []}, "services"),
                           ("Refus C", {"services": ["juridique", "juridique"]}, "services"), ("Refus D", {"services": "tout"}, "services"),
                           ("Refus E", {"services": ["juridique"], "budgets": {"achats": 1}}, "budgets"),
                           ("Refus F", {"budgets": {"marketing": -1}}, "budgets"), ("Refus G", {"budgets": []}, "budgets")):
    code, s = lancer("nouveau-client", "--fiche", fiche(nom_, **modif))
    assert code != 0 and motif in s and "rien n'est écrit" in s, (nom_, code, s)
sans_appel(avant)
code, s = lancer("nouveau-client", "--fiche", fiche("Client Tous", services="tous"), "--a-blanc")
# « tous » = tous les services actifs du registre (Direction comprise) : l'attendu est dérivé du registre, jamais figé.
nb_tous = sum(1 for s_ in b.registre_services()["services"] if s_.get("actif"))
assert nb_tous >= 2, nb_tous
assert code == 0 and f"{nb_tous} entreprise(s)" in s, (nb_tous, s)
print(f"7. service inconnu, liste vide ou en double, budget d'un service non choisi ou négatif : refus sans appel ; « tous » = {nb_tous} entreprises, nombre lu dans le registre (à blanc)")

# 8. Purge de TOUTES les entreprises du client (Trio : 4). Un export manquant bloque tout avant la première suppression.
avant_ecr = len(etat["ecritures"]); n_soc = len(etat["societes"])
ids_trio = {svc: e["entrepriseId"] for svc, e in registre("client-trio")["entreprises"].items()}
for svc in ("marketing", "direction", "juridique"):
    code, s = lancer("exporter", "--entreprise", ids_trio[svc], "--pg-port", "54329"); assert code == 0, s
code, s = lancer("purger", "--entreprise", ids_trio["juridique"], "--confirmer")
assert code != 0 and ids_trio["commercial"] in s and "aucun export de moins de 24 h" in s, (code, s)
assert len(etat["ecritures"]) == avant_ecr and len(etat["societes"]) == n_soc and not etat["supprimees"], etat["supprimees"]
code, s = lancer("exporter", "--entreprise", ids_trio["commercial"], "--pg-port", "54329"); assert code == 0, s
code, s = lancer("purger", "--entreprise", ids_trio["juridique"], "--a-blanc")
assert code == 0 and "4 entreprise(s) à purger" in s and s.count("Entreprise à purger") == 4 and all(i in s for i in ids_trio.values()) and not etat["supprimees"], s
code, s = lancer("purger", "--entreprise", ids_trio["juridique"], "--confirmer")
assert code == 0 and "Purge terminée." in s, (code, s)
assert sorted(etat["supprimees"]) == sorted(ids_trio.values()), etat["supprimees"]
assert not any(c["name"].startswith("Client Trio") for c in etat["societes"]) and any(c["name"] == "Client Solo" for c in etat["societes"])
assert not (donnees / "atelier-client" / "client-trio").exists()
for i in ids_trio.values():
    assert not (donnees / "agents-atelier" / i).exists() and not (donnees / "claude-config" / i).exists() and not (home / "instances/essai/companies" / i).exists(), i
assert (donnees / "atelier-client" / "client-solo").is_dir() and (donnees / "agents-atelier" / etat["societes"][0]["id"]).is_dir(), "l'autre client est intact"
assert len(list((donnees / "exports").glob("*/*/rapport-purge-*.json"))) == 4
print("8. purge : un export manquant bloque tout (rien supprimé) ; à blanc liste les 4 entreprises ; purge réelle des 4, registre et dossiers locaux supprimés, autre client intact")

# 9. --ajouter-services : une entreprise EXISTANTE (marquée atelier-demo:*) devient le service marketing du client ; les
#    autres services sont créés par le chemin habituel ; son organisation n'est pas réappliquée ; idempotent.
DEMO_ID = "eeeeeeee-0000-4000-8000-0000000000e1"
etat["societes"].append({"id": DEMO_ID, "name": "Atelier Test (démonstration)", "budgetMonthlyCents": 0,
                         "description": "Entreprise fictive. Marqueur de périmètre : atelier-demo:atelier-test."})
f_aj = fiche("Atelier Test", services=["marketing", "juridique"])
f_sans_marketing = str(travail / "sans-marketing.json")
shutil.copy(fiche("Atelier Test", services=["juridique"]), f_sans_marketing)
Path(f_aj).write_text(json.dumps({**json.load(open(racine / "organisation/modeles/fiche-client.exemple.json", encoding="utf-8")), "nomCommercial": "Atelier Test", "services": ["marketing", "juridique"]}, ensure_ascii=False), encoding="utf-8")
def etat_ecr(): return (len(etat["appels"]), len(etat["ecritures"]), etat["creations"], [dict(c) for c in etat["societes"]])
avant = etat_ecr()
for args_, motif in ((["--ajouter-services", "--fiche", f_aj], "--entreprise"),
                     (["--ajouter-services", "--entreprise", "pas-un-uuid", "--fiche", f_aj], "UUID"),
                     (["--ajouter-services", "--entreprise", "99999999-0000-4000-8000-000000000009", "--fiche", f_aj], "introuvable"),
                     (["--ajouter-services", "--entreprise", DEMO_ID, "--fiche", fiche("Autre Nom", services=["marketing", "juridique"])], "s'appelle"),
                     (["--ajouter-services", "--enregistrer-existante", "--entreprise", DEMO_ID, "--fiche", f_aj], "s'excluent"),
                     (["--slug", "x-y", "--fiche", f_aj], "--slug"),
                     (["--ajouter-services", "--entreprise", DEMO_ID, "--slug", "Pas Valide", "--fiche", f_aj], "--slug invalide"),
                     (["--ajouter-services", "--entreprise", DEMO_ID, "--fiche", f_sans_marketing], "marketing")):
    code, s = lancer("nouveau-client", *args_)
    assert code != 0 and motif in s and etat_ecr() == avant, (args_, code, s)
# Entreprise marquée pour un autre client : refus. Sans marqueur : refus.
for desc_ in ("Client voisin. Marqueur de périmètre : atelier-client:voisin.", "créée à la main", "atelier-demo:a atelier-demo:b"):
    demo_ = next(c for c in etat["societes"] if c["id"] == DEMO_ID); demo_["description"] = desc_; avant = etat_ecr()
    code, s = lancer("nouveau-client", "--ajouter-services", "--entreprise", DEMO_ID, "--fiche", f_aj)
    assert code != 0 and "marqueur" in s and etat_ecr() == avant, (desc_, code, s)
demo_["description"] = "Entreprise fictive. Marqueur de périmètre : atelier-demo:atelier-test."
# Registre qui désigne déjà une autre entreprise marketing pour ce slug : refus.
d_autre = donnees / "atelier-client" / "atelier-test"; d_autre.mkdir(parents=True)
(d_autre / "entreprise.json").write_text(json.dumps({"version": 2, "entrepriseId": "ffffffff-0000-4000-8000-000000000000", "numeroBce": "0123456749", "slug": "atelier-test",
    "creeLe": "2026-10-16T08:00:00Z", "entreprises": {"marketing": {"entrepriseId": "ffffffff-0000-4000-8000-000000000000", "nom": "Atelier Test", "marqueur": "atelier-client:atelier-test"}}}), encoding="utf-8")
avant = etat_ecr()
code, s = lancer("nouveau-client", "--ajouter-services", "--entreprise", DEMO_ID, "--fiche", f_aj)
assert code != 0 and "autre entreprise marketing" in s and etat_ecr() == avant, (code, s)
shutil.rmtree(d_autre)
# À blanc : migration et créations annoncées, RIEN d'écrit (ni socle, ni registre).
avant = etat_ecr()
code, s = lancer("nouveau-client", "--ajouter-services", "--entreprise", DEMO_ID, "--fiche", f_aj, "--a-blanc")
assert code == 0 and etat_ecr() == avant and not (donnees / "atelier-client" / "atelier-test").exists(), (code, s)
assert "Atelier Test (démonstration)" in s and "atelier-client:atelier-test" in s and "non réappliqués" in s, s
assert "[direction] créer l'entreprise" in s and "[juridique] créer l'entreprise" in s and "[marketing] créer l'entreprise" not in s, s
# Réel.
code, s = lancer("nouveau-client", "--ajouter-services", "--entreprise", DEMO_ID, "--fiche", f_aj)
assert code == 0 and etat["creations"] == avant[2] + 2, (code, s)
migree = next(c for c in etat["societes"] if c["id"] == DEMO_ID)
assert migree["name"] == "Atelier Test" and "atelier-client:atelier-test" in migree["description"] and "atelier-demo" not in migree["description"], migree
rg = registre("atelier-test")
assert set(rg["entreprises"]) == {"marketing", "direction", "juridique"} and rg["entreprises"]["marketing"] == {"entrepriseId": DEMO_ID, "nom": "Atelier Test", "marqueur": "atelier-client:atelier-test"}, rg
assert rg["entrepriseId"] == DEMO_ID and (donnees / "atelier-client/atelier-test/entreprise.json").stat().st_mode & 0o777 == 0o600
assert not any(c[1] == "Atelier Test" for c in etat["appels"]), "l'organisation du marketing existant n'est pas réappliquée"
assert {c["name"] for c in etat["societes"]} >= {"Atelier Test · Direction", "Atelier Test · Juridique"}
assert DEMO_ID in etat["configs"], "le marketing existant reçoit aussi la configuration du plugin (bureau de liaison)"
# Idempotence : rien de recréé, aucune écriture.
avant = etat_ecr()
code, s = lancer("nouveau-client", "--ajouter-services", "--entreprise", DEMO_ID, "--fiche", f_aj)
assert code == 0 and etat_ecr()[1:3] == avant[1:3] and etat_ecr()[3] == avant[3] and "déjà migrée" in s, (code, s)
code, s = lancer("nouveau-client", "--ajouter-services", "--entreprise", DEMO_ID, "--fiche", f_aj, "--a-blanc")
assert code == 0 and "aucune écriture" in s and etat_ecr()[1:3] == avant[1:3], s
# --slug : identifiant choisi pour le registre et les marqueurs des services.
D2 = "eeeeeeee-0000-4000-8000-0000000000e2"
etat["societes"].append({"id": D2, "name": "Atelier Bis (démonstration)", "budgetMonthlyCents": 0,
                         "description": "Autre client. Marqueur de périmètre : atelier-demo:atelier-bis."})
f_bis = fiche("Atelier Bis", services=["marketing", "juridique"])
code, s = lancer("nouveau-client", "--ajouter-services", "--entreprise", D2, "--slug", "bis-perso", "--fiche", f_bis)
assert code == 0, s
assert registre("bis-perso")["entreprises"]["marketing"]["entrepriseId"] == D2 and registre("atelier-test")["entreprises"]["marketing"]["entrepriseId"] == DEMO_ID
assert any(c["name"] == "Atelier Bis · Juridique" and "atelier-client:bis-perso:juridique" in c["description"] for c in etat["societes"])
assert next(c for c in etat["societes"] if c["id"] == D2)["name"] == "Atelier Bis"
# Une entreprise déjà rattachée à un autre client ne peut pas l'être à un second slug.
avant = etat_ecr()
code, s = lancer("nouveau-client", "--ajouter-services", "--entreprise", D2, "--slug", "autre-slug", "--fiche", f_bis)
assert code != 0 and "refusé" in s and etat_ecr() == avant, (code, s)
print("9. --ajouter-services : refus (UUID, inconnue, nom, marqueur étranger, registre étranger), à blanc sans écriture, migration du marqueur et du nom, registre, services créés, marketing non réappliqué, idempotent, --slug")
print("services multiples : 9 groupes de vérifications contre une fausse API, tous réussis")
PY
then
  ok "services multiples : $(tail -1 "${TRAVAIL}/services.txt")"
else
  ko "services multiples"; tail -30 "${TRAVAIL}/services.txt"
fi

# 2h. Sous-commandes « exporter --entreprise » et « purger » contre une fausse API Paperclip (entreprises, projets,
#     export natif et route de purge du plugin en mémoire). On vérifie : refus sans --confirmer, sur la démonstration
#     (marqueur ou nom), sans export, avec un export trop ancien, modifié ou d'une autre entreprise (aucun appel
#     d'écriture) ; à blanc (étapes et comptes par table, rien supprimé) ; purge complète (plugin, socle, fichiers,
#     dossiers locaux, ordre des étapes, rapport sans nom ni chemin, avertissement sur les sauvegardes) ; une autre
#     entreprise n'est jamais touchée. L'export contient aussi les données du plugin (route donnees.exporter,
#     paginée) : la purge est refusée si ces fichiers manquent ou si leurs comptes ne correspondent plus.
if "${PY[@]}" - "${RACINE}" "${TRAVAIL}" > "${TRAVAIL}/purge.txt" 2>&1 <<'PY'
import contextlib, datetime as dt, importlib.util, io, json, os, re, sys, threading, urllib.parse
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
racine, travail = Path(sys.argv[1]), Path(sys.argv[2])
sys.dont_write_bytecode = True
reg_orga = json.load(open(racine / "organisation/registre/organisation.json", encoding="utf-8"))
ent = reg_orga["entreprise"]
DEMO, CLIENT, AUTRE = "d0000000-0000-4000-8000-000000000001", "c0000000-0000-4000-8000-000000000002", "c0000000-0000-4000-8000-000000000003"
societes = [
    {"id": DEMO, "name": ent["nom"], "description": ent["marqueur"]},
    {"id": CLIENT, "name": "Client Fictif SRL", "description": "atelier-client:fictif"},
    {"id": AUTRE, "name": "Autre Client SA", "description": "atelier-client:autre"},
]
# Tables du plugin : comptes par entreprise ; la fausse route ne touche jamais qu'une entreprise.
plugin = {CLIENT: {"prospects": 4, "clients": 2, "connaissances_index": 1, "connaissances_documents": 3, "journal": 9},
          AUTRE: {"prospects": 7, "connaissances_documents": 5}}
TABLES = ("prospects", "clients", "connaissances_index", "connaissances_documents", "journal", "corbeille")
etat = {"ordre": [], "ecritures": 0, "echec_plugin": False, "pages_export": 0}
class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def rep(self, code, corps):
        brut = json.dumps(corps).encode(); self.send_response(code); self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(brut))); self.end_headers(); self.wfile.write(brut)
    def corps(self):
        n = int(self.headers.get("Content-Length") or 0); return json.loads(self.rfile.read(n) or b"null")
    def do_GET(self):
        q = urllib.parse.urlparse(self.path)[2][len("/api"):]
        if q == "/companies": return self.rep(200, societes)
        if re.fullmatch(r"/companies/[^/]+/projects", q): return self.rep(200, [{"id": "p1", "goalIds": ["g1"]}])
        self.rep(404, {"error": q})
    def do_POST(self):
        q = urllib.parse.urlparse(self.path)[2][len("/api"):]; c = self.corps()
        if q.endswith("/exports") or q == "/companies/import/preview":
            if q.endswith("/exports"): return self.rep(200, {"files": {"COMPANY.md": "# Client\n", "agents/a/AGENTS.md": "agent\n"}, "warnings": []})
            return self.rep(200, {"plan": {}, "manifest": {}, "errors": []})
        if q == "/plugins/atelier.marketing-ia/api/donnees/export":
            comptes = {t: plugin.get(c["companyId"], {}).get(t, 0) for t in TABLES}
            if c.get("table") is None: return self.rep(200, {"companyId": c["companyId"], "total": sum(comptes.values()), "tables": comptes})
            t, d = c["table"], c.get("decalage", 0); etat["pages_export"] += 1
            # Pages de 3 lignes pour exercer la pagination ; valeur chiffrée laissée telle quelle.
            toutes = [{"company_id": c["companyId"], "rang": i, "donnees_chiffrees": {"email": f"chv1.{t}{i}"}} for i in range(comptes[t])]
            lignes = toutes[d:d + 3]; suivant = d + len(lignes) if d + len(lignes) < len(toutes) else None
            return self.rep(200, {"companyId": c["companyId"], "table": t, "total": len(toutes), "decalage": d, "limite": 3, "lignes": lignes, "suivant": suivant})
        if q == "/plugins/atelier.marketing-ia/api/donnees/purge":
            comptes = {t: plugin.get(c["companyId"], {}).get(t, 0) for t in TABLES}
            if c.get("aBlanc"): return self.rep(200, {"aBlanc": True, "supprime": False, "total": sum(comptes.values()), "tables": comptes})
            etat["ecritures"] += 1; etat["ordre"].append("plugin")
            if etat["echec_plugin"]: return self.rep(500, {"error": "base indisponible"})
            plugin[c["companyId"]] = {}
            return self.rep(200, {"aBlanc": False, "supprime": True, "total": sum(comptes.values()), "tables": comptes})
        self.rep(404, {"error": q})
    def do_PATCH(self):
        q = urllib.parse.urlparse(self.path)[2][len("/api"):]; self.corps(); etat["ecritures"] += 1; self.rep(200, {})
    def do_DELETE(self):
        q = urllib.parse.urlparse(self.path)[2][len("/api"):]; etat["ecritures"] += 1; etat["ordre"].append("socle")
        m = re.fullmatch(r"/companies/([^/]+)", q)
        societes[:] = [s_ for s_ in societes if s_["id"] != m.group(1)]; self.rep(200, {"ok": True})
serveur = HTTPServer(("127.0.0.1", 0), H); port = serveur.server_address[1]
threading.Thread(target=serveur.serve_forever, daemon=True).start()
donnees = travail / "donnees-purge"; donnees.mkdir()
home = travail / "paperclip-home"
os.environ.update({"ATELIER_API": f"http://127.0.0.1:{port}/api", "ATELIER_DONNEES_LOCALES": str(donnees),
                   "PAPERCLIP_HOME": str(home), "PAPERCLIP_INSTANCE_ID": "essai"})
spec = importlib.util.spec_from_file_location("b", racine / "scripts/bootstrap-organisation.py")
b = importlib.util.module_from_spec(spec); spec.loader.exec_module(b)
def lancer(*args):
    sortie = io.StringIO()
    with contextlib.redirect_stdout(sortie), contextlib.redirect_stderr(sortie):
        code = b.main(list(args))
    return code, sortie.getvalue()
def rien_ecrit(avant): assert etat["ecritures"] == avant and len(societes) == 3, (etat, societes)
# Fichiers disque de chaque entreprise et dossiers locaux du client.
for cid in (CLIENT, AUTRE):
    d = home / "instances" / "essai" / "companies" / cid; d.mkdir(parents=True); (d / "instructions.md").write_text("x")
for d in (donnees / "agents-atelier" / CLIENT / "coordinateur", donnees / "claude-config" / CLIENT / "coordinateur",
          donnees / "agents-atelier" / "client-fictif" / "coordinateur", donnees / "atelier-client" / "fictif",
          donnees / "agents-atelier" / AUTRE / "coordinateur", donnees / "agents-atelier" / "client-autre" / "coordinateur"):
    d.mkdir(parents=True)
(donnees / "agents-atelier" / CLIENT / "coordinateur" / "notes.md").write_text("donnée du client")
def registre(slug, cid_):
    d_ = donnees / "atelier-client" / slug; d_.mkdir(parents=True, exist_ok=True)
    (d_ / "entreprise.json").write_text(json.dumps({"entrepriseId": cid_, "numeroBce": "0123456749", "slug": slug, "creeLe": "2026-10-16T08:00:00Z"}), encoding="utf-8")
registre("fictif", CLIENT); registre("autre", AUTRE)

# 1. Sans --confirmer : refus (code non nul), aucune écriture, même sans export.
code, s = lancer("purger", "--entreprise", CLIENT)
assert code != 0 and "--confirmer" in s, (code, s); rien_ecrit(0)
# 2. UUID invalide, entreprise inconnue.
code, s = lancer("purger", "--entreprise", "pas-un-uuid", "--confirmer"); assert code != 0 and "UUID" in s, s
code, s = lancer("purger", "--entreprise", "e0000000-0000-4000-8000-000000000009", "--confirmer"); assert code != 0 and "introuvable" in s, s
rien_ecrit(0)
# 2 bis. Entreprise sans marqueur atelier-client:<slug> : refus (même à blanc) ; seule dérogation --hors-marqueur avec
#     le nom exact retapé (--nom-confirme), jamais l'un sans l'autre ; un marqueur collé à un autre mot ne compte pas.
SANS = "f0000000-0000-4000-8000-000000000005"
societes.append({"id": SANS, "name": "Société Étrangère SA", "description": "créée à la main"})
for extra in ((), ("--a-blanc",), ("--hors-marqueur",), ("--nom-confirme", "Société Étrangère SA"), ("--hors-marqueur", "--nom-confirme", "Société Etrangère SA"),
              ("--hors-marqueur", "--nom-confirme", "société étrangère sa"), ("--hors-marqueur", "--nom-confirme", "Société Étrangère SA ")):
    code, s = lancer("purger", "--entreprise", SANS, "--confirmer", *extra)
    assert code != 0 and ("marqueur atelier-client" in s or "--nom-confirme" in s) and "Rien n'a été supprimé" in s, (extra, code, s)
    assert etat["ecritures"] == 0 and len(societes) == 4, (extra, etat)
assert etat["ecritures"] == 0 and len(societes) == 4, (etat, societes)
societes[-1]["description"] = "préfixeatelier-client:fictif-faux et sans-atelier-client:x"
code, s = lancer("purger", "--entreprise", SANS, "--confirmer"); assert code != 0 and "marqueur atelier-client" in s, s
societes[-1]["description"] = "créée à la main"
# Avec le nom exact : le garde-fou passe (le refus suivant vient alors de l'absence d'export, pas du marqueur).
code, s = lancer("purger", "--entreprise", SANS, "--confirmer", "--hors-marqueur", "--nom-confirme", "Société Étrangère SA")
assert code != 0 and "marqueur" not in s and "aucun export de moins de 24 h" in s and etat["ecritures"] == 0, (code, s)
code, s = lancer("purger", "--entreprise", SANS, "--a-blanc", "--hors-marqueur", "--nom-confirme", "Société Étrangère SA")
assert code == 0 and "Entreprise à purger" in s and etat["ecritures"] == 0, (code, s)
societes.pop()
print("1 bis. entreprise sans marqueur atelier-client:<slug> : refus ; --hors-marqueur exige le nom exact ; rien d'écrit")

# 3. Démonstration (marqueur) refusée, même avec --confirmer et --a-blanc ; une entreprise portant le nom de la démonstration aussi.
for extra in ((), ("--a-blanc",)):
    code, s = lancer("purger", "--entreprise", DEMO, "--confirmer", *extra)
    assert code != 0 and "modèle" in s, (code, s); rien_ecrit(0)
societes.append({"id": "d0000000-0000-4000-8000-000000000004", "name": ent["nom"], "description": ""})
code, s = lancer("purger", "--entreprise", "d0000000-0000-4000-8000-000000000004", "--confirmer")
assert code != 0 and "modèle" in s, s
societes.pop(); rien_ecrit(0)
print("1. refus sans --confirmer, UUID invalide, entreprise inconnue, démonstration (marqueur et nom) : rien d'écrit")

# 3 bis. M2 : l'identité d'un client vient du registre local, jamais de la description (modifiable par un agent).
# a. Marqueur d'un autre client posé sur AUTRE : les dossiers locaux supprimés restent ceux d'AUTRE.
autre_soc = next(s_ for s_ in societes if s_["id"] == AUTRE); desc_autre = autre_soc["description"]
autre_soc["description"] = "atelier-client:fictif"
code, s = lancer("purger", "--entreprise", AUTRE, "--a-blanc")
ligne4 = [l for l in s.splitlines() if "4. dossiers locaux" in l][0]
assert code == 0 and "client-fictif" not in ligne4 and "atelier-client/fictif" not in ligne4 and "atelier-client/autre" in ligne4 and "client-autre" in ligne4, (code, s)
autre_soc["description"] = desc_autre
# b. Un marqueur de démonstration ajouté par un agent ne bloque plus la purge d'un client enregistré.
societes[1]["description"] = "atelier-client:fictif atelier-demo:x"
code, s = lancer("purger", "--entreprise", CLIENT, "--a-blanc"); assert code == 0 and "Entreprise à purger" in s, (code, s)
code, s = lancer("purger", "--entreprise", CLIENT, "--confirmer"); assert "modèle" not in s and "aucun export" in s, s
societes[1]["description"] = "atelier-client:fictif"; rien_ecrit(0)
# c. Une entreprise qui porte le marqueur mais n'a aucun registre : refus ; seule la dérogation humaine passe le garde-fou.
SANSREG = "f0000000-0000-4000-8000-000000000006"
societes.append({"id": SANSREG, "name": "Sans Registre SA", "description": "atelier-client:sans-registre"})
for extra in ((), ("--a-blanc",)):
    code, s = lancer("purger", "--entreprise", SANSREG, "--confirmer", *extra)
    assert code != 0 and "registre local" in s and "Rien n'a été supprimé" in s and etat["ecritures"] == 0, (extra, code, s)
code, s = lancer("purger", "--entreprise", SANSREG, "--confirmer", "--hors-marqueur", "--nom-confirme", "Sans Registre SA")
assert code != 0 and "registre local" not in s and "aucun export" in s and etat["ecritures"] == 0, (code, s)
societes.pop(); rien_ecrit(0)
print("1 ter. identité par le registre local : marqueur usurpé sans effet sur les dossiers, atelier-demo: sans effet, entreprise sans registre refusée")

# 4. Aucun export : refus avec la commande à lancer ; à blanc rend 0 mais annonce que la purge serait refusée.
code, s = lancer("purger", "--entreprise", CLIENT, "--confirmer")
assert code != 0 and "aucun export de moins de 24 h" in s and f"exporter --entreprise {CLIENT}" in s, (code, s); rien_ecrit(0)
code, s = lancer("purger", "--entreprise", CLIENT, "--a-blanc")
assert code == 0 and "ABSENT" in s and "serait refusée" in s, (code, s); rien_ecrit(0)
print("2. refus sans export (message avec la commande d'export) ; à blanc signale l'absence")

# 5. Export réel contre la fausse API : manifeste, empreintes, emplacement par défaut.
# 5 bis. Tables du socle : --pg-port obligatoire ; psql en lecture seule ; échec de psql ou compte différent des lignes lues :
#     export refusé et rien n'est écrit (aucun dossier d'export créé).
journal_psql = travail / "journal-psql.jsonl"; os.environ["FAUX_PSQL_JOURNAL"] = str(journal_psql); os.environ["PGPASSWORD"] = "mot-de-passe-d-essai"
code, s = lancer("exporter", "--entreprise", CLIENT); assert code != 0 and "--pg-port" in s, s
for mode, attendu in (("echec", "psql a échoué"), ("compte_faux", "ligne(s) lues pour un compte de")):
    os.environ["FAUX_PSQL_MODE"] = mode
    code, s = lancer("exporter", "--entreprise", CLIENT, "--pg-port", "54329")
    assert code != 0 and attendu in s and "rien n'a été écrit" in s, (mode, code, s)
    assert not (donnees / "exports" / CLIENT).exists(), "aucun dossier d'export après un refus"
os.environ.pop("FAUX_PSQL_MODE")
code, s = lancer("exporter", "--entreprise", CLIENT, "--pg-port", "54329"); assert code == 0, s
appels = [json.loads(l) for l in journal_psql.read_text().splitlines()]
assert appels and all(a["script"].startswith("BEGIN READ ONLY") and "54329" in a["argv"] and "mot-de-passe-d-essai" not in " ".join(a["argv"])
                      and a["pgpassword"] == "mot-de-passe-d-essai" for a in appels), appels
assert "Données du socle : 10 ligne(s)" in s, s
dossiers = sorted((donnees / "exports" / CLIENT).iterdir()); assert len(dossiers) == 1, dossiers
export = dossiers[0]; m = json.loads((export / "manifeste-export.json").read_text())
fichiers_plugin = {f"donnees-plugin/{t}.json" for t in TABLES}
fichiers_socle = {f"donnees-socle/{t}.json" for t in ("activity_log", "approvals", "cost_events")}
assert m["entrepriseId"] == CLIENT and set(m["fichiers"]) == {"COMPANY.md", "agents/a/AGENTS.md"} | fichiers_plugin | fichiers_socle and len(m["empreinte"]) == 64, m
lues = {t: json.loads((export / "donnees-plugin" / f"{t}.json").read_text()) for t in TABLES}
assert {t: len(v) for t, v in lues.items()} == plugin[CLIENT] | {"corbeille": 0}, lues
assert [l["rang"] for l in lues["prospects"]] == [0, 1, 2, 3] and etat["pages_export"] >= 2 + len(TABLES) - 1, (lues["prospects"], etat["pages_export"])
assert all(l["company_id"] == CLIENT and l["donnees_chiffrees"]["email"].startswith("chv1.") for v in lues.values() for l in v), "colonnes chiffrées et entreprise"
assert AUTRE not in json.dumps(lues), "aucune ligne d'une autre entreprise"
assert "Données du plugin : 19 ligne(s) dans 6 table(s)" in s, s
assert m["comptesSocle"] == {"activity_log": 5, "approvals": 2, "cost_events": 3}, m
socle = {t: json.loads((export / "donnees-socle" / f"{t}.json").read_text()) for t in ("activity_log", "approvals", "cost_events")}
assert {t: len(v) for t, v in socle.items()} == m["comptesSocle"] and all(l["company_id"] == CLIENT for v in socle.values() for l in v), socle
assert all(m["fichiers"][c] == __import__("hashlib").sha256((export / c).read_bytes()).hexdigest() for c in fichiers_socle), "empreintes SHA-256 du socle"
assert "PGPASSWORD" not in json.dumps(m) and "mot-de-passe-d-essai" not in json.dumps(m), "aucun secret au manifeste"
assert b.verifier_export_recent(CLIENT, export, dt.datetime.now(dt.timezone.utc))[0] is not None
code, s = lancer("exporter", "--entreprise", "pas-un-uuid"); assert code != 0, s
code, s = lancer("exporter"); assert code != 0 and "--sortie" in s, s
print("3. exporter --entreprise : manifeste (entreprise, date, empreintes), données du plugin paginées et chiffrées, emplacement par défaut")

# 6. Export trop ancien, modifié, ou d'une autre entreprise : refus sans écriture.
def reecrire(**champs):
    m2 = json.loads((export / "manifeste-export.json").read_text()); m2.update(champs)
    (export / "manifeste-export.json").write_text(json.dumps(m2))
original = (export / "manifeste-export.json").read_text()
vieux = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=25)).strftime("%Y-%m-%dT%H:%M:%SZ")
reecrire(exporteLe=vieux)
code, s = lancer("purger", "--entreprise", CLIENT, "--confirmer"); assert code != 0 and "trop ancien" in s, s; rien_ecrit(0)
(export / "manifeste-export.json").write_text(original)
(export / "COMPANY.md").write_text("# modifié après l'export\n")
code, s = lancer("purger", "--entreprise", CLIENT, "--confirmer"); assert code != 0 and "modifié" in s, s; rien_ecrit(0)
(export / "COMPANY.md").write_text("# Client\n")
reecrire(entrepriseId=AUTRE)
code, s = lancer("purger", "--entreprise", CLIENT, "--confirmer"); assert code != 0 and "autre entreprise" in s, s; rien_ecrit(0)
(export / "manifeste-export.json").write_text(original)
print("4. export de plus de 24 h, fichier modifié, manifeste d'une autre entreprise : refus, rien d'écrit")

# 6 bis. Export incomplet (fichier du plugin absent, comptes différents, ancien format sans données du plugin) : refus, rien d'écrit.
import shutil
def export_modifie(nom, modifier):
    d = travail / f"export-{nom}"; shutil.copytree(export, d)
    modifier(d)
    m3 = json.loads((d / "manifeste-export.json").read_text())
    m3["fichiers"] = {c: __import__("hashlib").sha256((d / c).read_bytes()).hexdigest() for c in m3["fichiers"] if (d / c).is_file()}
    m3["empreinte"] = b.empreinte_manifeste(m3["fichiers"]); (d / "manifeste-export.json").write_text(json.dumps(m3))
    return d
def sans_fichier(d): (d / "donnees-plugin/prospects.json").unlink()
def moins_de_lignes(d): (d / "donnees-plugin/prospects.json").write_text(json.dumps(json.loads((d / "donnees-plugin/prospects.json").read_text())[:3]))
def ancien_format(d): shutil.rmtree(d / "donnees-plugin")
for nom, modif, attendu in (("sans-fichier", sans_fichier, "donnees-plugin/prospects.json absent"),
                            ("moins-de-lignes", moins_de_lignes, "prospects : 3 ligne(s) exportée(s) pour 4"),
                            ("ancien-format", ancien_format, "absent de l'export")):
    d = export_modifie(nom, modif)
    code, s = lancer("purger", "--entreprise", CLIENT, "--confirmer", "--export", str(d))
    assert code != 0 and "l'export ne contient pas toutes les données du plugin" in s and attendu in s and "rien n'a été supprimé" in s, (nom, code, s)
    rien_ecrit(0); assert not list(d.glob("rapport-purge-*")) and plugin[CLIENT]["prospects"] == 4
    code, s = lancer("purger", "--entreprise", CLIENT, "--a-blanc", "--export", str(d))
    assert code == 0 and "INCOMPLET" in s and "serait refusée" in s, (nom, s)
# Les données ont changé depuis l'export (4 prospects exportés, 5 aujourd'hui) : refus aussi pour l'export par défaut.
plugin[CLIENT]["prospects"] = 5
code, s = lancer("purger", "--entreprise", CLIENT, "--confirmer")
assert code != 0 and "prospects : 4 ligne(s) exportée(s) pour 5 actuellement" in s, s; rien_ecrit(0)
plugin[CLIENT]["prospects"] = 4
# Purge reprise après un échec du socle : les tables du plugin sont déjà vidées (ou réduites), l'export en contient plus : autorisé.
for restant in (3, 0):
    plugin[CLIENT]["prospects"] = restant
    code, s = lancer("purger", "--entreprise", CLIENT, "--a-blanc")
    assert code == 0 and "la purge réelle est autorisée" in s, (restant, s); rien_ecrit(0)
plugin[CLIENT]["prospects"] = 4
# 6 ter. Données du socle absentes, incomplètes ou sans compte au manifeste : refus, rien d'écrit.
def socle_sans_fichier(d): (d / "donnees-socle/activity_log.json").unlink()
def socle_moins_de_lignes(d): (d / "donnees-socle/activity_log.json").write_text(json.dumps(json.loads((d / "donnees-socle/activity_log.json").read_text())[:4]))
def socle_sans_compte(d):
    m4 = json.loads((d / "manifeste-export.json").read_text()); m4.pop("comptesSocle"); (d / "manifeste-export.json").write_text(json.dumps(m4))
def socle_ancien_format(d): shutil.rmtree(d / "donnees-socle")
for nom, modif, attendu in (("socle-sans-fichier", socle_sans_fichier, "donnees-socle/activity_log.json absent de l'export"),
                            ("socle-moins-de-lignes", socle_moins_de_lignes, "activity_log : 4 ligne(s) dans le fichier pour 5 comptée(s)"),
                            ("socle-ancien-format", socle_ancien_format, "donnees-socle/approvals.json absent de l'export")):
    d = export_modifie(nom, modif)
    code, s = lancer("purger", "--entreprise", CLIENT, "--confirmer", "--export", str(d))
    assert code != 0 and "l'export ne contient pas le journal, les approbations et les coûts du socle" in s and attendu in s and "rien n'a été supprimé" in s, (nom, code, s)
    rien_ecrit(0); assert not list(d.glob("rapport-purge-*"))
    code, s = lancer("purger", "--entreprise", CLIENT, "--a-blanc", "--export", str(d))
    assert code == 0 and "INCOMPLET" in s and "serait refusée" in s, (nom, s)
d = travail / "export-socle-sans-compte"; shutil.copytree(export, d); socle_sans_compte(d)
code, s = lancer("purger", "--entreprise", CLIENT, "--confirmer", "--export", str(d))
assert code != 0 and "compte absent du manifeste" in s, s; rien_ecrit(0)
print("4 ter. export sans les données du socle (fichier absent, lignes en moins, compte absent) : refus, rien d'écrit")
print("4 bis. export sans les données du plugin, avec comptes différents ou périmé : refus, rien d'écrit (l'à blanc le signale)")

# 7. À blanc avec export valide : étapes, comptes par table, avertissement sur les sauvegardes, rien supprimé.
code, s = lancer("purger", "--entreprise", CLIENT, "--a-blanc")
assert code == 0 and "la purge réelle est autorisée" in s and "À blanc" in s, s
for attendu in ("1. données du plugin : 19 ligne(s) dans 5 table(s)", "prospects : 4", "connaissances_index : 1", "journal : 9", "corbeille : 0",
                "2. entreprise côté socle", "3. fichiers Paperclip", "4. dossiers locaux du client", "14 jours", "ne sont PAS modifiées"):
    assert attendu in s, (attendu, s)
rien_ecrit(0); assert plugin[CLIENT]["prospects"] == 4
assert not list(export.glob("rapport-purge-*")), "l'à blanc n'écrit aucun rapport"
print("5. à blanc : quatre étapes, comptes par table, avertissement sauvegardes ; rien supprimé, aucun rapport")

# 8. Échec du plugin : rien d'autre supprimé (entreprise, fichiers), rapport « échec », code non nul.
etat["echec_plugin"] = True
code, s = lancer("purger", "--entreprise", CLIENT, "--confirmer")
assert code != 0 and len(societes) == 3 and (home / "instances/essai/companies" / CLIENT).is_dir(), (code, s, societes)
rapport_echec = json.loads(sorted(export.glob("rapport-purge-*.json"))[0].read_text()); assert rapport_echec["statut"] == "échec", rapport_echec
for f in export.glob("rapport-purge-*.json"): f.unlink()
etat["echec_plugin"] = False; etat["ordre"].clear()
print("6. échec de la purge du plugin : entreprise et fichiers intacts, rapport « échec »")

# 9. Purge complète : ordre plugin puis socle, fichiers et dossiers locaux supprimés, autre entreprise intacte.
code, s = lancer("purger", "--entreprise", CLIENT, "--confirmer")
assert code == 0, s
assert etat["ordre"] == ["plugin", "socle"], etat["ordre"]
assert [i for i in range(1, 5) if f"[purge] étape {i}/4" in s] == [1, 2, 3, 4] and s.index("étape 1/4") < s.index("étape 2/4") < s.index("étape 3/4") < s.index("étape 4/4"), s
assert [c["id"] for c in societes if c["id"] in (CLIENT, AUTRE)] == [AUTRE], societes
assert not (home / "instances/essai/companies" / CLIENT).exists() and (home / "instances/essai/companies" / AUTRE).is_dir()
assert not (donnees / "agents-atelier" / CLIENT).exists() and not (donnees / "claude-config" / CLIENT).exists() and not (donnees / "agents-atelier/client-fictif").exists() and not (donnees / "claude-config/client-fictif").exists() and not (donnees / "atelier-client/fictif").exists()
assert (donnees / "agents-atelier" / AUTRE / "coordinateur").is_dir() and (donnees / "agents-atelier/client-autre/coordinateur").is_dir(), "dossiers locaux d'un autre client intacts"
assert plugin[CLIENT] == {} and plugin[AUTRE] == {"prospects": 7, "connaissances_documents": 5}, plugin
assert "ne sont PAS modifiées" in s and "14 jours" in s and "Rapport de purge" in s
rapports = sorted(export.glob("rapport-purge-*.json")); assert len(rapports) == 1, rapports
brut = rapports[0].read_text(encoding="utf-8"); r = json.loads(brut)
assert r["statut"] == "réussie" and r["entrepriseId"] == CLIENT and r["total"] == 19 and r["tables"]["prospects"] == 4, r
assert [e["etape"] for e in r["etapes"]] == [1, 2, 3, 4] and all(e["statut"] == "fait" for e in r["etapes"]), r["etapes"]
assert any("14 jours" in a and "PAS modifiées" in a for a in r["avertissements"]), r["avertissements"]
assert re.fullmatch(r"rapport-purge-\d{8}-\d{6}\.json", rapports[0].name) and r["debut"] <= r["fin"]
for interdit in ("Client Fictif", "client-fictif", "/home/", "/tmp/", str(travail), "donnée du client"):
    assert interdit not in brut, f"le rapport contient « {interdit} »"
print("7. purge complète : plugin puis socle, fichiers et dossiers locaux supprimés, rapport horodaté sans nom ni chemin")

# 10. Deuxième purge de la même entreprise : introuvable, rien d'écrit ; l'autre entreprise reste intacte.
avant = etat["ecritures"]
code, s = lancer("purger", "--entreprise", CLIENT, "--confirmer"); assert code != 0 and "introuvable" in s and etat["ecritures"] == avant, s
assert any(c["id"] == AUTRE for c in societes)
print("8. seconde purge de la même entreprise : introuvable, rien d'écrit ; l'autre entreprise intacte")
print("purger : 10 groupes de vérifications contre une fausse API, tous réussis")
PY
then
  ok "purger : $(tail -1 "${TRAVAIL}/purge.txt")"
else
  ko "purger"; tail -30 "${TRAVAIL}/purge.txt"
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
     && [[ "$(grep -c '^  agent ' "${TRAVAIL}/etat.txt")" -eq 14 ]] \
     && grep -q '  objectifs : 3$' "${TRAVAIL}/etat.txt" \
     && grep -q '  projets : 2$' "${TRAVAIL}/etat.txt" \
     && grep -q '  routines : 3$' "${TRAVAIL}/etat.txt"; then
    ok "état : 14 agents (13 + porte), 3 objectifs, 2 projets, 3 routines (aucun doublon)"
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
    # Deux branches : 9 producteurs -> Coordinateur ; Exigences, Tests techniques, Porte -> Responsable qualité (Relecteur).
    attendu = {n: coord for n in ("Veille", "Prospection", "Mesure", "Contenus", "SEA", "SEO local GEO", "CRM conversion",
                                  "Reseaux sociaux", "Conformite publicitaire")}
    attendu.update({n: qualite for n in ("Exigences", "Tests techniques", "Porte")})
    attendu.update({"Coordinateur": None, "Relecteur": None})
    if hierarchie != attendu:
        raise SystemExit(f"hiérarchie : écart avec les deux branches attendues : {hierarchie}")
    # Compétences du paquet (toutes celles d'organisation/skills/, recensées par le verrou
    # company-package.lock.json) + 8 intégrées vendorisées par l'export + 8 réinstallées.
    competences_paquet = len(json.loads((racine / "organisation" / "company-package.lock.json").read_text(encoding="utf-8"))["competences"])
    ok = len(agents) == 14 and len(projets) == 2 and len(routines) == 3 and len(skills) == competences_paquet + 16 \
        and all(a.get("status") == "paused" for a in agents)
    print("hiérarchie conservée :", sum(1 for v in hierarchie.values() if v) == 12)
    if not ok or sum(1 for v in hierarchie.values() if v) != 12:
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

# Confinement des agents claude_local (faille C1, 16/10/2026) : fichiers limités à l'espace de l'agent,
# réseau limité à l'API Anthropic (l'API locale est ajoutée d'office par l'adaptateur), engine cli
# obligatoire ; un registre en ACP est refusé ; .paperclip.yaml porte la même configuration.
if "${PY[@]}" - "${RACINE}" > "${TRAVAIL}/confinement.txt" 2>&1 <<'PY'
import copy, importlib.util, json, sys
from pathlib import Path
racine = Path(sys.argv[1])
spec = importlib.util.spec_from_file_location("bootstrap", racine / "scripts" / "bootstrap-organisation.py")
mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
reg = json.loads((racine / "organisation/registre/agents.json").read_text(encoding="utf-8"))
ext = mod.construire_extension(reg, {"entreprise": {"approbationHumainePourNouveauxAgents": True}, "projets": [], "routines": []})
confines = 0
for agent in reg["agents"]:
    a = ext["agents"][agent["slug"]]
    cfg = a["adapter"]["config"]
    if agent.get("deterministe"):
        if any(k in cfg for k in ("filesystemScope", "networkScope", "networkAllowlist")):
            raise SystemExit(f"{agent['slug']} : agent déterministe confiné à tort")
        continue
    attendu = {"engine": "cli", "filesystemScope": "workspace", "networkScope": "allowlist",
               "networkAllowlist": ["api.anthropic.com"]}
    obtenu = {k: cfg.get(k) for k in attendu}
    if a["adapter"]["type"] != "claude_local" or obtenu != attendu:
        raise SystemExit(f"{agent['slug']} : confinement {obtenu} au lieu de {attendu}")
    confines += 1
acp = copy.deepcopy(reg); acp["adaptateur"]["engine"] = "acp"
try:
    mod.config_adaptateur(acp["agents"][0], acp["adaptateur"])
except mod.ErreurAtelier:
    pass
else:
    raise SystemExit("engine acp accepté alors que le socle refuse le confinement en ACP")
yaml = (racine / "organisation/.paperclip.yaml").read_text(encoding="utf-8")
if yaml.count('filesystemScope: "workspace"') != confines or yaml.count('networkScope: "allowlist"') != confines:
    raise SystemExit(".paperclip.yaml non régénéré avec le confinement")
print(f"{confines} agents claude_local confinés (fichiers : espace ; réseau : api.anthropic.com)")
PY
then
  ok "confinement des agents : $(tail -1 "${TRAVAIL}/confinement.txt")"
else
  ko "confinement des agents"; cat "${TRAVAIL}/confinement.txt"
fi

# Cloisonnement entre entreprises (16/10/2026) : le même rôle a un cwd et un CLAUDE_CONFIG_DIR distincts dans
# deux entreprises, avec le même settings.json (mêmes règles deny) ; l'ancien dossier partagé par rôle n'est
# jamais déplacé ni supprimé (avertissement) ; l'identifiant d'entreprise est validé.
DONNEES_CLOISON="${TRAVAIL}/donnees-cloisonnement"
rm -rf "${DONNEES_CLOISON}"; mkdir -p "${DONNEES_CLOISON}"
if ATELIER_DONNEES_LOCALES="${DONNEES_CLOISON}" "${PY[@]}" - "${RACINE}" "${DONNEES_CLOISON}" > "${TRAVAIL}/cloisonnement.txt" 2>&1 <<'PY'
import contextlib, importlib.util, io, json, sys
from pathlib import Path
racine, donnees = Path(sys.argv[1]), Path(sys.argv[2]).resolve()
spec = importlib.util.spec_from_file_location("bootstrap", racine / "scripts" / "bootstrap-organisation.py")
b = importlib.util.module_from_spec(spec); spec.loader.exec_module(b)
reg = json.loads((racine / "organisation/registre/agents.json").read_text(encoding="utf-8"))
A, B = "aaaaaaaa-0000-4000-8000-000000000001", "bbbbbbbb-0000-4000-8000-000000000002"
# Ancien dossier partagé (disposition d'avant) : fichiers de deux entreprises mêlés, plus un fichier d'authentification.
for rac in ("agents-atelier", "claude-config"):
    (donnees / rac / "coordinateur").mkdir(parents=True)
(donnees / "agents-atelier/coordinateur/reste-entreprise-a.json").write_text("{}", encoding="utf-8")
(donnees / "agents-atelier/coordinateur/reste-entreprise-b.json").write_text("{}", encoding="utf-8")
(donnees / "claude-config/coordinateur/.credentials.json").write_text('{"jeton":"x"}', encoding="utf-8")
(donnees / "claude-config/coordinateur/.claude.json").write_text("{}", encoding="utf-8")
sortie = io.StringIO()
with contextlib.redirect_stdout(sortie):
    b.preparer_dossiers_locaux(A, reg)
    b.preparer_dossiers_locaux(B, reg)
    ecrits_a2 = b.preparer_dossiers_locaux(A, reg)
assert ecrits_a2 == 0, "deuxième passage : rien à réécrire"
roles = [a["slug"] for a in reg["agents"] if not a.get("deterministe")]
assert "coordinateur" in roles and "prospection" in roles
for role in roles:
    ea, ca = b.dossiers_agent(A, role); eb, cb = b.dossiers_agent(B, role)
    assert ea != eb and ca != cb, f"{role} : cwd ou configuration partagés entre deux entreprises"
    assert A in str(ea) and A in str(ca) and B in str(eb) and B in str(cb)
    for d in (ea, ca, eb, cb):
        assert d.is_dir() and (d.stat().st_mode & 0o777) == 0o700, f"{d} : droits"
    ja, jb = json.loads((ca / "settings.json").read_text(encoding="utf-8")), json.loads((cb / "settings.json").read_text(encoding="utf-8"))
    assert ja["permissions"]["deny"] and ja["autoMemoryEnabled"] is False, role
    assert ja["permissions"]["deny"] == jb["permissions"]["deny"], f"{role} : règles deny différentes"
    assert ja["permissions"]["allow"] == [f"Read(/{ca}/projects/**)"] and jb["permissions"]["allow"] == [f"Read(/{cb}/projects/**)"]
    # La liaison locale pointe vers les dossiers de SON entreprise.
    la = b.liaison_voulue(A, reg, role, None, "reel"); lb = b.liaison_voulue(B, reg, role, None, "reel")
    assert la["cwd"] == str(ea) and lb["cwd"] == str(eb) and la["cwd"] != lb["cwd"]
    assert la["config"]["env"]["CLAUDE_CONFIG_DIR"]["value"] == str(ca) and lb["config"]["env"]["CLAUDE_CONFIG_DIR"]["value"] == str(cb)
# Ancien dossier : intact, rien déplacé ; seule l'authentification est recopiée ; avertissement affiché.
for f in ("agents-atelier/coordinateur/reste-entreprise-a.json", "agents-atelier/coordinateur/reste-entreprise-b.json",
          "claude-config/coordinateur/.credentials.json", "claude-config/coordinateur/.claude.json"):
    assert (donnees / f).is_file(), f"ancien fichier supprimé ou déplacé : {f}"
ea, ca = b.dossiers_agent(A, "coordinateur")
assert not any(ea.iterdir()), "le nouvel espace doit rester vide"
assert (ca / ".credentials.json").is_file() and not (ca / ".claude.json").exists(), "seule l'authentification est recopiée"
assert "ancien dossier partagé laissé en place" in sortie.getvalue() and "reste-entreprise-a.json" in sortie.getvalue()
# Identifiant invalide : refus (aucun chemin construit).
for mauvais in ("", "..", "../x", "a/b", "court", "abcdefgh", "abcdefgh-1234", "AAAAAAAA-0000-4000-8000-000000000001"):
    try:
        b.dossiers_agent(mauvais, "coordinateur")
    except b.ErreurAtelier:
        pass
    else:
        raise SystemExit(f"identifiant accepté à tort : {mauvais!r}")
print(f"{len(roles)} rôles : cwd et configuration distincts par entreprise, mêmes règles deny, ancien dossier intact")
PY
then
  ok "cloisonnement des dossiers par entreprise : $(tail -1 "${TRAVAIL}/cloisonnement.txt")"
else
  ko "cloisonnement des dossiers par entreprise"; cat "${TRAVAIL}/cloisonnement.txt"
fi

echo "Bilan : ${reussis} réussi(s), ${echecs} échec(s)."
[[ "${echecs}" -eq 0 ]]
