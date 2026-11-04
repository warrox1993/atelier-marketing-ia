#!/usr/bin/env bash
# Tests de scripts/deployer.sh (AFC-A5) sur une arborescence FACTICE (dépôt git jetable) : systemctl, curl, pnpm et npx
# sont des doublures qui notent leurs appels ; aucun service n'est redémarré, aucune instance n'est appelée.
# Usage : scripts/tests/tester-deployer.sh   (code 0 si tout passe)
set -uo pipefail

RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/deployer-test-XXXXXX")" || exit 1
trap 'case "${TMP}" in "${TMPDIR:-/tmp}"/deployer-test-*) rm -rf -- "${TMP}" ;; esac' EXIT
ECHECS=0; TOTAL=0
D="${TMP}/depot"; APPELS="${TMP}/appels"

verifie() {   # verifie <nom> <commande…>
  local nom="$1"; shift
  TOTAL=$((TOTAL + 1))
  if "$@" >/dev/null 2>&1; then echo "OK     ${nom}"; else echo "ECHEC  ${nom}"; ECHECS=$((ECHECS + 1)); fi
}
attendre() {   # attendre <nom> <0|non0> <fragment ou vide> <arguments de deployer.sh…> ; sortie dans ${SORTIE}
  local nom="$1" attendu="$2" fragment="$3"; shift 3
  local code
  : > "${APPELS}"
  SORTIE="$(cd "${TMP}" && "${D}/scripts/deployer.sh" "$@" 2>&1)"; code=$?
  TOTAL=$((TOTAL + 1))
  if [[ "${attendu}" == "0" && "${code}" -ne 0 ]] || [[ "${attendu}" == "non0" && "${code}" -eq 0 ]]; then
    echo "ECHEC  ${nom} : code ${code}, attendu ${attendu}"; echo "${SORTIE}" | tail -n 15 | sed 's/^/         /'; ECHECS=$((ECHECS + 1)); return
  fi
  if [[ -n "${fragment}" && "${SORTIE}" != *"${fragment}"* ]]; then
    echo "ECHEC  ${nom} : sortie sans « ${fragment} »"; echo "${SORTIE}" | tail -n 15 | sed 's/^/         /'; ECHECS=$((ECHECS + 1)); return
  fi
  echo "OK     ${nom} (code ${code})"
}
appele() { grep -qF -- "$1" "${APPELS}"; }

# Doublures : chaque appel est noté ; curl répond « ready » sauf si ${TMP}/pas-pret existe.
mkdir -p "${TMP}/bin" "${TMP}/home"
for outil in systemctl pnpm npx; do
  printf '#!/usr/bin/env bash\necho "%s $*" >> "%s"\n' "${outil}" "${APPELS}" > "${TMP}/bin/${outil}"
done
# « pnpm build » de la passerelle et de l'interface écrit une nouvelle version, comme le vrai.
cat >> "${TMP}/bin/pnpm" <<'EOF'
case "$*" in
  build) mkdir -p dist && echo "passerelle neuve" > dist/p.js ;;
  *"@paperclipai/ui build"*) mkdir -p ui/dist && echo "interface neuve" > ui/dist/i.js ;;
esac
EOF
# Lecture des runs (L3-reste) : /api/companies et /live-runs rendent ${TMP}/runs (défaut : aucun run) ;
# ${TMP}/injoignable simule une instance arrêtée (curl code 7 sur ces lectures).
cat > "${TMP}/bin/curl" <<EOF
#!/usr/bin/env bash
echo "curl \$*" >> "${APPELS}"
case "\$*" in
  */live-runs*) [[ -e "${TMP}/injoignable" ]] && exit 7
    # \${TMP}/runs-tardif : aucun run au premier contrôle, un run au second (démarré pendant la construction).
    echo x >> "${TMP}/lectures-runs"
    if [[ -e "${TMP}/runs-tardif" && \$(wc -l < "${TMP}/lectures-runs") -ge 2 ]]; then cat "${TMP}/runs-tardif"; exit 0; fi
    cat "${TMP}/runs" 2>/dev/null || echo '[]'; exit 0 ;;
  */api/companies*) [[ -e "${TMP}/injoignable" ]] && exit 7; echo '[{"id":"c1","name":"Essai","status":"active"}]'; exit 0 ;;
esac
[[ -e "${TMP}/pas-pret" ]] && { echo '{"status":"starting"}'; exit 0; }
echo '[{"status":"ready"}]'
EOF
chmod +x "${TMP}/bin/"*
export PATH="${TMP}/bin:${PATH}" HOME="${TMP}/home" ATELIER_DEPLOI_DELAI=2

