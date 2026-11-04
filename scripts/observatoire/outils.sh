# À sourcer avec API (ex. http://127.0.0.1:<port>/api), OBS (id de l'entreprise) et PGPASSWORD définis.
: "${API:?API manquante}" "${OBS:?OBS manquant}" "${PGPASSWORD:?PGPASSWORD manquant}"
export PGOPTIONS='-c default_transaction_read_only=on' PGPASSWORD
# Clé board facultative (mode authentifié) : ~/.config/atelier/board-<port>.key, voir scripts/lib-cle-board.sh.
# shellcheck disable=SC1091
source "$(dirname "${BASH_SOURCE[0]:-$0}")/../lib-cle-board.sh"
_port_api="${API#*://*:}"; _port_api="${_port_api%%/*}"
api() { curl_atelier "${_port_api}" -s "$@"; }
sql() { psql -h 127.0.0.1 -p 54329 -U paperclip -d paperclip -At -c "$1"; }
etat() { api "$API/agents/$1" | python3 -I -c "import sys,json;d=json.load(sys.stdin);print(d['name'],d['status'],d['lifecycleState'],d['lifecycleHolds'],d['runtimeConfig']['heartbeat'].get('enabled'))"; }
activer() { api -o /dev/null -w "resume HTTP %{http_code}\n" -X POST "$API/agents/$1/resume"; sleep 7; etat "$1"
  echo "runs: $(sql "select count(*) from heartbeat_runs where company_id='$OBS'") reveils: $(sql "select count(*) from agent_wakeup_requests where company_id='$OBS'") agents: $(sql "select status||'='||count(*) from agents where company_id='$OBS' group by status" | tr '\n' ' ')"; }
mettre_en_pause() { api -o /dev/null -w "pause HTTP %{http_code}\n" -X POST "$API/agents/$1/pause"; }
