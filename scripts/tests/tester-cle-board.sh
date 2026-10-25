#!/usr/bin/env bash
# Tests de la clé board facultative des scripts (mode authentifié) : scripts/lib-cle-board.sh (curl_atelier) et
# lire_cle_fichier / ajouter_cle_tableau des scripts Python (bootstrap-organisation.py, releve-couts.py,
# declarer-services.py). Un petit serveur local renvoie l'en-tête Authorization reçu ; HOME est un dossier
# temporaire : la vraie clé de l'utilisateur n'est jamais lue. Usage : scripts/tests/tester-cle-board.sh
set -uo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
T="$(mktemp -d)"
ECHECS=0
ok() { echo "OK   $*"; }
ko() { echo "ÉCHEC $*"; ECHECS=$((ECHECS + 1)); }
attendre_egal() { if [[ "$2" == "$3" ]]; then ok "$1"; else ko "$1 (attendu « $3 », obtenu « $2 »)"; fi; }

# Serveur d'écho : GET → {"auth": "<en-tête Authorization ou vide>"}
cat > "${T}/echo.py" <<'PY'
import http.server, json, sys
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        corps = json.dumps({"auth": self.headers.get("Authorization") or ""}).encode()
        self.send_response(200); self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(corps)
    def log_message(self, *a): pass
s = http.server.HTTPServer(("127.0.0.1", 0), H)
print(s.server_address[1], flush=True)
s.serve_forever()
PY
coproc SERVEUR { python3 -I "${T}/echo.py"; }
read -r PORT <&"${SERVEUR[0]}"
trap 'kill "${SERVEUR_PID}" 2>/dev/null; rm -rf "${T}"' EXIT

export HOME="${T}/maison"
unset ATELIER_CLE_BOARD_FICHIER PAPERCLIP_BOARD_KEY
mkdir -p "${HOME}/.config/atelier"
CLE_FICHIER="${HOME}/.config/atelier/board-${PORT}.key"
CLE="pcp_board_$(printf '0%.0s' {1..48})"
# shellcheck disable=SC1091
source "${RACINE}/scripts/lib-cle-board.sh"

auth_curl() { curl_atelier "${PORT}" -fsS "http://127.0.0.1:${PORT}/api/x" 2>"${T}/err" | python3 -I -c 'import json,sys;print(json.load(sys.stdin)["auth"])'; }
auth_py() {  # $1 = bootstrap | releve
  python3 -I - "$1" "${RACINE}" "${PORT}" <<'PY' 2>"${T}/err"
import importlib.util, sys, json
quoi, racine, port = sys.argv[1:4]
fichier = {"bootstrap": "bootstrap-organisation.py", "releve": "releve-couts.py", "declarer": "declarer-services.py"}[quoi]
spec = importlib.util.spec_from_file_location("m", f"{racine}/scripts/{fichier}")
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
url = f"http://127.0.0.1:{port}/api"
if quoi == "bootstrap":
    print(m.Api(url).appel("GET", "/x")["auth"])
elif quoi == "releve":
    print(m.appeler_api(url, "/x")["auth"])
else:
    import urllib.request
    with m.ouvrir(urllib.request.Request(url + "/x"), timeout=10) as r:
        print(json.load(r)["auth"])
PY
}

# 1. Sans fichier : aucune clé (mode local_trusted, comportement historique).
attendre_egal "curl sans fichier : pas d'en-tête" "$(auth_curl)" ""
for q in bootstrap releve declarer; do attendre_egal "${q} sans fichier : pas d'en-tête" "$(auth_py "${q}")" ""; done

# 2. Fichier 0600 : clé envoyée, jamais dans les arguments de curl.
( umask 077; printf '%s\n' "${CLE}" > "${CLE_FICHIER}" )
attendre_egal "curl avec fichier 0600 : clé envoyée" "$(auth_curl)" "Bearer ${CLE}"
for q in bootstrap releve declarer; do attendre_egal "${q} avec fichier 0600 : clé envoyée" "$(auth_py "${q}")" "Bearer ${CLE}"; done
if grep -q -- "${CLE}" <(declare -f curl_atelier); then ko "la clé apparaît dans le texte de curl_atelier"; else ok "curl_atelier ne contient aucune clé"; fi