# Dépôt factice : le vrai deployer.sh et sa bibliothèque, des vérifications et une construction factices.
mkdir -p "${D}/scripts" "${D}/plugin-atelier" "${D}/passerelle" "${D}/paperclip/ui" "${D}/instance/plugin-jb/dist"
command cp -f "${RACINE}/scripts/deployer.sh" "${RACINE}/scripts/lib-cle-board.sh" "${D}/scripts/"
printf 'print("organisation ok")\n' > "${D}/scripts/verifier-organisation.py"
printf 'import sys\nprint("generer ok")\n' > "${D}/scripts/bootstrap-organisation.py"
printf '#!/usr/bin/env bash\necho config ok\n' > "${D}/scripts/verifier-config.sh"; chmod +x "${D}/scripts/verifier-config.sh"
cat > "${D}/plugin-atelier/esbuild.config.mjs" <<'EOF'
import { mkdirSync, writeFileSync } from "node:fs";
mkdirSync("dist", { recursive: true }); writeFileSync("dist/m.js", "plugin neuf\n");
EOF
mkdir -p "${D}/plugin-atelier/migrations"; echo '{}' > "${D}/plugin-atelier/package.json"; echo m > "${D}/plugin-atelier/migrations/1.sql"
printf '/instance/\n/plugin-atelier/dist/\n/passerelle/dist/\n/paperclip/\n' > "${D}/.gitignore"
git -C "${D}" init -q && git -C "${D}" add -A && git -C "${D}" -c user.name=t -c user.email=t@t commit -qm init
git -C "${D}/paperclip" init -q && echo x > "${D}/paperclip/ui/x" && git -C "${D}/paperclip" add -A \
  && git -C "${D}/paperclip" -c user.name=t -c user.email=t@t commit -qm init
# Version en place (à remettre en cas de retour arrière).
echo "plugin ancien" > "${D}/instance/plugin-jb/dist/m.js"
mkdir -p "${D}/passerelle/dist" "${D}/paperclip/ui/dist"
echo "passerelle ancienne" > "${D}/passerelle/dist/p.js"; echo "interface ancienne" > "${D}/paperclip/ui/dist/i.js"

attendre "essai : rien n'est exécuté"                        0    "systemctl --user restart atelier-instance@atelier" --essai
verifie  "essai : aucune doublure appelée"                    test ! -s "${APPELS}"
verifie  "essai : passerelle 3190 par défaut"                 bash -c '[[ "$1" == *"atelier-passerelle@3190"* ]]' _ "${SORTIE}"
verifie  "essai : plus d'arrêt hors systemd"                  bash -c '[[ "$1" != *lancer-instance* && "$1" != *arreter-instance* && "$1" != *setsid* ]]' _ "${SORTIE}"
attendre "option inconnue refusée"                           non0 "option inconnue"   --nimporte
attendre "--journaux obligatoire hors essai"                 non0 "--journaux"

# Fichiers non suivis tolérés ; une modification suivie refuse.
echo bruit > "${D}/non-suivi.txt"; mkdir -p "${D}/paperclip/packages/.claude"; echo b > "${D}/paperclip/packages/.claude/x"
attendre "déploiement nominal (non suivis tolérés)"          0    "Instance 3100 prête" --journaux "${TMP}/j1"
verifie  "tests du plugin lancés"                             appele "npx tsc --noEmit"
verifie  "suite du plugin lancée"                             appele "npx vitest run"
verifie  "tests de la passerelle lancés"                      appele "pnpm typecheck"
verifie  "suite de la passerelle lancée"                      appele "pnpm exec vitest run"
verifie  "passerelle construite"                              appele "pnpm build"
verifie  "redémarrage de l'instance par systemd"              appele "systemctl --user restart atelier-instance@atelier"
verifie  "redémarrage de la passerelle par systemd"           grep -q "systemctl --user restart .*atelier-passerelle@3190" "${APPELS}"
verifie  "plugin neuf copié"                                  grep -qx "plugin neuf" "${D}/instance/plugin-jb/dist/m.js"
verifie  "version d'avant gardée pour le retour arrière"      bash -c 'grep -qx "plugin ancien" "$1"/instance/deploiements/avant-*/plugin-jb/dist/m.js' _ "${D}"
verifie  "passerelle d'avant gardée"                          bash -c 'grep -qx "passerelle ancienne" "$1"/instance/deploiements/avant-*/passerelle-dist/p.js' _ "${D}"
echo modifie >> "${D}/scripts/verifier-config.sh"
attendre "modification suivie refusée"                       non0 "non propre"        --journaux "${TMP}/j2"
verifie  "refus : aucun redémarrage"                          bash -c '! grep -q systemctl "$1"' _ "${APPELS}"
git -C "${D}" checkout -q -- scripts/verifier-config.sh

