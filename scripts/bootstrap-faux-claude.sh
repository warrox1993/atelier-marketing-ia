#!/usr/bin/env bash
# Faux exécutable « claude » pour la sonde du lot B (scripts/bootstrap-sonde-competences.py).
# Il n'appelle AUCUN modèle : il enregistre ce que l'adaptateur claude_local lui transmet
# (arguments, variables utiles, compétences montées par --add-dir avec leurs empreintes),
# puis répond par un flux stream-json minimal que l'adaptateur sait lire.
# --version et --help sont délégués au vrai claude (aucun appel de modèle) pour que la
# détection des capacités de la CLI se comporte comme en réel.
set -uo pipefail

case "${1:-}" in
  --version|--help) exec claude "$@" ;;
esac

SORTIE="${ATELIER_SONDE_SORTIE:?ATELIER_SONDE_SORTIE manquant}"
mkdir -p "${SORTIE}"
printf '%s\n' "$@" > "${SORTIE}/argv.txt"
cat > "${SORTIE}/prompt.txt"

{
  for v in CLAUDE_CONFIG_DIR DISABLE_TELEMETRY CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC \
           PAPERCLIP_AGENT_ID PAPERCLIP_COMPANY_ID PAPERCLIP_RUN_ID PAPERCLIP_API_URL; do
    printf '%s=%s\n' "${v}" "${!v-<absente>}"
  done
  # Jamais la valeur d'un secret : seulement sa présence.
  for v in CLAUDE_CODE_OAUTH_TOKEN ANTHROPIC_API_KEY PAPERCLIP_API_KEY; do
    valeur="${!v-}"
    if [[ -n "${valeur}" ]]; then printf '%s=<présente, %s caractères>\n' "${v}" "${#valeur}"; else printf '%s=<absente>\n' "${v}"; fi
  done
  printf 'cwd=%s\n' "${PWD}"
} > "${SORTIE}/env.txt"

# Répertoire passé par --add-dir.
AJOUT=""
precedent=""
for a in "$@"; do
  [[ "${precedent}" == "--add-dir" ]] && AJOUT="${a}"
  precedent="${a}"
done
printf '%s\n' "${AJOUT}" > "${SORTIE}/add-dir.txt"

if [[ -n "${AJOUT}" && -d "${AJOUT}/.claude/skills" ]]; then
  # Même algorithme d'empreinte que company-package.lock.json : chemins relatifs triés
  # et contenus, liens symboliques suivis.
  python3 -I - "${AJOUT}/.claude/skills" > "${SORTIE}/competences.json" <<'PY'
import hashlib, json, os, sys
racine = sys.argv[1]
sortie = {}
for nom in sorted(os.listdir(racine)):
    dossier = os.path.join(racine, nom)
    if not os.path.isdir(dossier):
        continue
    fichiers = []
    for base, _, noms in os.walk(dossier, followlinks=True):
        for n in noms:
            fichiers.append(os.path.relpath(os.path.join(base, n), dossier).replace(os.sep, "/"))
    h = hashlib.sha256()
    for rel in sorted(fichiers):
        h.update(rel.encode() + b"\0")
        with open(os.path.join(dossier, rel), "rb") as f:
            h.update(f.read() + b"\0")
    sortie[nom] = {"lien": os.path.realpath(dossier), "sha256": h.hexdigest(), "fichiers": sorted(fichiers)}
json.dump(sortie, sys.stdout, ensure_ascii=False, indent=2)
PY
fi

printf '%s\n' '{"type":"system","subtype":"init","session_id":"sonde-lot-b","model":"aucun","tools":[]}'
printf '%s\n' '{"type":"result","subtype":"success","is_error":false,"result":"Sonde du lot B : aucun modèle appelé.","session_id":"sonde-lot-b","total_cost_usd":0,"usage":{"input_tokens":0,"output_tokens":0}}'
exit 0