# 3. La variable PAPERCLIP_BOARD_KEY garde la priorité dans les scripts Python.
attendre_egal "bootstrap : PAPERCLIP_BOARD_KEY prioritaire" "$(PAPERCLIP_BOARD_KEY=pcp_board_env_0123456789abcdef auth_py bootstrap)" "Bearer pcp_board_env_0123456789abcdef"

# 4. Fichier ouvert au groupe ou aux autres : ignoré, avec avertissement.
chmod 644 "${CLE_FICHIER}"
attendre_egal "curl, fichier 0644 : ignoré" "$(auth_curl)" ""
grep -q "ignoré" "${T}/err" && ok "curl, fichier 0644 : avertissement" || ko "curl, fichier 0644 : pas d'avertissement"
attendre_egal "bootstrap, fichier 0644 : ignoré" "$(auth_py bootstrap)" ""
grep -q "ignoré" "${T}/err" && ok "bootstrap, fichier 0644 : avertissement" || ko "bootstrap, fichier 0644 : pas d'avertissement"

# 5. Contenu invalide (espaces, guillemets) : ignoré.
chmod 600 "${CLE_FICHIER}"; printf 'cle "invalide" ; rm -rf /\n' > "${CLE_FICHIER}"
attendre_egal "curl, contenu invalide : ignoré" "$(auth_curl)" ""
attendre_egal "bootstrap, contenu invalide : ignoré" "$(auth_py bootstrap)" ""

# 6. Fichier d'un autre port : jamais envoyé à cette instance.
rm -f "${CLE_FICHIER}"; ( umask 077; printf '%s\n' "${CLE}" > "${HOME}/.config/atelier/board-1.key" )
attendre_egal "curl, clé d'une autre instance : pas envoyée" "$(auth_curl)" ""
attendre_egal "bootstrap, clé d'une autre instance : pas envoyée" "$(auth_py bootstrap)" ""

# 7. ATELIER_CLE_BOARD_FICHIER désigne explicitement le fichier.
export ATELIER_CLE_BOARD_FICHIER="${HOME}/.config/atelier/board-1.key"
attendre_egal "curl, ATELIER_CLE_BOARD_FICHIER : clé envoyée" "$(auth_curl)" "Bearer ${CLE}"
attendre_egal "bootstrap, ATELIER_CLE_BOARD_FICHIER : clé envoyée" "$(auth_py bootstrap)" "Bearer ${CLE}"

# 8. Surcharge du mode authentifié (scripts/lib-mode-auth.sh) : liste blanche stricte.
# shellcheck disable=SC1091
source "${RACINE}/scripts/lib-mode-auth.sh"
S="${T}/atelier-auth.env"
printf 'PAPERCLIP_DEPLOYMENT_MODE=authenticated\nPAPERCLIP_DEPLOYMENT_EXPOSURE=private\n' > "${S}"
verifier_surcharge_auth "${S}" 2>/dev/null && ok "surcharge minimale acceptée" || ko "surcharge minimale refusée"
printf 'PAPERCLIP_AUTH_DISABLE_SIGN_UP=true\n' >> "${S}"
( exporter_surcharge_auth "${S}" >/dev/null && [[ "${PAPERCLIP_DEPLOYMENT_MODE}" == authenticated && "${PAPERCLIP_AUTH_DISABLE_SIGN_UP}" == true ]] ) \
  && ok "surcharge exportée (mode et inscriptions fermées)" || ko "surcharge non exportée"
for mauvais in 'PAPERCLIP_DEPLOYMENT_EXPOSURE=public' 'PAPERCLIP_BIND=lan' 'PAPERCLIP_AUTH_DISABLE_SIGN_UP=false' 'export X=1' 'PAPERCLIP_DEPLOYMENT_MODE=$(id)'; do
  printf 'PAPERCLIP_DEPLOYMENT_MODE=authenticated\nPAPERCLIP_DEPLOYMENT_EXPOSURE=private\n%s\n' "${mauvais}" > "${S}"
  verifier_surcharge_auth "${S}" 2>/dev/null && ko "surcharge acceptée à tort : ${mauvais}" || ok "surcharge refusée : ${mauvais}"
done
printf 'PAPERCLIP_DEPLOYMENT_EXPOSURE=private\n' > "${S}"
verifier_surcharge_auth "${S}" 2>/dev/null && ko "surcharge sans mode acceptée" || ok "surcharge sans mode refusée"

echo "---"
if (( ECHECS > 0 )); then echo "${ECHECS} échec(s)."; exit 1; fi
echo "Tous les contrôles de la clé board passent."