# Instance pas prête : retour arrière automatique vers la version d'avant, puis code 1.
sleep 1
echo "plugin ancien" > "${D}/instance/plugin-jb/dist/m.js"; echo "passerelle ancienne" > "${D}/passerelle/dist/p.js"
echo "interface ancienne" > "${D}/paperclip/ui/dist/i.js"
touch "${TMP}/pas-pret"
attendre "instance pas prête : retour arrière"               non0 "RETOUR ARRIÈRE"    --journaux "${TMP}/j3" --sans-tests
verifie  "retour arrière : plugin d'avant remis"              grep -qx "plugin ancien" "${D}/instance/plugin-jb/dist/m.js"
verifie  "retour arrière : passerelle d'avant remise"         grep -qx "passerelle ancienne" "${D}/passerelle/dist/p.js"
verifie  "retour arrière : interface d'avant remise"          grep -qx "interface ancienne" "${D}/paperclip/ui/dist/i.js"
verifie  "retour arrière : redémarrage par systemd"           bash -c '[[ $(grep -c "systemctl --user restart atelier-instance@atelier" "$1") -eq 2 ]]' _ "${APPELS}"
rm -f "${TMP}/pas-pret"

# L3-reste : jamais d'arrêt de l'instance pendant un run ; une tâche seulement en file d'attente n'empêche rien.
echo '[{"id":"r1","status":"running","agentName":"Veille"}]' > "${TMP}/runs"
echo "plugin ancien" > "${D}/instance/plugin-jb/dist/m.js"
attendre "run en cours : déploiement refusé"                 non0 "run(s) en cours"   --journaux "${TMP}/j5" --sans-tests
verifie  "run en cours : agent nommé"                         bash -c '[[ "$1" == *Veille* ]]' _ "${SORTIE}"
verifie  "run en cours : aucun redémarrage"                   bash -c '! grep -q "systemctl" "$1"' _ "${APPELS}"
verifie  "run en cours : plugin en place intact"              grep -qx "plugin ancien" "${D}/instance/plugin-jb/dist/m.js"
verifie  "run en cours : runs lus par entreprise"             grep -q "/api/companies/c1/live-runs" "${APPELS}"
echo '[{"id":"r2","status":"queued","agentName":"Veille"}]' > "${TMP}/runs"
attendre "run seulement en file : déploiement permis"        0    "Instance 3100 prête" --journaux "${TMP}/j6" --sans-tests
echo 'pas du json' > "${TMP}/runs"
attendre "état des runs illisible : refus par prudence"      non0 "illisible"         --journaux "${TMP}/j7" --sans-tests
rm -f "${TMP}/runs"; touch "${TMP}/injoignable"
attendre "instance injoignable (arrêtée) : déploiement permis" 0  "aucun run"         --journaux "${TMP}/j8" --sans-tests
rm -f "${TMP}/injoignable"
echo "plugin ancien" > "${D}/instance/plugin-jb/dist/m.js"; echo "passerelle ancienne" > "${D}/passerelle/dist/p.js"
echo "interface ancienne" > "${D}/paperclip/ui/dist/i.js"
echo '[{"id":"r3","status":"running","agentName":"Coordinateur"}]' > "${TMP}/runs-tardif"; rm -f "${TMP}/lectures-runs"
attendre "run démarré pendant la construction : refus"        non0 "run(s) en cours"   --journaux "${TMP}/j9" --sans-tests
verifie  "run tardif : aucun redémarrage"                     bash -c '! grep -q "systemctl" "$1"' _ "${APPELS}"
verifie  "run tardif : plugin d'avant remis"                  grep -qx "plugin ancien" "${D}/instance/plugin-jb/dist/m.js"
verifie  "run tardif : passerelle d'avant remise"             grep -qx "passerelle ancienne" "${D}/passerelle/dist/p.js"
verifie  "run tardif : interface d'avant remise"              grep -qx "interface ancienne" "${D}/paperclip/ui/dist/i.js"
rm -f "${TMP}/runs-tardif"
rm -f "${TMP}/injoignable"
attendre "essai : contrôle des runs affiché"                 0    "live-runs"         --essai
attendre "--sans-tests averti"                               0    "AVERTISSEMENT"     --journaux "${TMP}/j4" --sans-tests
verifie  "--sans-tests : aucune suite lancée"                 bash -c '! grep -q "vitest" "$1"' _ "${APPELS}"

echo "---"; echo "${TOTAL} tests, ${ECHECS} échec(s)"
[[ "${ECHECS}" -eq 0 ]]
